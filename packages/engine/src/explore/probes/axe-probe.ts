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
      evidence: scan.findings.slice(0, 50).map((finding) => ({
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
        },
      })),
      actionTrace: trace.steps,
      screenshots,
      standardReferences: [STANDARD_URLS["wcag2aa"] ?? ""],
      startedAt,
    });
  },
};
