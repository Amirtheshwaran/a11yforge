import { z } from "zod";

/**
 * Phase 6 frontend-safe run view model.
 *
 * This is the ONLY shape the web UI consumes. It is a compact,
 * presentation-oriented projection of the local run artifacts — never the
 * internal structures wholesale. Every string in this model is safe to
 * render: absolute filesystem paths are stripped at construction time,
 * secrets are never included, and artifact access goes through opaque
 * API URLs (never local paths).
 */

/** One focus step in the deterministic keyboard trace. */
export const FocusTraceStepSchema = z.object({
  seq: z.number().int().nonnegative(),
  selector: z.string().min(1),
  insideModal: z.boolean(),
  role: z.string().nullable().optional(),
  accessibleName: z.string().max(200).optional(),
});
export type FocusTraceStep = z.infer<typeof FocusTraceStepSchema>;

/** One repair attempt (Attempt 1 = rejected, Attempt 2 = accepted revision). */
export const AttemptViewSchema = z.object({
  attempt: z.number().int().positive(),
  proposalId: z.string().min(1),
  repairId: z.string().min(1),
  summary: z.string().min(1),
  /** Terminal lifecycle state (e.g. REGRESSION_FAILED, ACCEPTED). */
  state: z.string().min(1),
  behaviorFixed: z.boolean(),
  typecheckPassed: z.boolean(),
  buildPassed: z.boolean(),
  scenarioPassed: z.boolean(),
  /** Opaque API URL serving the deterministic unified diff, if present. */
  diffUrl: z.string().min(1).nullable(),
  /** Short human sentence explaining why this attempt ended this way. */
  outcomeNote: z.string().min(1),
  /** Exact compiler diagnostic codes when typecheck failed (e.g. TS18048). */
  diagnosticCodes: z.array(z.string().min(1)),
});
export type AttemptView = z.infer<typeof AttemptViewSchema>;

/** Deterministic gate outcomes for the accepted attempt — measured, never inferred. */
export const VerificationViewSchema = z.object({
  typecheckPassed: z.boolean(),
  buildPassed: z.boolean(),
  primaryReplayPassed: z.boolean(),
  reverseReplayPassed: z.boolean(),
  axeBaselinePreserved: z.boolean(),
  newSeriousCritical: z.array(z.string().min(1)),
  decisionBasis: z.string().min(1),
});
export type VerificationView = z.infer<typeof VerificationViewSchema>;

/** AI critic verdict — kept visually separate from the deterministic gates. */
export const CriticViewSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  remainingRisks: z.array(z.string().min(1)),
  verificationConcerns: z.array(z.string().min(1)),
});
export type CriticView = z.infer<typeof CriticViewSchema>;

/** One pipeline stage for the timeline. */
export const PipelineStageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["success", "failed", "current", "pending"]),
  detail: z.string().max(300).optional(),
});
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/**
 * Compact frontend-safe projection of one autonomous repair run.
 */
export const RunViewModelSchema = z.object({
  runId: z.string().min(1),
  scenarioId: z.string().min(1),
  /** Human target label — never a URL with a port, never a filesystem path. */
  targetLabel: z.string().min(1),
  model: z.string().min(1),
  evidenceCount: z.number().int().nonnegative(),
  /** Repo-relative source file (e.g. src/App.tsx) — never absolute. */
  sourceFile: z.string().min(1),
  finalStatus: z.string().min(1),
  finalConfidence: z.number().min(0).max(1).nullable(),
  finding: z.object({
    assertion: z.string().min(1),
    expectedRegion: z.string().min(1),
    actualFocusBefore: z.string().min(1),
    passedBefore: z.boolean(),
  }),
  focusTrace: z.array(FocusTraceStepSchema).min(1),
  diagnosis: z.object({
    title: z.string().min(1),
    issueType: z.string().min(1),
    severity: z.string().min(1),
    confidence: z.number().min(0).max(1),
    observedFailure: z.string().min(1),
    likelyCause: z.string().min(1),
    recommendedRepairStrategy: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    wcagCriteria: z.array(z.string().min(1)),
  }),
  sourceTrace: z.object({
    topFile: z.string().min(1),
    score: z.number(),
    matchedTerms: z.array(z.string().min(1)),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  attempts: z.array(AttemptViewSchema).min(1).max(2),
  verification: VerificationViewSchema,
  critic: CriticViewSchema.nullable(),
  pipeline: z.array(PipelineStageSchema).min(1),
  artifacts: z.object({
    /** Opaque API URLs for screenshots that exist for this run. */
    beforeModalUrl: z.string().min(1).nullable(),
    modalOpenUrl: z.string().min(1).nullable(),
    focusEscapedUrl: z.string().min(1).nullable(),
    afterUrl: z.string().min(1).nullable(),
  }),
});
export type RunViewModel = z.infer<typeof RunViewModelSchema>;

/** Summarized run for the selector list — no evidence payload. */
export const RunSummarySchema = z.object({
  runId: z.string().min(1),
  scenarioId: z.string().min(1),
  targetLabel: z.string().min(1),
  finalStatus: z.string().min(1),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

/**
 * Artifact file names the API is willing to serve. Anything else —
 * including any name containing a path separator — is refused.
 * PNG screenshots, JSON evidence, and deterministic unified-diff patches
 * only. Patches contain bounded source excerpts of the accepted change.
 */
const ALLOWED_ARTIFACT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(png|json|patch)$/;

const SECRET_NAME_PATTERN =
  /(secret|credential|api[-_]?key|token|passwd|private[-_]?key|\.pem$|\.key$)/i;

/** True when `name` is a servable artifact file name (no traversal possible). */
export function isAllowedArtifactName(name: string): boolean {
  if (!ALLOWED_ARTIFACT_PATTERN.test(name)) return false;
  if (SECRET_NAME_PATTERN.test(name)) return false;
  if (name.includes("..")) return false;
  return true;
}

/**
 * Strip any absolute filesystem path down to a repo-relative display form.
 * Returns the input unchanged when it is already relative.
 */
export function toDisplayPath(maybeAbsolute: string): string {
  const markers = ["fixtures/", "src/", "apps/", "packages/"];
  for (const marker of markers) {
    const idx = maybeAbsolute.indexOf(marker);
    if (idx >= 0) return maybeAbsolute.slice(idx);
  }
  if (maybeAbsolute.startsWith("/")) {
    const parts = maybeAbsolute.split("/").filter(Boolean);
    return parts.slice(-2).join("/");
  }
  return maybeAbsolute;
}

/**
 * Fail-closed secret scan for a JSON-serializable value: true when no
 * known secret key or key-like value shape is present.
 */
export function containsNoSecrets(value: unknown): boolean {
  const text = JSON.stringify(value) ?? "";
  return !/(MODEL_API_KEY|api\.meta\.ai|sk-[A-Za-z0-9]|"authorization"|"x-api-key")/i.test(
    text,
  );
}
