import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  ScenarioDefinitionSchema,
  type KeyboardScenarioResult,
  type ScenarioDefinition,
} from "@a11yforge/shared";
import {
  CHECKOUT_MODAL_SELECTOR,
  PROCEED_TO_CHECKOUT_SELECTOR,
} from "../interaction/scenarios.js";
import { newRunId, runKeyboardScenario } from "../interaction/runner.js";
import { snapshotTargetAssertion } from "./regression.js";

/**
 * Reverse-traversal containment check.
 *
 * A focus trap must wrap in BOTH directions: Tab from the final modal
 * control wraps to the first, and Shift+Tab from the first wraps to the
 * final. The primary `checkout-modal-keyboard` scenario only exercises
 * forward Tab, so this supplementary scenario opens the same modal (focus
 * lands on `#checkout-modal-close`, the first control) and presses
 * Shift+Tab: on the broken fixture focus leaves the dialog, on a trapped
 * dialog it wraps to `#checkout-modal-continue`.
 *
 * The primary scenario registry and semantics are untouched — this
 * definition is built locally and used only by the recovery flow.
 */

/** Reverse scenario id (never registered; local to the recovery flow). */
export const REVERSE_TRAVERSAL_SCENARIO_ID =
  "checkout-modal-keyboard-reverse";

/** Bounded Shift+Tab presses for the reverse check. */
export const REVERSE_TAB_PRESSES = 3;

/** Final contained-focus screenshot for the reverse check. */
export const REVERSE_CONTAINED_SCREENSHOT = "reverse-focus-contained.png";

function shiftTabPresses(count: number): ScenarioDefinition["steps"] {
  return Array.from({ length: count }, () => ({
    kind: "press",
    key: "Shift+Tab",
  }) as const);
}

/** Build the reverse-traversal scenario (validated, never registered). */
export function buildReverseTraversalScenario(): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id: REVERSE_TRAVERSAL_SCENARIO_ID,
    description:
      "Open the checkout modal and press Shift+Tab: focus must wrap " +
      "to the final modal control instead of leaving the dialog.",
    modalSelector: CHECKOUT_MODAL_SELECTOR,
    steps: [
      { kind: "click", selector: PROCEED_TO_CHECKOUT_SELECTOR },
      { kind: "wait-for", selector: CHECKOUT_MODAL_SELECTOR },
      { kind: "screenshot", name: "reverse-modal-open.png" },
      ...shiftTabPresses(REVERSE_TAB_PRESSES),
    ],
  });
}

export interface ReplayReverseDeps {
  /** Base URL of the repaired fixture under test. */
  targetUrl: string;
  /** Run dir receiving `reversed-*.png` and the reverse screenshot. */
  screenshotDir: string;
  screenshotTimeoutMs?: number;
  /** Prefix for runner screenshots (default `reversed`). */
  screenshotPrefix?: string;
  /** Final reverse screenshot name (default artifact name). */
  containedScreenshotName?: string;
}

/**
 * Replay the reverse-traversal scenario against a repaired target.
 * Mirrors `replayCheckoutScenario` screenshot handling so Attempt-1
 * evidence is never overwritten.
 */
export async function replayReverseTraversal(
  deps: ReplayReverseDeps,
): Promise<KeyboardScenarioResult> {
  const scenario = buildReverseTraversalScenario();
  const runId = newRunId();
  const prefix = deps.screenshotPrefix ?? "reversed";
  const containedName =
    deps.containedScreenshotName ?? REVERSE_CONTAINED_SCREENSHOT;
  const browser: Browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await runKeyboardScenario({
      page,
      scenario,
      runId,
      targetUrl: deps.targetUrl,
      takeScreenshot: async (name: string) => {
        await page.screenshot({
          path: join(deps.screenshotDir, `${prefix}-${name}`),
          timeout: deps.screenshotTimeoutMs ?? 10_000,
        });
      },
    });
    await page.screenshot({
      path: join(deps.screenshotDir, containedName),
      timeout: deps.screenshotTimeoutMs ?? 10_000,
    });
    return result;
  } finally {
    await browser.close();
  }
}

export interface ReverseTraversalVerdict {
  /** Target assertion passed after Shift+Tab presses. */
  passed: boolean;
  /** Focus location on the deciding step. */
  actualFocus: string;
  /** Every observation stayed inside the modal. */
  allInsideModal: boolean;
}

/**
 * Evaluate reverse containment deterministically: the same
 * `focus-contained-in-modal` assertion must pass, and no observation may
 * sit outside the modal.
 */
export function evaluateReverseTraversal(
  result: KeyboardScenarioResult,
): ReverseTraversalVerdict {
  const snapshot = snapshotTargetAssertion(result);
  return {
    passed: snapshot.passed,
    actualFocus: snapshot.actualFocus,
    allInsideModal: result.observations.every((item) => item.insideModal),
  };
}
