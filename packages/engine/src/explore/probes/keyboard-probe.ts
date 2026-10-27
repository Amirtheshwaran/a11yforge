import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";

/**
 * Phase 8 — bounded real Tab traversal probe.
 *
 * Presses Tab in the live page and records where keyboard focus actually
 * lands after every step. Reports observed facts; the only deterministic
 * failures are focus landing where assistive technology cannot follow it
 * (hidden content) or on a disabled control. Unusual-but-valid orders are
 * observations, never failures.
 */

interface FocusBox {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Vertical scroll offset when measured: steps at another scroll position do not align to the failure shot. */
  scrollY: number;
}

/** One recorded focus landing, in traversal order. */
export interface RecordedFocusStep {
  label: string;
  selector: string;
  box: FocusBox | null;
}

interface FocusSnapshot {
  hasFocus: boolean;
  role: string;
  name: string;
  tag: string;
  selector: string;
  exposed: boolean;
  disabled: boolean;
  rendered: boolean;
  onScreen: boolean;
  isBody: boolean;
  /** Viewport-relative box of the focused element, when measurable. */
  box: FocusBox | null;
}

/** Runs inside the page: describes document.activeElement right now. */
export function describeActiveElement(): FocusSnapshot {
  const active = document.activeElement;
  if (active === null || active === document.body) {
    return {
      hasFocus: document.hasFocus(),
      role: "body",
      name: "",
      tag: "BODY",
      selector: "body",
      exposed: true,
      disabled: false,
      rendered: true,
      onScreen: true,
      isBody: true,
      box: null,
    };
  }
  const el = active as Element;
  const explicit = el.getAttribute("role");
  const tag = el.tagName.toLowerCase();
  let role = explicit?.trim().split(/\s+/)[0] ?? "";
  if (role === "") {
    if (tag === "button") role = "button";
    else if (tag === "a" && el.hasAttribute("href")) role = "link";
    else if (tag === "input" || tag === "select" || tag === "textarea") role = "control";
    else role = tag;
  }
  const name =
    el.getAttribute("aria-label")?.trim() ||
    (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) ||
    (el instanceof HTMLInputElement ? el.value || el.placeholder || el.type : "");
  let selector = el.tagName.toLowerCase();
  if (el.id !== "") {
    try {
      selector = `#${CSS.escape(el.id)}`;
    } catch {
      selector = `[id]`;
    }
  }
  const rect = el.getBoundingClientRect();
  const rendered = rect.width > 0 && rect.height > 0;
  const style = window.getComputedStyle(el);
  const exposed = el.getAttribute("aria-hidden") !== "true";
  return {
    hasFocus: document.hasFocus(),
    role,
    name: name.slice(0, 120),
    tag: el.tagName,
    selector,
    exposed,
    disabled: el.hasAttribute("disabled"),
    rendered: rendered && style.visibility !== "hidden" && style.display !== "none",
    onScreen:
      rendered &&
      rect.bottom >= 0 &&
      rect.top <= window.innerHeight &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth,
    isBody: false,
    box: rendered
      ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollY: window.scrollY,
        }
      : null,
  };
}

function labelFocus(snapshot: FocusSnapshot): string {
  if (snapshot.isBody) return "the page body";
  const named = snapshot.name !== "" ? ` "${snapshot.name}"` : "";
  return `${snapshot.role}${named} (${snapshot.selector})`;
}

