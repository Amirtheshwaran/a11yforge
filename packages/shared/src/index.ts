/**
 * Shared schemas and types for A11yForge.
 *
 * Phase 0: establishes the package boundary only. Future phases will add
 * evidence envelopes, diagnosis results, patch proposals, and verdicts here
 * so the web app, API, engine, and Meta provider all speak the same shapes.
 */

/** Response body for `GET /health`. */
export interface ApiHealth {
  status: "ok";
  service: "a11yforge-api";
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
