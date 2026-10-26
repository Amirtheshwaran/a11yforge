import {
  EvidenceBundleSchema,
  type EvidenceBundle,
  type EvidenceItem,
  type KeyboardScenarioResult,
} from "@a11yforge/shared";

/**
 * Phase 3 compact evidence bundle for `focus-contained-in-modal`.
 *
 * Built deterministically from a completed Phase 2 interaction artifact:
 * the failed assertion, the modal-open observation, the compact focus
 * sequence, and the escape observation. Run events, screenshots, axe
 * findings, and page dumps are deliberately excluded — they add tokens
 * without diagnostic value.
 *
 * Stable evidence IDs: the modal-open observation is always
 * `ev-modal-open`, the escape `ev-focus-escape`, the failed assertion
 * `ev-assertion-failed`, and every other focus step `ev-focus-step-<seq>`.
 * The diagnosis must cite evidence through these IDs.
 */
export function buildFocusContainmentBundle(
  result: KeyboardScenarioResult,
): EvidenceBundle {
  const failed = result.assertions.find(
    (assertion) =>
      assertion.assertion === "focus-contained-in-modal" && !assertion.passed,
  );
  if (!failed) {
    throw new Error(
      "buildFocusContainmentBundle: no failed focus-contained-in-modal assertion to diagnose",
    );
  }
  if (result.scenarioId !== "checkout-modal-keyboard") {
    throw new Error(
      `buildFocusContainmentBundle: unsupported scenario ${result.scenarioId} (expected checkout-modal-keyboard)`,
    );
  }

  const items: EvidenceItem[] = [];
  for (const observation of result.observations) {
    if (observation.seq > failed.step) {
      continue;
    }
    if (observation.action === "modal-open") {
      items.push({
        id: "ev-modal-open",
        kind: "modal-open",
        summary: `Modal ${failed.expectedRegion} opened with focus on ${observation.selector}.`,
        selector: observation.selector,
        insideModal: observation.insideModal,
        role: observation.role,
        accessibleName: observation.accessibleName,
      });
    } else if (!observation.insideModal) {
      items.push({
        id: "ev-focus-escape",
        kind: "focus-escape",
        summary: `After pressing ${observation.key ?? "unknown key"}, focus moved to ${observation.selector} while ${failed.expectedRegion} remained open.`,
        selector: observation.selector,
        insideModal: false,
        role: observation.role,
        accessibleName: observation.accessibleName,
        html: failed.actualHtml,
      });
    } else {
      items.push({
        id: `ev-focus-step-${observation.seq}`,
        kind: "focus-observation",
        summary: `After pressing ${observation.key ?? "unknown key"}, focus moved to ${observation.selector} inside ${failed.expectedRegion}.`,
        selector: observation.selector,
        insideModal: true,
        role: observation.role,
        accessibleName: observation.accessibleName,
      });
    }
  }
  items.push({
    id: "ev-assertion-failed",
    kind: "assertion-result",
    summary: `Assertion focus-contained-in-modal failed at step ${failed.step}: expected focus inside ${failed.expectedRegion}, observed ${failed.actualFocus}.`,
    selector: failed.actualFocus,
    insideModal: false,
    html: failed.actualHtml,
  });

  return EvidenceBundleSchema.parse({
    bundleId: `bundle-${result.runId}`,
    scenarioId: result.scenarioId,
    targetUrl: result.targetUrl,
    assertion: "focus-contained-in-modal",
    expectedRegion: failed.expectedRegion,
    failedStep: failed.step,
    failingKey: failed.pressedKey,
    actualFocus: failed.actualFocus,
    items,
  });
}
