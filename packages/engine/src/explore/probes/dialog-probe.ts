import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";
import { describeActiveElement } from "./keyboard-probe.js";

/**
 * Phase 8 — dialog probe.
 *
 * Runs ONLY when a dialog is actually present in live page state (discovered
 * in the surface or opened by an earlier safe interaction). It never searches
 * for the word "modal" and never clicks anything to conjure one. Modal
 * dialogs (aria-modal or natively modal <dialog>) must contain focus and
 * carry an accessible name; anything else is reported as observed.
 */

interface LiveDialog {
  selector: string;
  name: string;
  modal: boolean;
  visible: boolean;
}

/** Runs inside the page: lists dialogs that are actually present now. */
export function snapshotOpenDialogs(): LiveDialog[] {
  const found = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'),
  );
  return found.map((el) => {
    const labelledBy = el.getAttribute("aria-labelledby");
    let name = el.getAttribute("aria-label")?.trim() ?? "";
    if (name === "" && labelledBy !== null) {
      name = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .join(" ")
        .trim()
        .slice(0, 120);
    }
    if (name === "") {
      const heading = el.querySelector("h1, h2, h3, h4");
      if (heading) name = (heading.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    }
    const rect = el.getBoundingClientRect();
    let selector = el.tagName.toLowerCase();
    if (el.id !== "") {
      try {
        selector = `#${CSS.escape(el.id)}`;
      } catch {
        selector = "[id]";
      }
    }
    const modal =
      el.getAttribute("aria-modal") === "true" ||
      (el.tagName.toLowerCase() === "dialog" && (el as HTMLDialogElement).matches?.(":modal") === true);
    return { selector, name, modal, visible: rect.width > 0 && rect.height > 0 };
  });
}

