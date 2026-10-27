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
export { extractSearchTerms } from "./trace/search-terms.js";
export {
  MAX_SNIPPET_CHARS,
  MAX_SNIPPETS_PER_FILE,
  MAX_SNIPPET_LINES,
  MAX_SOURCE_FILES_SCANNED,
  MAX_SOURCE_FILE_BYTES,
  SNIPPET_CONTEXT_LINES,
  TRACE_IGNORED_DIRS,
  TRACE_IGNORED_FILES,
  TRACE_SOURCE_EXTENSIONS,
  collectSourceFiles,
  countOccurrences,
  extractSnippets,
  rankFileContent,
  searchSourceTree,
  type SourceCandidate,
  type SourceSnippet,
} from "./trace/locator.js";
export {
  MAX_TOTAL_CONTEXT_CHARS,
  MAX_TRACE_CONTEXT_FILES,
  MIN_TRACE_MATCHED_TERMS,
  MIN_TRACE_MATCH_COUNT,
  SourceCandidateSchema,
  SourceSnippetSchema,
  SourceTraceResultSchema,
  buildSourceTrace,
  defaultFixtureSourceRoot,
  findLatestDiagnosedRun,
  formatTraceSummary,
  isTraceSufficient,
  runTraceFixture,
  type BuildSourceTraceArgs,
  type DiagnosedRunSelection,
  type SourceTraceResult,
  type TraceFixtureDeps,
  type TraceFixtureResult,
} from "./trace/trace.js";
export { buildRepairContextBundle } from "./trace/repair-context.js";
export {
  RepairProposalValidationError,
  validateRepairProposal,
  type ValidateProposalArgs,
} from "./trace/validate-proposal.js";
export {
  formatProposalSummary,
  proposePreamble,
  runProposeFixture,
  type ProposeFixtureDeps,
  type ProposeFixtureResult,
} from "./repair/propose.js";
export {
  RepairApplyError,
  applyRepairProposal,
  buildLineDiff,
  countAnchorOccurrences,
  resolveWorkspacePath,
  type AppliedEdit,
  type ApplyRepairResult,
} from "./verify/apply.js";
export {
  buildWorkspace,
  MAX_BUILD_OUTPUT_CHARS,
  type BuildResult,
  type BuildWorkspaceDeps,
} from "./verify/build.js";
export {
  assertCriticEvidenceKnown,
  buildCriticInput,
  CriticEvidenceError,
  requestCriticDecision,
  type RequestCriticDeps,
  type RequestCriticResult,
} from "./verify/critic.js";
export {
  IllegalLifecycleTransitionError,
  newRepairLifecycle,
  transitionRepairLifecycle,
} from "./verify/lifecycle.js";
export {
  compareAxeScans,
  axeRuleIdsOf,
  compareScenarioAssertions,
  evaluateAcceptanceGate,
  snapshotTargetAssertion,
  type AcceptanceGateInput,
  type AcceptanceGateResult,
  type AxeComparison,
  type VerificationComparison,
} from "./verify/regression.js";
export {
  FOCUS_CONTAINED_AFTER_SCREENSHOT,
  replayCheckoutScenario,
  scanRepairedTarget,
  startStaticServer,
  type ReplayRepairedDeps,
  type StaticServer,
} from "./verify/replay.js";
export {
  formatRepairSummary,
  runRepairFixture,
  type RepairDrivers,
  type RepairFixtureDeps,
  type RepairFixtureResult,
  type RepairTypecheck,
} from "./verify/repair-fixture.js";
export {
  RunArtifactError,
  buildRunViewModel,
  findDemoRunId,
  listRunSummaries,
  resolveRunDir,
  type ArtifactUrlFor,
} from "./runview/read-model.js";
export {
  cleanRepairWorkspace,
  createRepairWorkspace,
  defaultWorkspacesDir,
  REPAIR_WORKSPACE_BASE_CONFIG,
  REPAIR_WORKSPACE_ENTRIES,
  REPAIR_WORKSPACE_FIXTURE_DIR,
  REPAIR_WORKSPACES_DIRNAME,
  type RepairWorkspace,
} from "./verify/workspace.js";
export {
  createTargetGuard,
  ipIsBlocked,
  isPrivateTargetsAllowed,
  TargetRejectedError,
  validateTargetUrl,
  type TargetRejectionCode,
  type ValidatedTarget,
  type ValidateTargetOptions,
} from "./explore/target.js";
export {
  collectPageSurface,
  filterNavigableSameOriginLinks,
  waitForStablePage,
} from "./explore/surface.js";
export { projectFindings, traceToSteps } from "./explore/findings.js";
export {
  ExplorationCancelledError,
  runExploration,
  type RunExplorationOptions,
} from "./explore/orchestrator.js";
export {
  CLONE_MAX_BYTES,
  CLONE_TIMEOUT_MS,
  cleanSourceWorkspace,
  cloneGitSource,
  copyLocalSource,
  gitCloneEnv,
  LOCAL_COPY_MAX_BYTES,
  LOCAL_COPY_MAX_FILES,
} from "./source/acquire.js";
export {
  connectSource,
  loadFindingEvidence,
  traceFindingToSource,
  writeSourceArtifacts,
  type ConnectedSource,
  type ConnectSourceArgs,
  type TraceFindingArgs,
} from "./source/connect.js";
export {
  extractSourceContext,
  MAX_CONTEXT_FILES,
  MAX_CONTEXT_TOTAL_CHARS,
  MAX_CONTEXT_TOTAL_LINES,
  mergeWindows,
  SNIPPET_CONTEXT_LINES as SOURCE_SNIPPET_CONTEXT_LINES,
  MAX_SNIPPETS_PER_FILE as SOURCE_MAX_SNIPPETS_PER_FILE,
} from "./source/context.js";
export {
  buildSourceDiagnosisBundle,
  MAX_DIAGNOSIS_ACTIONS,
  MAX_DIAGNOSIS_CONTEXT_FILES,
  MAX_DIAGNOSIS_EVIDENCE,
  SourceDiagnosisBundleSchema,
  SOURCE_EVIDENCE_ID_PATTERN,
  validateSourceDiagnosisGrounding,
  type SourceDiagnosisBundle,
} from "./source/diagnose-bundle.js";
export {
  collectFingerprints,
  EVIDENCE_STOPWORDS,
  generateSearchTerms,
  type EvidenceFingerprint,
  type WeightedTerm,
} from "./source/evidence-terms.js";
export {
  determineExecutionProfile,
  detectPackageManager,
  type ExecutionProfileInput,
} from "./source/exec-profile.js";
export { GitUrlRejectedError, parseGitSource, sanitizeGitError } from "./source/git-url.js";
export {
  buildSourceInventory,
  INVENTORY_IGNORED_DIRS,
  INVENTORY_LOCKFILES,
  INVENTORY_MANIFEST_NAMES,
  INVENTORY_MAX_FILES,
  INVENTORY_MAX_FILE_BYTES,
  INVENTORY_MAX_TEXT_BYTES,
  INVENTORY_TEXT_EXTENSIONS,
  type InventoryResult,
} from "./source/inventory.js";
export { assertPathWithin, defaultSourcesDir, requireAbsolutePath } from "./source/paths.js";
export {
  isTraceSufficientForRepair,
  PROXIMITY_WINDOW_LINES,
  searchAndRank,
  STRONG_TERM_KINDS,
  TRACE_FOUND_MIN_MARGIN,
  TRACE_FOUND_MIN_SCORE,
  TRACE_SUFFICIENT_DISTINCT_TERMS,
  type RankedTrace,
} from "./source/rank.js";
export {
  AmbiguousElementError,
  buildReproductionPlan,
  relativePagePath,
  resolveElement,
  verificationUrlFor,
  type ResolvablePage,
} from "./source/reproduce.js";
export {
  runSourceRepairVerification,
  splitCommand,
  type ReplayHooks,
  type SourceRepairRunArgs,
  type SourceRepairRunResult,
  type VerificationGate,
} from "./source/repair-run.js";
export {
  buildSandboxEnv,
  isDockerAvailable,
  runIsolated,
  SANDBOX_BLOCKED_ENV_PATTERNS,
  SANDBOX_DEFAULT_MAX_OUTPUT,
  type SandboxIsolation,
  type SandboxResult,
  type SandboxRunOptions,
} from "./source/sandbox.js";
export {
  capWeakWeight,
  isWeakTerm,
  WEAK_TERMS,
  weightTerm,
} from "./source/term-weight.js";
export {
  AUTORUN_STAGE_TIMEOUTS_MS,
  AutorunStageTimeoutError,
  collectSpendLedger,
  MAX_LIVE_MODEL_CALLS_PER_RUN,
  runAutonomousRepair,
  summarizeSpend,
  type AutorunDrivers,
  type AutorunEmit,
  type AutorunEvidenceContext,
  type AutorunOptions,
  type AutorunResult,
  type AutorunStageContext,
  type AutorunStageKey,
} from "./autorun/pipeline.js";
