import { z } from "zod";

/**
 * Phase 3 structured diagnosis schemas.
 *
 * The model interprets deterministic evidence; it never establishes browser
 * facts. Every diagnosis cites evidence IDs from the supplied bundle, and the
 * engine rejects any diagnosis that references an unknown ID. No source code
 * is sent to the model and none may be invented by it.
 */

/** Minimal issue taxonomy — a coarse label, not a full WCAG mapping. */
export const IssueTypeSchema = z.enum([
  "focus-containment",
  "accessible-name",
  "missing-alt",
  "missing-label",
  "contrast",
  "unknown",
]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

/** Severity vocabulary shared with the axe impact scale. */
export const DiagnosisSeveritySchema = z.enum([
  "minor",
  "moderate",
  "serious",
  "critical",
]);
export type DiagnosisSeverity = z.infer<typeof DiagnosisSeveritySchema>;

/**
 * Structured accessibility diagnosis returned by the Meta model.
 *
 * Grounding contract:
 * - `observedFailure` restates only what the cited evidence shows.
 * - `likelyCause` / `recommendedRepairStrategy` are inference, expressed as
 *   a strategy (never a code patch, file, or line number).
 * - `needsSourceContext` is true when confirming the cause needs repository
 *   inspection (a later phase — never this one).
 */
export const AccessibilityDiagnosisSchema = z.object({
  /** Stable diagnosis id (e.g. `diag-<run-id-suffix>`). */
  diagnosisId: z.string().min(1),
  /** Coarse issue class. */
  issueType: IssueTypeSchema,
  /** Short human-readable title. */
  title: z.string().min(1).max(160),
  /** One-paragraph explanation of the diagnosed issue. */
  summary: z.string().min(1).max(2000),
  /** Severity of the barrier. */
  severity: DiagnosisSeveritySchema,
  /** Model confidence in the diagnosis, 0 (guessing) to 1 (certain). */
  confidence: z.number().min(0).max(1),
  /** Interaction strategies implicated (e.g. `keyboard-navigation`). */
  affectedStrategies: z.array(z.string().min(1)).min(1),
  /** Evidence IDs cited — every one must exist in the supplied bundle. */
  evidenceIds: z.array(z.string().min(1)).min(1),
  /** What the evidence shows happened (observed fact, not inference). */
  observedFailure: z.string().min(1).max(2000),
  /** The model's best explanation of why (inference, not a source claim). */
  likelyCause: z.string().min(1).max(2000),
  /** What to do about it, as a strategy — never a code patch. */
  recommendedRepairStrategy: z.string().min(1).max(2000),
  /** WCAG success criteria believed relevant (e.g. `2.4.3`). */
  relevantWcagCriteria: z.array(z.string().min(1)),
  /** True when confirming the cause needs repository/source inspection. */
  needsSourceContext: z.boolean(),
});
export type AccessibilityDiagnosis = z.infer<
  typeof AccessibilityDiagnosisSchema
>;

/** Kind of one compact evidence item in a diagnosis bundle. */
export const EvidenceItemKindSchema = z.enum([
  "modal-open",
  "focus-observation",
  "focus-escape",
  "assertion-result",
]);
export type EvidenceItemKind = z.infer<typeof EvidenceItemKindSchema>;

/** One compact, citable evidence item. Screenshots and binaries excluded. */
export const EvidenceItemSchema = z.object({
  /** Stable citable id (e.g. `ev-focus-escape`). */
  id: z.string().min(1),
  kind: EvidenceItemKindSchema,
  /** One-line human-readable description of what this item establishes. */
  summary: z.string().min(1).max(500),
  /** Focused element selector, when the item is about a focus state. */
  selector: z.string().min(1).optional(),
  /** Whether the focused element was inside the expected modal region. */
  insideModal: z.boolean().optional(),
  /** Deterministic role of the focused element, when known. */
  role: z.string().nullable().optional(),
  /** Deterministic accessible name of the focused element, when known. */
  accessibleName: z.string().max(200).optional(),
  /** Bounded outer-HTML of the focused element, when known. */
  html: z.string().max(500).optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Compact evidence bundle for one `focus-contained-in-modal` failure.
 * Only the failing assertion and the focus states that diagnose it — no
 * event history, screenshots, axe findings, or page dumps.
 */
export const EvidenceBundleSchema = z.object({
  /** Bundle id, derived from the source scenario run id. */
  bundleId: z.string().min(1),
  /** Scenario that produced the evidence. */
  scenarioId: z.string().min(1),
  /** URL the evidence was collected from. */
  targetUrl: z.string().min(1),
  /** Assertion that failed. */
  assertion: z.literal("focus-contained-in-modal"),
  /** Modal region focus was expected to stay inside. */
  expectedRegion: z.string().min(1),
  /** Observation seq where focus escaped. */
  failedStep: z.number().int().nonnegative(),
  /** Key pressed on the failing step (null when not key-driven). */
  failingKey: z.string().nullable(),
  /** Selector that actually held focus on the failing step. */
  actualFocus: z.string().min(1),
  /** Compact citable evidence items. */
  items: z.array(EvidenceItemSchema).min(1),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

/** IDs citable by a diagnosis for one bundle. */
export function evidenceIdsOf(bundle: EvidenceBundle): Set<string> {
  return new Set(bundle.items.map((item) => item.id));
}

/**
 * Usage telemetry for one Meta model call. Only fields the API exposes are
 * recorded — absent fields stay null and are never fabricated.
 */
export const ModelUsageSchema = z.object({
  model: z.string().min(1),
  operation: z.string().min(1),
  inputTokens: z.number().int().nonnegative().nullable(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
  requestId: z.string().min(1).nullable(),
});
export type ModelUsage = z.infer<typeof ModelUsageSchema>;
