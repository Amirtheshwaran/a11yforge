/**
 * Meta model provider for A11yForge — the only Meta model caller.
 *
 * Phase 3: bounded diagnosis calls with JSON-Schema constrained decoding,
 * local Zod validation, and evidence-reference grounding. Every call needs
 * deterministic evidence attached; there are no open-ended agents here.
 */

export const META_PROVIDER_NAME = "a11yforge-meta";

export {
  DEFAULT_META_MODEL,
  DIAGNOSIS_MAX_OUTPUT_TOKENS,
  DIAGNOSIS_OPERATION,
  DIAGNOSIS_REASONING_EFFORT,
  MAX_MODEL_CALLS_ENV,
  META_API_BASE_URL,
  META_MODEL_ENV,
  MODEL_API_KEY_ENV,
  getMaxModelCallsPerRun,
  getMetaModel,
  requireApiKey,
} from "./config.js";
export type { DiagnosisReasoningEffort } from "./config.js";
export { DIAGNOSIS_SYSTEM_PROMPT } from "./prompt.js";
export {
  ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
  DIAGNOSIS_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
export type { JsonSchemaDocument } from "./jsonschema.js";
export { ModelCallBudget, ModelCallBudgetExhaustedError } from "./budget.js";
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
