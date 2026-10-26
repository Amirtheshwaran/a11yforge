import { z } from "zod";
import { toDisplayPath } from "./runview.js";

/**
 * Phase 6.5 live-run stream schemas.
 *
 * The observable counterpart to the stored run artifacts: while the
 * autonomous pipeline executes, the API streams `LiveRunEvent` records over
 * Server-Sent Events and the web console renders them. Every event
 * describes pipeline state that actually occurred — stages are never
 * invented for animation — and every string is frontend-safe (bounded,
 * secret-free, absolute paths reduced to display forms).
 */

/** Observable pipeline event types. Each one mirrors a real stage outcome. */
export const LiveRunEventTypeSchema = z.enum([
  "run-started",
  "scanner-started",
  "scanner-completed",
  "keyboard-test-started",
  "keyboard-test-completed",
  "focus-escape-detected",
  "diagnosis-started",
  "diagnosis-completed",
  "source-trace-started",
  "source-candidate-selected",
  "repair-proposal-started",
  "repair-proposal-completed",
  "repair-applied",
  "typecheck-started",
  "typecheck-passed",
  "typecheck-failed",
  "verifier-feedback-created",
  "repair-revision-started",
  "repair-revision-completed",
  "build-passed",
  "build-failed",
  "replay-passed",
  "replay-failed",
  "axe-regression-passed",
  "axe-regression-failed",
  "critic-started",
  "critic-completed",
  "repair-accepted",
  "repair-rejected",
  "run-completed",
  "run-failed",
]);
export type LiveRunEventType = z.infer<typeof LiveRunEventTypeSchema>;

/** Coarse pipeline stage an event belongs to. */
export const LiveRunStageSchema = z.enum([
  "run",
  "scan",
  "keyboard",
  "diagnosis",
  "trace",
  "proposal",
  "verify-attempt-1",
  "feedback",
  "revision",
  "verify-attempt-2",
  "critic",
  "decision",
]);
export type LiveRunStage = z.infer<typeof LiveRunStageSchema>;

/** Per-event delivery status (progress marker, not a verdict). */
export const LiveRunEventStatusSchema = z.enum([
  "started",
  "progress",
  "completed",
  "failed",
  "info",
]);
export type LiveRunEventStatus = z.infer<typeof LiveRunEventStatusSchema>;

/** Frontend-safe metadata: short strings, small arrays, plain objects. */
export const LiveRunEventMetadataSchema = z.record(
  z.string().min(1).max(64),
  z.unknown(),
);
export type LiveRunEventMetadata = z.infer<typeof LiveRunEventMetadataSchema>;

/**
 * One observable pipeline event.
 *
 * `metadata` is bounded and frontend-safe: secrets are stripped,
 * absolute paths are reduced to repo-relative display forms, strings are
 * truncated, and the whole object stays small. See `sanitizeLiveMetadata`.
 */
export const LiveRunEventSchema = z.object({
  eventId: z.string().min(1).max(80),
  runId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
  type: LiveRunEventTypeSchema,
  stage: LiveRunStageSchema,
  status: LiveRunEventStatusSchema,
  message: z.string().min(1).max(500),
  metadata: LiveRunEventMetadataSchema.default({}),
});
export type LiveRunEvent = z.infer<typeof LiveRunEventSchema>;

/** Lifecycle of one orchestrated autonomous run. */
export const LiveRunStateSchema = z.enum(["RUNNING", "COMPLETED", "FAILED"]);
export type LiveRunState = z.infer<typeof LiveRunStateSchema>;

/** One row of the persisted model-spend ledger. */
export const ModelSpendRowSchema = z.object({
  operation: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
  requestId: z.string().max(120).nullable(),
});
export type ModelSpendRow = z.infer<typeof ModelSpendRowSchema>;

/** Compact inference-usage summary shown in the UI after a run. */
export const ModelSpendSummarySchema = z.object({
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  operations: z.array(ModelSpendRowSchema),
});
export type ModelSpendSummary = z.infer<typeof ModelSpendSummarySchema>;

/** One live pipeline stage for the console timeline. */
export const LivePipelineStageSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  state: z.enum(["pending", "running", "passed", "failed", "skipped"]),
  detail: z.string().max(300).optional(),
});
export type LivePipelineStage = z.infer<typeof LivePipelineStageSchema>;

