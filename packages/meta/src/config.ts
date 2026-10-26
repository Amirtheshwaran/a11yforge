/**
 * Centralized Meta Model API configuration.
 *
 * All model/API settings live here: base URL, default model, env names, and
 * output budget. Nothing here holds a secret — the API key is read from the
 * environment only when a live request is actually made.
 */

/** OpenAI-compatible Chat Completions endpoint for Meta models. */
export const META_API_BASE_URL = "https://api.meta.ai/v1";

/** Default model for accessibility diagnosis. */
export const DEFAULT_META_MODEL = "muse-spark-1.3-contributor";

/** Environment variable carrying the Meta API key (never hard-coded). */
export const MODEL_API_KEY_ENV = "MODEL_API_KEY";

/** Environment variable overriding the diagnosis model. */
export const META_MODEL_ENV = "A11YFORGE_META_MODEL";

/** Environment variable capping model calls per run. */
export const MAX_MODEL_CALLS_ENV = "A11YFORGE_MAX_MODEL_CALLS_PER_RUN";

/** Default cap: `diagnose:fixture` makes at most one model call. */
export const DEFAULT_MAX_MODEL_CALLS_PER_RUN = 1;

/**
 * Completion budget for a single structured diagnosis.
 *
 * Muse Spark is a reasoning model: hidden reasoning tokens count against
 * `max_completion_tokens`, so the budget must leave room for both private
 * reasoning and the (small) visible structured diagnosis. A live Phase 3
 * call with ~1500 tokens was exhausted by reasoning alone and returned
 * empty `message.content` with `finish_reason: "length"`. 4096 is a
 * maximum, not a target — unused tokens cost nothing.
 */
export const DIAGNOSIS_MAX_OUTPUT_TOKENS = 4096;

/** Reasoning-effort levels accepted by the Meta Chat Completions API. */
export type DiagnosisReasoningEffort = "low" | "medium" | "high";

/**
 * Reasoning effort for the accessibility diagnosis request.
 *
 * Diagnosis is a bounded evidence-classification task, not open-ended
 * reasoning, so `"low"` keeps hidden reasoning tokens small and leaves the
 * completion budget for the visible structured output. Centralized here so
 * it is easy to raise later if diagnoses need deeper inference.
 */
export const DIAGNOSIS_REASONING_EFFORT: DiagnosisReasoningEffort = "low";

/** Operation label recorded in usage telemetry and terminal output. */
export const DIAGNOSIS_OPERATION = "accessibility-diagnosis";

/** Operation label for the repair-proposal request (telemetry-distinct). */
export const REPAIR_OPERATION = "accessibility-repair-proposal";

/** Operation label for the bounded repair-revision request (telemetry-distinct). */
export const REVISION_OPERATION = "accessibility-repair-revision";

/** Operation label for the repair-critic request (telemetry-distinct). */
export const CRITIC_OPERATION = "repair-critic-review";

/**
 * Completion budget for a single structured critic decision.
 *
 * A verdict is smaller than a proposal (no source text carried), so 2048
 * is the starting budget — a maximum, not a target.
 */
export const CRITIC_MAX_OUTPUT_TOKENS = 2048;

/**
 * Reasoning effort for the critic request.
 *
 * Adjudicating supplied evidence against a fixed schema is bounded work,
 * not open-ended reasoning, so `"low"` leaves the completion budget for
 * the visible structured verdict.
 */
export const CRITIC_REASONING_EFFORT: DiagnosisReasoningEffort = "low";

/**
 * Completion budget for a single structured repair proposal.
 *
 * A small code-repair proposal needs more visible output than a diagnosis
 * (structured edits carry full replacement text), so 4096 is the starting
 * budget — a maximum, not a target. Reasoning models consume hidden
 * reasoning tokens from the same `max_completion_tokens` pool, and `"low"`
 * effort keeps that share small.
 */
export const REPAIR_MAX_OUTPUT_TOKENS = 4096;

/**
 * Reasoning effort for the repair-proposal request.
 *
 * Proposing a minimal anchored edit is bounded work, not open-ended
 * reasoning, so `"low"` leaves the completion budget for the visible
 * structured proposal.
 */
export const REPAIR_REASONING_EFFORT: DiagnosisReasoningEffort = "low";

/** Active model: override env or the default. */
export function getMetaModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env[META_MODEL_ENV]?.trim();
  return override === undefined || override === ""
    ? DEFAULT_META_MODEL
    : override;
}

/**
 * Active per-run call budget. Falls back to the default when unset;
 * throws on non-integer or < 1 values rather than silently widening.
 */
export function getMaxModelCallsPerRun(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[MAX_MODEL_CALLS_ENV]?.trim();
  if (raw === undefined || raw === "") {
    return DEFAULT_MAX_MODEL_CALLS_PER_RUN;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `${MAX_MODEL_CALLS_ENV} must be a positive integer, got: ${raw}`,
    );
  }
  return parsed;
}

/**
 * Read the API key for a live request. Throws BEFORE any network attempt
 * when the key is missing, explaining how to provide it without ever
 * printing or describing a secret value.
 */
export function requireApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env[MODEL_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new Error(
      `Missing ${MODEL_API_KEY_ENV}: export it in your shell before running ` +
        `a live model request (e.g. \`export ${MODEL_API_KEY_ENV}=<your-key>\`). ` +
        `No request was attempted and no test runs one.`,
    );
  }
  return key;
}
