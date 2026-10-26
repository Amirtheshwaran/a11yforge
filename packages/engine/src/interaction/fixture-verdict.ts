import type { KeyboardScenarioResult } from "@a11yforge/shared";

/**
 * Exit-code contract for the controlled `scenario:fixture` verification
 * command (Phase 2).
 *
 * - The scenario runner executed successfully AND reproduced the known
 *   fixture defect (a `focus-contained-in-modal` assertion with
 *   `passed: false`) → exit 0. Reproducing the expected defect is success
 *   for this command.
 * - The runner executed successfully but the known defect was NOT
 *   reproduced (every assertion passed) → exit 1 (verification failure).
 *
 * Genuine execution problems (browser launch failure, fixture server
 * failure, scenario timeout, unexpected runtime exception, artifact write
 * failure) never reach this helper — the CLI exits non-zero directly.
 * This helper only maps a completed run's structured assertion outcome to
 * a process exit code, without changing the meaning of the assertion.
 */

/** Printed when the known defect is reproduced (exit 0). */
export const EXPECTED_DEFECT_REPRODUCED_MESSAGE =
  "Expected fixture defect reproduced successfully.";

/** True when the completed run reproduced the expected fixture defect. */
export function isExpectedFixtureDefectReproduced(
  result: KeyboardScenarioResult,
): boolean {
  return result.assertions.some((assertion) => !assertion.passed);
}

/** Process exit code for a completed `scenario:fixture` run. */
export function resolveFixtureScenarioExitCode(
  result: KeyboardScenarioResult,
): 0 | 1 {
  return isExpectedFixtureDefectReproduced(result) ? 0 : 1;
}
