import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";

/**
 * Phase 8 — form control probe.
 *
 * Inspects deterministic relationships of actually discovered controls:
 * accessible names, required/disabled exposure, error relationships, and
 * keyboard reachability (focus is observational and reversible). Forms are
 * NEVER submitted, and validation errors are never fabricated — only error
 * state already present in the page is inspected.
 */

interface ControlCheck {
  selector: string;
  role: string;
  name: string;
  required: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
  reachable: boolean;
  exposed: boolean;
  visible: boolean;
}

/** Runs inside the page: checks every control without changing any state. */
export function snapshotControlChecks(): ControlCheck[] {
  const els = Array.from(
    document.querySelectorAll(
      'input, select, textarea, [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"]',
    ),
  ).slice(0, 30);
  return els.map((el) => {
    const tag = el.tagName.toLowerCase();
    const inputType =
      el instanceof HTMLInputElement ? (el.getAttribute("type") ?? "text").toLowerCase() : tag;
    // Skip state-changing file inputs and hidden fields entirely.
    if (inputType === "hidden" || inputType === "file") {
      return {
        selector: tag, role: inputType, name: "", required: false, disabled: true,
        invalid: false, describedBy: "", reachable: false, exposed: false, visible: false,
      };
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    let name = el.getAttribute("aria-label")?.trim() ?? "";
    if (name === "" && labelledBy !== null) {
      name = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .join(" ")
        .trim();
    }
    if (name === "") {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.id !== "") {
          const owner = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (owner) name = (owner.textContent ?? "").replace(/\s+/g, " ").trim();
        }
        if (name === "") {
          const wrapping = el.closest("label");
          if (wrapping) name = (wrapping.textContent ?? "").replace(/\s+/g, " ").trim();
        }
        if (name === "") name = el.getAttribute("placeholder")?.trim() ?? "";
      } else {
        name = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      }
    }
    let selector = tag;
    if (el.id !== "") {
      try {
        selector = `#${CSS.escape(el.id)}`;
      } catch {
        selector = `[${tag}]`;
      }
    }
    // Observational reachability check only: focus, verify, restore.
    const previous = document.activeElement;
    let reachable = false;
    try {
      (el as HTMLElement).focus({ preventScroll: true });
      reachable = document.activeElement === el;
    } catch {
      reachable = false;
    }
    if (previous instanceof HTMLElement) {
      try {
        previous.focus({ preventScroll: true });
      } catch {
        /* best-effort restoration */
      }
    } else if (previous === null || previous === document.body) {
      (document.body as HTMLElement).focus?.();
    }
    const rect = el.getBoundingClientRect();
    return {
      selector,
      role: el.getAttribute("role") ?? inputType,
      name: name.slice(0, 120),
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      disabled: el.hasAttribute("disabled"),
      invalid: el.getAttribute("aria-invalid") === "true",
      describedBy: el.getAttribute("aria-describedby") ?? "",
      reachable,
      exposed: el.getAttribute("aria-hidden") !== "true",
      visible: rect.width > 0 && rect.height > 0,
    };
  });
}

const MAX_EVIDENCE_CONTROLS = 20;

export const formProbe: AccessibilityProbe = {
  id: "form-relationships",

  applicable: (surface) => surface.controls.length > 0,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    const screenshots: string[] = [];
    trace.record("form-check-started", `Inspecting ${ctx.surface.controls.length} discovered form controls.`);

    const checks = await ctx.page.evaluate(snapshotControlChecks);
    const usable = checks.filter((check) => check.role !== "hidden" && check.role !== "file");
    trace.record("form-check-done", `Inspected ${usable.length} controls without submitting anything.`);

    const unnamed = usable.filter((check) => check.name === "" && check.exposed && check.visible);
    const undescribedErrors = usable.filter(
      (check) => check.invalid && check.describedBy === "",
    );
    const unreachable = usable.filter(
      (check) => !check.disabled && check.exposed && check.visible && !check.reachable,
    );

    for (const check of unnamed.slice(0, MAX_EVIDENCE_CONTROLS)) {
      trace.record("unnamed-control", `${check.role} (${check.selector}) has no accessible name.`);
    }
    for (const check of undescribedErrors.slice(0, MAX_EVIDENCE_CONTROLS)) {
      trace.record("error-undescribed", `${check.role} (${check.selector}) is marked invalid with no error description.`);
    }
    for (const check of unreachable.slice(0, MAX_EVIDENCE_CONTROLS)) {
      trace.record("control-unreachable", `${check.role} (${check.selector}) could not receive keyboard focus.`);
    }

    if (unnamed.length > 0) {
      const shot = await ctx.captureScreenshot("form-unnamed-control", null);
      if (shot !== null) screenshots.push(shot);
      return buildProbeResult({
        probeId: "form-relationships",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: `${unnamed.length} form ${unnamed.length === 1 ? "control has" : "controls have"} no accessible name.`,
        humanSummary:
          `${unnamed.length} form ${unnamed.length === 1 ? "control" : "controls"} on this page ` +
          `(${unnamed.slice(0, 3).map((check) => check.selector).join(", ")}) ` +
          `cannot be identified by assistive technology. Screen reader users hear only ` +
          `"${unnamed[0]?.role ?? "control"}" with no indication of what to enter. Controls need a label or an accessible name.`,
        severity: "serious",
        evidence: unnamed.slice(0, MAX_EVIDENCE_CONTROLS).map((check) => ({
          kind: "unnamed-control",
          summary: `${check.role} (${check.selector}) has no accessible name.`,
          data: { selector: check.selector, role: check.role },
        })),
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html"],
        startedAt,
      });
    }

    if (unreachable.length > 0 || undescribedErrors.length > 0) {
      return buildProbeResult({
        probeId: "form-relationships",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "observed",
        title: "Form controls are named, with notes on errors and reachability.",
        humanSummary:
          `Every control on this page has an accessible name. ` +
          (undescribedErrors.length > 0
            ? `${undescribedErrors.length} ${undescribedErrors.length === 1 ? "control is" : "controls are"} marked invalid without a described error. `
            : "") +
          (unreachable.length > 0
            ? `${unreachable.length} ${unreachable.length === 1 ? "control" : "controls"} could not receive keyboard focus.`
            : "All enabled controls received keyboard focus."),
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html"],
        startedAt,
      });
    }

    return buildProbeResult({
      probeId: "form-relationships",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: "passed",
      title: `All ${usable.length} form controls are named and keyboard-reachable.`,
      humanSummary:
        `Every form control discovered on this page exposes an accessible name, ` +
        `and every enabled control received keyboard focus. No forms were submitted.`,
      actionTrace: trace.steps,
      screenshots,
      startedAt,
    });
  },
};
