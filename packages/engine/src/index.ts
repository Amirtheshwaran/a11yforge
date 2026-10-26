/**
 * Autonomous repair engine for A11yForge.
 *
 * Phase 0: package boundary shell only. The future explore → evidence →
 * diagnose → trace → patch → build → replay → verify → accept/reject loop
 * will live here. No functionality yet.
 */

export const ENGINE_NAME = "a11yforge-engine";

export { runAxeScan, newScanId, type ScanOptions } from "./scanner/scan.js";
export { normalizeAxeResults, type NormalizeInput } from "./scanner/normalize.js";
export { formatTerminalSummary } from "./scanner/report.js";
export { writeRunArtifact, type ArtifactOptions } from "./scanner/artifacts.js";
export {
  startFixtureServer,
  FIXTURE_HOST,
  FIXTURE_PORT,
  FIXTURE_URL,
  type FixtureServer,
} from "./scanner/fixture-server.js";
export { findWorkspaceRoot } from "./scanner/workspace.js";
export {
  CHECKOUT_MODAL_KEYBOARD,
  CHECKOUT_MODAL_SELECTOR,
  CHECKOUT_TAB_PRESSES,
  PROCEED_TO_CHECKOUT_SELECTOR,
  getScenario,
} from "./interaction/scenarios.js";
export {
  captureFocusObservation,
  describeActiveElement,
  isModalOpen,
  isModalOpenInPage,
  toFocusObservation,
  type ObservationMeta,
  type RawFocusSnapshot,
} from "./interaction/observe.js";
export {
  evaluateFocusContainment,
  type ContainmentInput,
} from "./interaction/assertions.js";
export {
  newRunId,
  runKeyboardScenario,
  type KeyboardRunnerDeps,
  type KeyboardRunnerOptions,
} from "./interaction/runner.js";
export {
  writeInteractionArtifacts,
  type InteractionArtifact,
  type InteractionArtifactOptions,
} from "./interaction/artifacts.js";
export { formatInteractionSummary } from "./interaction/report.js";
export { buildFocusContainmentBundle } from "./diagnosis/evidence-bundle.js";
export { findLatestScenarioRun } from "./diagnosis/run-selector.js";
export type { ScenarioRunSelection } from "./diagnosis/run-selector.js";
export {
  diagnosePreamble,
  runDiagnoseFixture,
} from "./diagnosis/diagnose.js";
export type {
  DiagnoseFixtureDeps,
  DiagnoseFixtureResult,
} from "./diagnosis/diagnose.js";
export { formatDiagnosisSummary } from "./diagnosis/report.js";
