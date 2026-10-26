import { z } from "zod";

/**
 * Phase 1 deterministic accessibility evidence.
 *
 * These schemas are the single source of truth for scanner output shared
 * between the engine, API, and web app. They hold objective facts only
 * (rule, impact, selector, HTML fragment, failure summary, URL) — no
 * interpretation or diagnosis. AI reasoning is a later phase and consumes
 * this evidence; it never replaces it.
 *
 * Normalization choice: one axe violation affecting N DOM nodes becomes N
 * individual findings (one per node), each carrying the rule metadata plus
 * its own selector, HTML fragment, and failure summary. Per-node findings
 * make Phase 4 source tracing trivial (one failing node maps to the
 * component that renders it) and keep before/after verification diffs exact.
 */

const IMPACT_VALUES = ["minor", "moderate", "serious", "critical"] as const;

/** axe impact level. `null` when axe reports no impact for the rule. */
export const ImpactSchema = z.enum(IMPACT_VALUES).nullable();
export type Impact = z.infer<typeof ImpactSchema>;

/** One affected DOM node for one axe rule violation. */
export const AccessibilityFindingSchema = z.object({
  /** Stable finding id: `<ruleId>#<per-rule node index>` (e.g. `label#0`). */
  id: z.string().min(1),
  /** axe-core rule id (e.g. `button-name`, `image-alt`, `label`). */
  ruleId: z.string().min(1),
  /** axe impact, or null when axe reports none. */
  impact: ImpactSchema,
  /** Short axe rule description (no interpretation added). */
  description: z.string(),
  /** axe "help" text for the rule. */
  help: z.string(),
  /** URL of the axe rule documentation. */
  helpUrl: z.string(),
  /** Scanned page URL the finding was collected from. */
  pageUrl: z.string(),
  /** CSS selector path of the affected node (first axe target chain). */
  selector: z.string(),
  /** Outer-HTML fragment of the affected node (truncated by the scanner). */
  html: z.string(),
  /** axe failure summary explaining which check failed. */
  failureSummary: z.string(),
});
export type AccessibilityFinding = z.infer<typeof AccessibilityFindingSchema>;

/** Minimal top-level result for one page scan. */
export const AccessibilityScanResultSchema = z.object({
  /** Filesystem-safe run id, also used as the artifact directory name. */
  scanId: z.string().min(1),
  /** Scanned page URL. */
  pageUrl: z.string(),
  /** ISO-8601 timestamp when the scan started. */
  startedAt: z.string(),
  /** ISO-8601 timestamp when the scan finished. */
  completedAt: z.string(),
  /** One entry per affected node (see normalization note above). */
  findings: z.array(AccessibilityFindingSchema),
});
export type AccessibilityScanResult = z.infer<
  typeof AccessibilityScanResultSchema
>;