export const keyboardProbe: AccessibilityProbe = {
  id: "keyboard-traversal",

  applicable: (surface) => surface.keyboardOrderSize > 0,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    const screenshots: string[] = [];

    const start = await ctx.page.evaluate(describeActiveElement);
    trace.record("traversal-started", `Keyboard focus started on ${labelFocus(start)}.`);

    const seen: string[] = [];
    const focusSteps: RecordedFocusStep[] = [];
    let failure: {
      title: string;
      summary: string;
      detail: string;
      snapshot: FocusSnapshot;
      startLabel: string;
      steps: number;
    } | null = null;
    let bodyFallbacks = 0;
    let steps = 0;

    for (let i = 0; i < ctx.maxTabSteps; i += 1) {
      ctx.checkCancelled();
      await ctx.page.keyboard.press("Tab");
      const snapshot = await ctx.page.evaluate(describeActiveElement);
      steps += 1;

      if (!snapshot.hasFocus) {
        trace.record("focus-left-page", "Focus moved out of the page (browser UI). Stopping traversal.");
        break;
      }
      if (snapshot.isBody) {
        bodyFallbacks += 1;
        trace.record("focus-to-body", "Focus returned to the page body (end of keyboard order or an untabbable gap).");
        // Two consecutive body landings mean there is nowhere left to go.
        if (bodyFallbacks >= 2) break;
        continue;
      }
      const key = `${snapshot.role}::${snapshot.name}::${snapshot.selector}`;
      const revisits = seen.filter((entry) => entry === key).length;
      seen.push(key);
      focusSteps.push({ label: labelFocus(snapshot), selector: snapshot.selector, box: snapshot.box });
      trace.record("tab-step", `Focus moved to ${labelFocus(snapshot)}.`);

      if (!snapshot.exposed || !snapshot.rendered) {
        failure = {
          title: "Keyboard focus moved to content hidden from assistive technology.",
          summary:
            `After pressing Tab, focus landed on ${labelFocus(snapshot)}, which is hidden ` +
            `from assistive technology. Sighted keyboard users see a focus indicator on ` +
            `something screen reader users cannot perceive.`,
          detail: `focus landed on hidden content at step ${steps}`,
          snapshot,
          startLabel: labelFocus(start),
          steps,
        };
        const shot = await ctx.captureScreenshot("keyboard-focus-hidden", null);
        if (shot !== null) screenshots.push(shot);
        break;
      }
      if (snapshot.disabled) {
        failure = {
          title: "Keyboard focus moved to a disabled control.",
          summary:
            `After pressing Tab, focus landed on ${labelFocus(snapshot)}, which is ` +
            `disabled. Disabled controls must not be reachable by keyboard.`,
          detail: `focus landed on a disabled control at step ${steps}`,
          snapshot,
          startLabel: labelFocus(start),
          steps,
        };
        const shot = await ctx.captureScreenshot("keyboard-focus-disabled", null);
        if (shot !== null) screenshots.push(shot);
        break;
      }
      if (revisits >= 1 && seen.length > 6) {
        trace.record("focus-cycle", "Focus returned to an element visited earlier — the keyboard order cycles.");
        break;
      }
    }

    // A few Shift+Tab steps confirm the order is reversible where possible.
    let reverseOk = true;
    const reverseSteps = Math.min(5, seen.length);
    for (let i = 0; i < reverseSteps; i += 1) {
      ctx.checkCancelled();
      await ctx.page.keyboard.press("Shift+Tab");
      const snapshot = await ctx.page.evaluate(describeActiveElement);
      if (!snapshot.hasFocus || snapshot.isBody) {
        reverseOk = false;
        break;
      }
      trace.record("shift-tab-step", `Reverse focus moved to ${labelFocus(snapshot)}.`);
    }
    if (reverseSteps > 0) {
      trace.record(
        reverseOk ? "reverse-ok" : "reverse-exited",
        reverseOk
          ? "Reverse traversal stayed on page content."
          : "Reverse traversal left page content early.",
      );
    }

    if (failure !== null) {
      const end = failure.snapshot;
      return buildProbeResult({
        probeId: "keyboard-traversal",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: failure.title,
        humanSummary: failure.summary,
        severity: "serious",
        evidence: [
          {
            kind: "keyboard-focus-anomaly",
            summary: failure.detail,
            data: {
              role: end.role,
              name: end.name,
              selector: end.selector,
              box: end.box,
              startLabel: failure.startLabel,
              steps: failure.steps,
              focusSteps,
            },
          },
        ],
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html"],
        startedAt,
      });
    }

    const reachedSummary =
      `Pressed Tab ${steps} ${steps === 1 ? "time" : "times"} and recorded where focus landed each time. ` +
      (bodyFallbacks > 0
        ? "Focus returned to the page body during traversal."
        : "Focus stayed on visible page content throughout.");
    return buildProbeResult({
      probeId: "keyboard-traversal",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: "observed",
      title: `Keyboard traversal observed on this page (${steps} Tab steps).`,
      humanSummary: `${reachedSummary} No focus trap, hidden-focus, or disabled-focus problem was observed in the steps tested.`,
      severity: "info",
      actionTrace: trace.steps,
      screenshots,
      standardReferences: ["https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html"],
      startedAt,
    });
  },
};