/** Runs inside the page: is `selector`'s element still open and visible? */
export function isDialogStillOpen(selector: string): boolean {
  const el = document.querySelector(selector);
  if (el === null) return false;
  if (el instanceof HTMLDialogElement && !el.open) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

/** Runs inside the page: does `outer` contain the active element? */
export function isFocusInside(outerSelector: string): boolean {
  const outer = document.querySelector(outerSelector);
  if (outer === null) return false;
  return outer.contains(document.activeElement);
}

const MAX_CONTAINMENT_STEPS = 12;

export const dialogProbe: AccessibilityProbe = {
  id: "dialog-behavior",

  applicable: (surface) => surface.dialogCount > 0,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    const screenshots: string[] = [];

    // Re-check live state: the dialog may have closed since discovery.
    const dialogs = await ctx.page.evaluate(snapshotOpenDialogs);
    const dialog = dialogs.find((candidate) => candidate.visible) ?? dialogs[0];
    if (dialog === undefined) {
      return buildProbeResult({
        probeId: "dialog-behavior",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "not-applicable",
        title: "No dialog was open when this probe ran.",
        humanSummary:
          "The page surface mentioned a dialog, but none was actually open when tested, so there was nothing to check.",
        actionTrace: trace.steps,
        startedAt,
      });
    }
    trace.record("dialog-found", `Found dialog ${dialog.selector} (modal: ${dialog.modal ? "yes" : "no"}).`);

    if (dialog.name === "") {
      const shot = await ctx.captureScreenshot("dialog-unnamed", null);
      if (shot !== null) screenshots.push(shot);
      trace.record("dialog-unnamed", "The dialog has no accessible name.");
      return buildProbeResult({
        probeId: "dialog-behavior",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: "This dialog has no accessible name.",
        humanSummary:
          "A dialog is open on this page but nothing names it, so screen reader users hear no context for what it is or what to do. Dialogs need a visible heading or an accessible name.",
        severity: "serious",
        evidence: [{ kind: "dialog-missing-name", summary: `Dialog ${dialog.selector} has no accessible name.`, data: {} }],
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/"],
        startedAt,
      });
    }
    trace.record("dialog-named", `The dialog is named "${dialog.name}".`);

    const initiallyInside = await ctx.page.evaluate(isFocusInside, dialog.selector);
    trace.record(
      initiallyInside ? "focus-inside" : "focus-outside",
      initiallyInside
        ? "Keyboard focus was already inside the dialog."
        : "Keyboard focus was outside the dialog when found.",
    );

    // Bounded containment walk for modal dialogs only.
    let escapedTo: string | null = null;
    if (dialog.modal) {
      trace.record("containment-start", "Tabbing through the open modal dialog to check focus stays inside.");
      for (let i = 0; i < MAX_CONTAINMENT_STEPS; i += 1) {
        ctx.checkCancelled();
        await ctx.page.keyboard.press("Tab");
        const inside = await ctx.page.evaluate(isFocusInside, dialog.selector);
        const focus = await ctx.page.evaluate(describeActiveElement);
        if (!inside && !focus.isBody) {
          escapedTo = `${focus.role}${focus.name !== "" ? ` "${focus.name}"` : ""} (${focus.selector})`;
          trace.record("focus-escaped", `Focus left the dialog to ${escapedTo}.`);
          break;
        }
        trace.record("contained-step", `Focus stayed inside the dialog (${focus.role}).`);
        if (!inside && focus.isBody) {
          escapedTo = "the page body";
          trace.record("focus-escaped", "Focus left the dialog to the page body.");
          break;
        }
      }
    } else {
      trace.record("non-modal", "This dialog is not modal, so focus is allowed outside it — no containment check applies.");
    }

    // Escape is reversible state restoration, safe to attempt.
    const openBeforeEscape = await ctx.page.evaluate(isDialogStillOpen, dialog.selector);
    await ctx.page.keyboard.press("Escape");
    await ctx.page.waitForTimeout(400);
    const openAfterEscape = await ctx.page.evaluate(isDialogStillOpen, dialog.selector);
    if (openBeforeEscape && !openAfterEscape) {
      trace.record("escape-closed", "Pressing Escape closed the dialog.");
      const focus = await ctx.page.evaluate(describeActiveElement);
      trace.record(
        "focus-after-close",
        `After closing, focus is on ${focus.isBody ? "the page body" : `${focus.role} (${focus.selector})`}.`,
      );
    } else if (openBeforeEscape) {
      trace.record("escape-noop", "Pressing Escape left the dialog open — no state was changed.");
    }

    if (escapedTo !== null) {
      const shot = await ctx.captureScreenshot("dialog-focus-escaped", null);
      if (shot !== null) screenshots.push(shot);
      return buildProbeResult({
        probeId: "dialog-behavior",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: "Keyboard focus can leave this dialog while it is still open.",
        humanSummary:
          `After tabbing through the dialog controls, focus moved to ${escapedTo} behind the dialog. ` +
          `Keyboard users can accidentally interact with the page behind an active dialog.`,
        severity: "critical",
        evidence: [
          {
            kind: "dialog-focus-escape",
            summary: `Focus left modal dialog ${dialog.selector} to ${escapedTo}.`,
            data: { dialogSelector: dialog.selector, escapedTo },
          },
        ],
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/"],
        startedAt,
      });
    }

    return buildProbeResult({
      probeId: "dialog-behavior",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: dialog.modal ? "passed" : "observed",
      title: dialog.modal
        ? `Dialog "${dialog.name}" kept keyboard focus inside while open.`
        : `Dialog "${dialog.name}" observed (not modal, no containment required).`,
      humanSummary: dialog.modal
        ? `Tabbed through the open dialog and focus stayed inside it, and the dialog has an accessible name.`
        : `A non-modal dialog named "${dialog.name}" was open. Focus is allowed outside non-modal dialogs, so nothing further was asserted.`,
      actionTrace: trace.steps,
      screenshots,
      standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/"],
      startedAt,
    });
  },
};
