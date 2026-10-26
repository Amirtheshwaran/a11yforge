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
 * Conservative output budget for a single structured diagnosis.
 * A diagnosis is a short fixed-schema object; 1500 tokens is ample while
 * keeping the billed output small. Documented here per the Phase 3 spec.
 */
export const DIAGNOSIS_MAX_OUTPUT_TOKENS = 1500;

/** Operation label recorded in usage telemetry and terminal output. */
export const DIAGNOSIS_OPERATION = "accessibility-diagnosis";

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
        `a live diagnosis (e.g. \`export ${MODEL_API_KEY_ENV}=<your-key>\`). ` +
        `No request was attempted and no test runs one.`,
    );
  }
  return key;
}
