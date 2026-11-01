import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { AxeResults } from "axe-core";
import { normalizeAxeResults } from "../../scanner/normalize.js";
import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";

/**
 * Phase 8 — base page probe: automated axe-core scan plus keyboard
 * reachability facts. Applies to every visited page. Uses the existing
 * deterministic local axe integration (no CDN, no model calls); findings
 * are reported as the browser measured them.
 */

async function loadLocalAxeSource(): Promise<string> {
  const require = createRequire(import.meta.url);
  const axePath = require.resolve("axe-core/axe.min.js");
  return readFile(axePath, "utf8");
}

function severityRank(impact: string | null): number {
  if (impact === "critical") return 4;
  if (impact === "serious") return 3;
  if (impact === "moderate") return 2;
  if (impact === "minor") return 1;
  return 0;
}

const STANDARD_URLS: Record<string, string> = {
  wcag2a: "https://www.w3.org/TR/WCAG21/#a",
  wcag2aa: "https://www.w3.org/TR/WCAG21/#aa",
};

interface MeasuredBox {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  role: string;
  name: string;
}

/**
 * Runs inside the page: measures viewport-relative boxes for the exact
 * selectors axe reported. Returns null per selector when the element is
 * missing or has no rendered area — never guessed coordinates.
 */
export function measureSelectors(selectors: string[]): (MeasuredBox | null)[] {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return selectors.map((selector) => {
    let el: Element | null = null;
    try {
      el = document.querySelector(selector);
    } catch {
      el = null;
    }
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const tag = el.tagName.toLowerCase();
    const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0] ?? "";
    let role = explicit;
    if (role === "") {
      if (tag === "button") role = "button";
      else if (tag === "a" && el.hasAttribute("href")) role = "link";
      else if (tag === "img") role = "image";
      else if (tag === "input" || tag === "select" || tag === "textarea") role = "field";
      else role = tag;
    }
    // Structural elements have no meaningful visible text (their textContent
    // is script/style noise) — leave them unnamed so labels fall back to role.
    const textual = tag !== "html" && tag !== "head" && tag !== "body" && tag !== "title" && tag !== "script" && tag !== "style";
    const text = textual ? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const name =
      el.getAttribute("aria-label")?.trim() ||
      text ||
      (el instanceof HTMLImageElement ? el.alt : "") ||
      (el instanceof HTMLInputElement ? el.value || el.placeholder || el.type : "");
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      viewportWidth,
      viewportHeight,
      role,
      name: name.slice(0, 80),
    };
  });
}

export function labelOf(measured: MeasuredBox): string {
  return measured.name !== "" ? `"${measured.name}" ${measured.role}` : measured.role;
}

export const axeProbe: AccessibilityProbe = {
  id: "page-axe-scan",

  applicable: () => true,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    trace.record("axe-scan-started", "Running automated accessibility checks in the page.");

    await ctx.page.addScriptTag({ content: await loadLocalAxeSource() });
    const axeResults = await ctx.page.evaluate((timeout: number) => {
      const win = window as unknown as {
        axe: { run: (context: unknown, options: { timeout: number }) => Promise<AxeResults> };
      };
      return win.axe.run(document, { timeout });
    }, 30_000);
    trace.record("axe-scan-finished", `Checked ${axeResults.violations.length} rule violations.`);

    const scan = normalizeAxeResults({
      axeResults,
      pageUrl: ctx.pageUrl,
      scanId: `${ctx.targetId}-axe`,
      startedAt,
      completedAt: new Date().toISOString(),
    });

    const screenshot = await ctx.captureScreenshot("page-loaded", null);
    const screenshots = screenshot === null ? [] : [screenshot];

    // Measure real geometry for every reported node in one in-page pass.
    // Same scroll position as the screenshot above, so boxes align.
    const uniqueSelectors = [...new Set(scan.findings.map((finding) => finding.selector))];
    let measured: (MeasuredBox | null)[] = uniqueSelectors.map(() => null);
    try {
      measured = await ctx.page.evaluate(measureSelectors, uniqueSelectors);
    } catch {
      measured = uniqueSelectors.map(() => null);
    }
    const boxBySelector = new Map<string, MeasuredBox | null>(
      uniqueSelectors.map((selector, index) => [selector, measured[index] ?? null]),
    );
    const shotBySelector = new Map<string, string>();
    // An offscreen box cannot be highlighted on the initial viewport capture.
    // Record a bounded extra viewport and measure again at that exact scroll.
    const originalScroll = await ctx.page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    try {
      for (const selector of uniqueSelectors.slice(0, 50)) {
        ctx.checkCancelled();
        const box = boxBySelector.get(selector);
        if (box == null || (box.y >= 0 && box.y + box.height <= box.viewportHeight
          && box.x >= 0 && box.x + box.width <= box.viewportWidth)) continue;
        try {
          await ctx.page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 1000 });
          const [visible] = await ctx.page.evaluate(measureSelectors, [selector]);
          if (visible == null) continue;
          const shot = await ctx.captureScreenshot("axe-element", null);
          if (shot === null) break; // The existing screenshot budget remains authoritative.
          screenshots.push(shot);
          boxBySelector.set(selector, visible);
          shotBySelector.set(selector, shot);
        } catch {
          // Keep the finding, without claiming an unrecorded visual location.
        }
      }
    } finally {
      await ctx.page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), originalScroll);
    }

    if (scan.findings.length === 0) {
      trace.record("axe-clean", "No automated rule violations on this page.");
      return buildProbeResult({
        probeId: "page-axe-scan",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "passed",
        title: "Automated accessibility checks passed on this page.",
        humanSummary: `Automated checks ran against this page and reported no rule violations. This covers common issues only — it does not mean the page is fully accessible.`,
        severity: "info",
        actionTrace: trace.steps,
        screenshots,
        standardReferences: [STANDARD_URLS["wcag2a"] ?? ""],
        startedAt,
      });
    }

    let worst = 0;
    const ruleIds = new Set<string>();
    for (const finding of scan.findings) {
      ruleIds.add(finding.ruleId);
      worst = Math.max(worst, severityRank(finding.impact));
    }
    const topRules = [...ruleIds].slice(0, 5).join(", ");
    const severity = worst >= 4 ? "critical" : worst >= 3 ? "serious" : worst >= 2 ? "moderate" : "minor";

    return buildProbeResult({
      probeId: "page-axe-scan",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: "failed",
      title: `Automated checks found ${scan.findings.length} accessibility ${scan.findings.length === 1 ? "problem" : "problems"} on this page.`,
      humanSummary:
        `Automated accessibility checks reported ${scan.findings.length} problems ` +
        `across ${ruleIds.size} ${ruleIds.size === 1 ? "rule" : "rules"} (${topRules}). ` +
        `Each one below names the element and the rule it breaks.`,
      severity,
      evidence: scan.findings.slice(0, 50).map((finding) => {
        const box = boxBySelector.get(finding.selector) ?? null;
        return {
          kind: "axe-violation",
          summary: `${finding.help} — ${finding.selector || "page"}`,
          data: {
            ruleId: finding.ruleId,
            impact: finding.impact,
            help: finding.help,
            helpUrl: finding.helpUrl,
            selector: finding.selector,
            html: finding.html,
            failureSummary: finding.failureSummary,
            box,
            boxLabel: box === null ? "" : labelOf(box),
            screenshot: shotBySelector.get(finding.selector) ?? screenshot,
          },
        };
      }),
      actionTrace: trace.steps,
      screenshots,
      standardReferences: [STANDARD_URLS["wcag2aa"] ?? ""],
      startedAt,
    });
  },
};
