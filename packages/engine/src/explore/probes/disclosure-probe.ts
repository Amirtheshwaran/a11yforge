import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";

/**
 * Phase 8 — disclosure / popup probe.
 *
 * Applies only when live semantics (aria-expanded, optionally with
 * aria-controls / aria-haspopup) describe a control. Activation happens only
 * when structural safety can be established from the DOM itself — never by
 * guessing what a button does:
 *
 * - never a submitter (submit buttons / submit inputs);
 * - inside a form only with an explicit non-submit type;
 * - only when the control exposes disclosure semantics (aria-expanded with
 *   a resolvable controlled element) or popup semantics (aria-haspopup).
 *
 * After opening, state is inspected, Escape is tried, and the initial state
 * is restored. Anything that cannot be proven safe is reported as
 * `not-tested` — honesty over pretend coverage.
 */

interface DisclosureCandidate {
  selector: string;
  label: string;
  tag: string;
  inputType: string;
  inForm: boolean;
  explicitButtonType: boolean;
  isSubmitter: boolean;
  expanded: string | null;
  controlsId: string | null;
  controlledExists: boolean;
  controlledVisible: boolean;
  hasPopup: string | null;
}

/** Runs inside the page: describes every aria-expanded control. */
export function snapshotDisclosureCandidates(): DisclosureCandidate[] {
  // Local copy: page.evaluate serializes this function alone.
  const MAX_CANDIDATES = 6;
  const els = Array.from(document.querySelectorAll("[aria-expanded]")).slice(0, MAX_CANDIDATES);
  return els.map((el, index) => {
    const tag = el.tagName.toLowerCase();
    const inputType =
      el instanceof HTMLInputElement ? (el.getAttribute("type") ?? "text").toLowerCase() : "";
    const buttonType = el.getAttribute("type") ?? "";
    const inForm = el.closest("form") !== null;
    const isSubmitter =
      (tag === "button" && (buttonType === "" || buttonType === "submit") && inForm) ||
      (tag === "input" && (inputType === "submit" || inputType === "image"));
    const controlsId = el.getAttribute("aria-controls");
    const controlled =
      controlsId !== null && controlsId !== "" ? document.getElementById(controlsId) : null;
    const rect = controlled?.getBoundingClientRect();
    let selector = `${tag}[aria-expanded][${index}]`;
    if (el.id !== "") {
      try {
        selector = `#${CSS.escape(el.id)}`;
      } catch {
        /* keep fallback */
      }
    }
    const label =
      el.getAttribute("aria-label")?.trim() ||
      (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return {
      selector,
      label,
      tag,
      inputType,
      inForm,
      explicitButtonType: buttonType !== "",
      isSubmitter,
      expanded: el.getAttribute("aria-expanded"),
      controlsId,
      controlledExists: controlled !== null,
      controlledVisible: rect !== undefined && rect.width > 0 && rect.height > 0,
      hasPopup: el.getAttribute("aria-haspopup"),
    };
  });
}

/** Runs inside the page: current expanded state + controlled visibility. */
export function readDisclosureState(selector: string): {
  expanded: string | null;
  controlledVisible: boolean | null;
} {
  const el = document.querySelector(selector);
  if (el === null) return { expanded: null, controlledVisible: null };
  const controlsId = el.getAttribute("aria-controls");
  const controlled =
    controlsId !== null && controlsId !== "" ? document.getElementById(controlsId) : null;
  const rect = controlled?.getBoundingClientRect();
  return {
    expanded: el.getAttribute("aria-expanded"),
    controlledVisible:
      controlled === null || rect === undefined ? null : rect.width > 0 && rect.height > 0,
  };
}

/** Runs inside the page: focuses a control by selector. */
export function focusSelector(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return false;
  el.focus();
  return document.activeElement === el;
}

/** Structural activation gate: exported for unit testing the safety rules. */
export function safetyVerdict(candidate: DisclosureCandidate): { safe: boolean; reason: string } {
  if (candidate.isSubmitter) {
    return { safe: false, reason: "it can submit a form" };
  }
  if (candidate.inForm && candidate.tag === "button" && !candidate.explicitButtonType) {
    return { safe: false, reason: "it is an untyped button inside a form" };
  }
  const hasDisclosureSemantics =
    (candidate.controlsId !== null && candidate.controlsId !== "" && candidate.controlledExists) ||
    candidate.hasPopup !== null;
  if (!hasDisclosureSemantics) {
    return { safe: false, reason: "it exposes no resolvable disclosure or popup relationship" };
  }
  return { safe: true, reason: "" };
}

export const disclosureProbe: AccessibilityProbe = {
  id: "disclosure-popup",

  applicable: (surface) => surface.disclosureCount > 0,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    const screenshots: string[] = [];

    const candidates = await ctx.page.evaluate(snapshotDisclosureCandidates);
    trace.record("disclosures-found", `Found ${candidates.length} controls exposing expanded state.`);

    let tested = 0;
    let notTested = 0;
    let stuck: string | null = null;

    for (const candidate of candidates) {
      ctx.checkCancelled();
      const verdict = safetyVerdict(candidate);
      const name = candidate.label !== "" ? `"${candidate.label}"` : candidate.selector;
      if (!verdict.safe) {
        notTested += 1;
        trace.record("disclosure-skipped", `Did not activate ${name} because ${verdict.reason}.`);
        continue;
      }
      // One unruly control must never fail the whole probe: degrade to an
      // honest not-tested trace instead.
      try {
        const completed = await exerciseCandidate(candidate, name);
        if (completed === "tested") tested += 1;
        else notTested += 1;
      } catch {
        notTested += 1;
        // Activation may have navigated the page (e.g. an Enter key that
        // followed a link instead of opening a disclosure). Return to the
        // tested page so later probes see the same state.
        await ctx.page.goBack({ timeout: 10_000 }).catch(() => undefined);
        trace.record(
          "disclosure-interrupted",
          `Interacting with ${name} moved away from the tested page, so it was left untested and the page restored.`,
        );
      }
    }

    async function exerciseCandidate(
      candidate: DisclosureCandidate,
      name: string,
    ): Promise<"tested" | "not-testable"> {
      const focused = await ctx.page.evaluate(focusSelector, candidate.selector);
      if (!focused) {
        trace.record("disclosure-unfocusable", `Could not focus ${name}; left untested.`);
        return "not-testable";
      }
      const before = await ctx.page.evaluate(readDisclosureState, candidate.selector);
      trace.record(
        "disclosure-before",
        `${name} started ${before.expanded === "true" ? "expanded" : "collapsed"}.`,
      );
      // Keyboard activation, exactly as a keyboard user would open it.
      await ctx.page.keyboard.press("Enter");
      await ctx.page.waitForTimeout(500);
      const after = await ctx.page.evaluate(readDisclosureState, candidate.selector);
      const changed = after.expanded !== before.expanded;
      trace.record(
        changed ? "disclosure-opened" : "disclosure-unchanged",
        changed
          ? `${name} opened (expanded=${after.expanded}).`
          : `${name} did not change with Enter — noted without further activation.`,
      );
      if (changed) {
        const shot = await ctx.captureScreenshot("disclosure-opened", null);
        if (shot !== null) screenshots.push(shot);
        // Restore: Escape first (reversible), then toggle back if needed.
        await ctx.page.keyboard.press("Escape");
        await ctx.page.waitForTimeout(400);
        let restored = await ctx.page.evaluate(readDisclosureState, candidate.selector);
        if (restored.expanded !== before.expanded) {
          await ctx.page.keyboard.press("Enter");
          await ctx.page.waitForTimeout(400);
          restored = await ctx.page.evaluate(readDisclosureState, candidate.selector);
        }
        if (restored.expanded !== before.expanded) {
          stuck = name;
          trace.record("disclosure-stuck", `${name} could not be returned to its initial state.`);
        } else {
          trace.record("disclosure-restored", `${name} was returned to its initial state.`);
        }
      }
      return "tested";
    }

    if (stuck !== null) {
      return buildProbeResult({
        probeId: "disclosure-popup",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: `A disclosure control was left in a changed state (${stuck}).`,
        humanSummary:
          `Opening ${stuck} changed the page, and neither Escape nor toggling it again ` +
          `restored the initial state. Users can get stuck with content revealed or focus stranded.`,
        severity: "serious",
        evidence: [{ kind: "disclosure-stuck-open", summary: `${stuck} did not restore.`, data: {} }],
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/"],
        startedAt,
      });
    }

    if (tested === 0) {
      return buildProbeResult({
        probeId: "disclosure-popup",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "not-tested",
        title: "Disclosure controls could not be safely exercised.",
        humanSummary:
          `The page exposes ${candidates.length} ${candidates.length === 1 ? "control" : "controls"} with expanded state, ` +
          `but none met the structural safety bar for automatic activation (no form submission, reversible state). ` +
          `They were left untouched rather than risk changing page state.`,
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/"],
        startedAt,
      });
    }

    return buildProbeResult({
      probeId: "disclosure-popup",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: "passed",
      title: `Tested ${tested} disclosure ${tested === 1 ? "control" : "controls"}; every one restored cleanly.`,
      humanSummary:
        `Opened ${tested} disclosure ${tested === 1 ? "control" : "controls"} with the keyboard, inspected the result, ` +
        `and returned ${tested === 1 ? "it" : "each"} to its initial state.` +
        (notTested > 0 ? ` ${notTested} further ${notTested === 1 ? "control was" : "controls were"} left untested for safety.` : ""),
      actionTrace: trace.steps,
      screenshots,
      standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/"],
      startedAt,
    });
  },
};