/** Live status snapshot polled by the console between events. */
export const LiveRunStatusSchema = z.object({
  runId: z.string().min(1).max(128),
  state: LiveRunStateSchema,
  currentStage: z.string().min(1).max(64).nullable(),
  stages: z.array(LivePipelineStageSchema),
  usage: ModelSpendSummarySchema,
  error: z.string().max(500).nullable(),
  eventCount: z.number().int().nonnegative(),
  finalState: z.string().max(64).nullable(),
  /** Allow-listed artifact files present in the run dir (progressive evidence). */
  artifacts: z.array(z.string().min(1)).default([]),
  updatedAt: z.string().min(1),
});
export type LiveRunStatus = z.infer<typeof LiveRunStatusSchema>;

const SECRET_KEY_PATTERN =
  /(secret|credential|api[-_]?key|auth|token|passwd|private[-_]?key|\.pem$|\.key$)/i;

const SECRET_VALUE_PATTERN =
  /(MODEL_API_KEY|api\.meta\.ai|sk-[A-Za-z0-9]|bearer\s+[A-Za-z0-9._~-]+|"authorization"|"x-api-key")/i;

const MAX_STRING_CHARS = 300;
const MAX_ARRAY_ITEMS = 20;
const MAX_METADATA_JSON_CHARS = 4000;

/** True when an absolute-looking path should be reduced for display. */
function looksLikePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:\\/.test(value) ||
    value.includes("/fixtures/") ||
    value.includes("/packages/") ||
    value.includes("/apps/")
  );
}

function sanitizeString(value: string): string {
  let out = value;
  if (SECRET_VALUE_PATTERN.test(out)) {
    return "[redacted]";
  }
  if (looksLikePath(out)) {
    out = toDisplayPath(out);
  }
  return out.length > MAX_STRING_CHARS
    ? `${out.slice(0, MAX_STRING_CHARS)}…`
    : out;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value) ? value : null;
  }
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key.length === 0 || key.length > 64) continue;
      if (SECRET_KEY_PATTERN.test(key)) continue;
      out[key] = sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return null;
}

/**
 * Fail-closed metadata sanitizer: strips secret keys/values, reduces
 * absolute paths to repo-relative display forms, and bounds every string,
 * array, and the total payload. Always returns a plain JSON object that
 * `LiveRunEventMetadataSchema` accepts.
 */
export function sanitizeLiveMetadata(value: unknown): LiveRunEventMetadata {
  const cleaned =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (sanitizeValue(value, 0) as Record<string, unknown>)
      : {};
  let text = JSON.stringify(cleaned) ?? "{}";
  if (text.length > MAX_METADATA_JSON_CHARS) {
    text = `${text.slice(0, MAX_METADATA_JSON_CHARS)}…`;
    try {
      const parsed = JSON.parse(text.slice(0, text.lastIndexOf("…"))) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return LiveRunEventMetadataSchema.parse({
          ...(parsed as Record<string, unknown>),
          truncated: true,
        });
      }
    } catch {
      /* fall through to the bounded marker */
    }
    return { truncated: true };
  }
  return LiveRunEventMetadataSchema.parse(cleaned);
}

/** Sanitize a free-text status/error line for the frontend. */
export function sanitizeLiveMessage(value: string): string {
  return sanitizeString(value).slice(0, 500);
}

interface StageFold {
  state: LivePipelineStage["state"];
  detail?: string;
}

const LIVE_STAGE_ORDER = [
  "scan",
  "keyboard",
  "diagnosis",
  "trace",
  "proposal",
  "verify-attempt-1",
  "feedback",
  "revision",
  "verify-attempt-2",
  "critic",
  "decision",
] as const;

const LIVE_STAGE_LABELS: Record<(typeof LIVE_STAGE_ORDER)[number], string> = {
  scan: "Scanning",
  keyboard: "Keyboard test",
  diagnosis: "Diagnosing",
  trace: "Tracing source",
  proposal: "Proposing repair",
  "verify-attempt-1": "Verifying attempt 1",
  feedback: "Verifier feedback",
  revision: "Revising",
  "verify-attempt-2": "Verifying attempt 2",
  critic: "Critic",
  decision: "Decision",
};

type StageId = (typeof LIVE_STAGE_ORDER)[number];

