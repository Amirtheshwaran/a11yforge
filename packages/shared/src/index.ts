/**
 * Shared schemas and types for A11yForge.
 *
 * Phase 0: establishes the package boundary only. Future phases will add
 * evidence envelopes, diagnosis results, patch proposals, and verdicts here
 * so the web app, API, engine, and Meta provider all speak the same shapes.
 */

/**
 * Response body for `GET /health`.
 *
 * Deployment-friendly and safe by construction: booleans and labels only.
 * Never environment values, keys, paths, or filesystem structure.
 */
export interface ApiHealth {
  status: "ok";
  service: "a11yforge-api";
  /** Release label (`A11YFORGE_VERSION`, defaults to the package version). */
  version: string;
  /** True when the API server has MODEL_API_KEY and live runs can execute. */
  modelConfigured: boolean;
  /** Where the recorded demo run is served from. */
  demoMode: "bundled-recorded" | "local";
  /** True when the runtime data directory is present and writable. */
  dataDirWritable: boolean;
}

export {
  AccessibilityFindingSchema,
  AccessibilityScanResultSchema,
  ImpactSchema,
} from "./evidence.js";
export type {
  AccessibilityFinding,
  AccessibilityScanResult,
  Impact,
} from "./evidence.js";
export {
  AccessibilityDiagnosisSchema,
  DiagnosisSeveritySchema,
  EvidenceBundleSchema,
  EvidenceItemKindSchema,
  EvidenceItemSchema,
  IssueTypeSchema,
  ModelUsageSchema,
  evidenceIdsOf,
} from "./diagnosis.js";
export type {
  AccessibilityDiagnosis,
  DiagnosisSeverity,
  EvidenceBundle,
  EvidenceItem,
  EvidenceItemKind,
  IssueType,
  ModelUsage,
} from "./diagnosis.js";
export {
  MAX_REPAIR_EDITS,
  MAX_REPAIR_FILES,
  RepairContextBundleSchema,
  RepairEditSchema,
  RepairProposalSchema,
  RepairSourceFileSchema,
  RepairSourceSnippetSchema,
  repairEvidenceIdsOf,
  repairSourceFilesOf,
} from "./repair.js";
export type {
  RepairContextBundle,
  RepairEdit,
  RepairProposal,
  RepairSourceFile,
  RepairSourceSnippet,
} from "./repair.js";
export {
  EvidenceTypeSchema,
  FocusObservationSchema,
  InteractionAssertionSchema,
  KeyboardScenarioResultSchema,
  RunEventSchema,
  RunEventTypeSchema,
  ScenarioDefinitionSchema,
  ScenarioStepSchema,
  ScreenshotRefSchema,
} from "./interaction.js";
export {
  AttemptViewSchema,
  CriticViewSchema,
  FocusTraceStepSchema,
  PipelineStageSchema,
  RunSummarySchema,
  RunViewModelSchema,
  VerificationViewSchema,
  containsNoSecrets,
  isAllowedArtifactName,
  toDisplayPath,
} from "./runview.js";
export type {
  AttemptView,
  CriticView,
  FocusTraceStep,
  PipelineStage,
  RunSummary,
  RunViewModel,
  VerificationView,
} from "./runview.js";
export {
  LivePipelineStageSchema,
  LiveRunEventMetadataSchema,
  LiveRunEventSchema,
  LiveRunEventStatusSchema,
  LiveRunEventTypeSchema,
  LiveRunStageSchema,
  LiveRunStateSchema,
  LiveRunStatusSchema,
  ModelSpendRowSchema,
  ModelSpendSummarySchema,
  emptySpendSummary,
  projectLiveStages,
  sanitizeLiveMessage,
  sanitizeLiveMetadata,
} from "./live-run.js";
export type {
  LivePipelineStage,
  LiveRunEvent,
  LiveRunEventMetadata,
  LiveRunEventStatus,
  LiveRunEventType,
  LiveRunStage,
  LiveRunState,
  LiveRunStatus,
  ModelSpendRow,
  ModelSpendSummary,
} from "./live-run.js";
export {
  AssertionSnapshotSchema,
  CriticDecisionSchema,
  CriticInputSchema,
  REPAIR_LIFECYCLE_TRANSITIONS,
  RepairLifecycleSchema,
  RepairLifecycleStateSchema,
  RepairLifecycleTransitionSchema,
  RepairVerificationResultSchema,
  isRepairLifecycleTerminal,
} from "./verify.js";
export type {
  AssertionSnapshot,
  CriticDecision,
  CriticInput,
  RepairLifecycle,
  RepairLifecycleState,
  RepairLifecycleTransition,
  RepairVerificationResult,
} from "./verify.js";
export {
  MAX_REPAIR_ATTEMPTS,
  RepairFailureFeedbackSchema,
  RepairRevisionRequestSchema,
  RevisionDiagnosisSchema,
  VerificationStageSchema,
  isRevisionExhausted,
  isTerminalFailureState,
} from "./recovery.js";
export type {
  RepairFailureFeedback,
  RepairRevisionRequest,
  RevisionDiagnosis,
  VerificationStage,
} from "./recovery.js";
export type {
  EvidenceType,
  FocusObservation,
  InteractionAssertion,
  KeyboardScenarioResult,
  RunEvent,
  RunEventType,
  ScenarioDefinition,
  ScenarioStep,
  ScreenshotRef,
} from "./interaction.js";
