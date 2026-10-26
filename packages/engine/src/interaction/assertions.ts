import {
  InteractionAssertionSchema,
  type FocusObservation,
  type InteractionAssertion,
} from "@a11yforge/shared";

/**
 * Deterministic focus-containment assertion (Phase 2).
 *
 * While the modal is open, active focus must remain inside the dialog
 * subtree. The first observation outside the modal fails the assertion with
 * the failing step, the pressed key, the expected region, and the element
 * that actually held focus. No model reasoning — pure comparison.
 */

export interface ContainmentInput {
  /** Observations collected while the modal was open, in step order. */
  observations: FocusObservation[];
  /** Modal region focus was expected to stay inside. */
  expectedRegion: string;
  /**
   * Bounded outer-HTML per observation seq, for the failing-step evidence.
   * Missing entries fall back to an empty string (never throws).
   */
  htmlBySeq: Map<number, string>;
}

/** Evaluate `focus-contained-in-modal` over modal-open observations. */
export function evaluateFocusContainment(
  input: ContainmentInput,
): InteractionAssertion {
  const { observations, expectedRegion, htmlBySeq } = input;
  if (observations.length === 0) {
    throw new Error(
      "evaluateFocusContainment: no observations to assert against",
    );
  }

  const escaped = observations.find((o) => !o.insideModal);
  if (escaped) {
    return InteractionAssertionSchema.parse({
      assertion: "focus-contained-in-modal",
      passed: false,
      step: escaped.seq,
      pressedKey: escaped.key,
      expectedRegion,
      actualFocus: escaped.selector,
      actualHtml: htmlBySeq.get(escaped.seq) ?? "",
    });
  }

  const last = observations[observations.length - 1];
  if (!last) {
    throw new Error(
      "evaluateFocusContainment: no observations to assert against",
    );
  }
  return InteractionAssertionSchema.parse({
    assertion: "focus-contained-in-modal",
    passed: true,
    step: last.seq,
    pressedKey: last.key,
    expectedRegion,
    actualFocus: last.selector,
    actualHtml: htmlBySeq.get(last.seq) ?? "",
  });
}