/**
 * Pure projection of live events onto the console pipeline.
 *
 * Folds the event stream in order: started → running, completed/passed →
 * passed, failed → failed. Verification outcome events land on Attempt 1
 * until a revision starts, then on Attempt 2. Stages with no revision
 * events stay pending during the run and become skipped once the run ends
 * without them. Unknown ordering never throws — unseen stages stay pending.
 */
export function projectLiveStages(events: LiveRunEvent[]): LivePipelineStage[] {
  const fold = new Map<StageId, StageFold>();
  for (const id of LIVE_STAGE_ORDER) {
    fold.set(id, { state: "pending" });
  }
  let revised = false;
  let ended = false;
  let endState: string | null = null;

  const set = (id: StageId, state: StageFold["state"], detail?: string): void => {
    const current = fold.get(id);
    if (current === undefined) return;
    current.state = state;
    if (detail !== undefined) current.detail = detail.slice(0, 300);
  };

  const verifyStage = (): StageId => (revised ? "verify-attempt-2" : "verify-attempt-1");

  for (const event of events) {
    switch (event.type) {
      case "run-started":
        break;
      case "scanner-started":
        set("scan", "running", event.message);
        break;
      case "scanner-completed":
        set("scan", "passed", event.message);
        break;
      case "keyboard-test-started":
        set("keyboard", "running", event.message);
        break;
      case "focus-escape-detected":
        set("keyboard", "running", event.message);
        break;
      case "keyboard-test-completed":
        set("keyboard", "passed", event.message);
        break;
      case "diagnosis-started":
        set("diagnosis", "running", event.message);
        break;
      case "diagnosis-completed":
        set("diagnosis", "passed", event.message);
        break;
      case "source-trace-started":
        set("trace", "running", event.message);
        break;
      case "source-candidate-selected":
        set("trace", "passed", event.message);
        break;
      case "repair-proposal-started":
        set("proposal", "running", event.message);
        break;
      case "repair-proposal-completed":
        set("proposal", "passed", event.message);
        break;
      case "repair-applied":
        set(verifyStage(), "running", event.message);
        break;
      case "typecheck-started":
        set(verifyStage(), "running", event.message);
        break;
      case "typecheck-passed":
      case "build-passed":
      case "replay-passed":
      case "axe-regression-passed":
        set(verifyStage(), "running", event.message);
        break;
      case "typecheck-failed":
      case "build-failed":
      case "replay-failed":
      case "axe-regression-failed":
        set(verifyStage(), "failed", event.message);
        break;
      case "verifier-feedback-created":
        set("feedback", "passed", event.message);
        break;
      case "repair-revision-started":
        revised = true;
        set("revision", "running", event.message);
        break;
      case "repair-revision-completed":
        set("revision", "passed", event.message);
        break;
      case "critic-started":
        set("critic", "running", event.message);
        break;
      case "critic-completed":
        set("critic", "passed", event.message);
        break;
      case "repair-accepted":
        set("decision", "passed", event.message);
        endState = "accepted";
        break;
      case "repair-rejected":
        set("decision", "failed", event.message);
        endState = "rejected";
        break;
      case "run-completed":
        ended = true;
        break;
      case "run-failed":
        ended = true;
        endState = "failed";
        break;
    }
  }

  if (ended) {
    const verify1 = fold.get("verify-attempt-1");
    if (verify1?.state === "running") {
      verify1.state = endState === "failed" ? "failed" : "passed";
    }
    const verify2 = fold.get("verify-attempt-2");
    if (!revised) {
      const revision = fold.get("revision");
      if (revision?.state === "pending") revision.state = "skipped";
      if (verify2?.state === "pending") verify2.state = "skipped";
      const feedback = fold.get("feedback");
      if (feedback?.state === "pending") feedback.state = "skipped";
    } else if (verify2?.state === "running") {
      verify2.state = endState === "failed" ? "failed" : "passed";
    }
    const critic = fold.get("critic");
    if (critic?.state === "pending") critic.state = "skipped";
  }

  return LIVE_STAGE_ORDER.map((id) => {
    const current = fold.get(id);
    const stage: LivePipelineStage = {
      id,
      label: LIVE_STAGE_LABELS[id],
      state: current?.state ?? "pending",
    };
    if (current?.detail !== undefined) stage.detail = current.detail;
    return stage;
  });
}

/** Empty spend summary for a run that has made no model calls yet. */
export function emptySpendSummary(): ModelSpendSummary {
  return {
    calls: 0,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    operations: [],
  };
}
