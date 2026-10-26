/**
 * Meta model provider for A11yForge — the only Meta model caller.
 *
 * Phase 3: bounded diagnosis calls with JSON-Schema constrained decoding,
 * local Zod validation, and evidence-reference grounding. Every call needs
 * deterministic evidence attached; there are no open-ended agents here.
 */

export const META_PROVIDER_NAME = "a11yforge-meta";

export {
  CRITIC_MAX_OUTPUT_TOKENS,
  CRITIC_OPERATION,
  CRITIC_REASONING_EFFORT,
  DEFAULT_META_MODEL,
  DIAGNOSIS_MAX_OUTPUT_TOKENS,
  DIAGNOSIS_OPERATION,
  DIAGNOSIS_REASONING_EFFORT,
  MAX_MODEL_CALLS_ENV,
  META_API_BASE_URL,
  META_MODEL_ENV,
  MODEL_API_KEY_ENV,
  REPAIR_MAX_OUTPUT_TOKENS,
  REPAIR_OPERATION,
  REPAIR_REASONING_EFFORT,
  REVISION_OPERATION,
  getMaxModelCallsPerRun,
  getMetaModel,
  requireApiKey,
} from "./config.js";
export type { DiagnosisReasoningEffort } from "./config.js";
export {
  CRITIC_SYSTEM_PROMPT,
  DIAGNOSIS_SYSTEM_PROMPT,
  REPAIR_SYSTEM_PROMPT,
  REVISION_SYSTEM_PROMPT,
} from "./prompt.js";
export {
  ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
  CRITIC_DECISION_JSON_SCHEMA,
  CRITIC_DECISION_JSON_SCHEMA_NAME,
  DIAGNOSIS_JSON_SCHEMA_NAME,
  REPAIR_PROPOSAL_JSON_SCHEMA,
  REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
export { critiqueRepairWithMeta } from "./critic.js";
export type {
  CritiqueRepairOptions,
  CritiqueRepairResult,
} from "./critic.js";
export type { JsonSchemaDocument } from "./jsonschema.js";
export { ModelCallBudget, ModelCallBudgetExhaustedError } from "./budget.js";
export { assertRepairEvidenceKnown, proposeRepairWithMeta } from "./repair.js";
export type {
  ProposeRepairOptions,
  ProposeRepairResult,
} from "./repair.js";
export { proposeRepairRevisionWithMeta } from "./revision.js";
export type {
  ProposeRevisionOptions,
  ProposeRevisionResult,
} from "./revision.js";
export {
  MetaApiError,
  MetaMalformedResultError,
  UnknownEvidenceReferenceError,
  assertEvidenceReferencesKnown,
  diagnoseWithMeta,
} from "./provider.js";
export type {
  DiagnoseOptions,
  DiagnoseResult,
  MetaFetch,
} from "./provider.js";
