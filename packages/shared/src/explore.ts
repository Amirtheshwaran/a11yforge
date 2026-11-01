import { z } from "zod";

/**
 * Phase 8 — universal exploration schemas.
 *
 * These shapes describe target-independent browser exploration: a reachable
 * web application is submitted by URL, discovered through real browser
 * semantics, probed with generic accessibility probes, and projected into
 * human-readable findings. No fixture, framework, or application knowledge
 * lives here — only accessibility standards and browser semantics.
 */

// ---------------------------------------------------------------------------
// WebTarget
// ---------------------------------------------------------------------------

export const ExplorationPolicySchema = z.object({
  /** Maximum number of same-origin pages to visit (bounded crawler). */
  maxPages: z.number().int().min(1).max(25).default(3),
  /** Total wall-clock budget for the whole exploration. */
  maxDurationMs: z.number().int().min(5_000).max(600_000).default(120_000),
  /** Maximum Tab steps per page in the keyboard traversal probe. */
  maxTabStepsPerPage: z.number().int().min(1).max(100).default(25),
  /** Maximum screenshots retained for the run. */
  maxScreenshots: z.number().int().min(0).max(25).default(8),
  /** Maximum per-navigation timeout. */
  navigationTimeoutMs: z.number().int().min(1_000).max(120_000).default(20_000),
});

export type ExplorationPolicy = z.infer<typeof ExplorationPolicySchema>;

export const WebTargetSchema = z.object({
  targetId: z.string().min(1),
  /** URL exactly as submitted by the user. */
  entryUrl: z.string().min(1),
  /** Normalized canonical form (lowercased host, resolved dot segments). */
  normalizedUrl: z.string().url(),
  origin: z.string().min(1),
  createdAt: z.string().min(1),
  policy: ExplorationPolicySchema,
});

export type WebTarget = z.infer<typeof WebTargetSchema>;

// ---------------------------------------------------------------------------
// Element references (target-independent, derived from live page state)
// ---------------------------------------------------------------------------

export const ElementRefSchema = z.object({
  /** ARIA role or tag-derived role as exposed by the browser. */
  role: z.string().min(1),
  /** Accessible name computed by the browser, empty when unnamed. */
  accessibleName: z.string().default(""),
  /** Element id when present in the live DOM. */
  elementId: z.string().default(""),
  /** First stable data-* attribute (name=value) when present. */
  dataAttribute: z.string().default(""),
  /** Tag name, uppercase as reported by the DOM. */
  tagName: z.string().min(1),
  /** Ordinal among equivalent (same role+name) elements on the page. */
  ordinal: z.number().int().min(0),
  /** Bounded outerHTML fingerprint (truncated, never a full subtree). */
  fingerprint: z.string().default(""),
  /** DOM path fallback (e.g. body > main > button:nth-of-type(2)). */
  domPath: z.string().default(""),
  /** Selector generated from live state, only for reproducing an action. */
  replaySelector: z.string().default(""),
  /** Viewport-relative bounding box when measurable. */
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .default(null),
  /** True when the element is exposed to assistive technology. */
  exposed: z.boolean().default(true),
  disabled: z.boolean().default(false),
  tabIndex: z.number().int().nullable().default(null),
});

export type ElementRef = z.infer<typeof ElementRefSchema>;

// ---------------------------------------------------------------------------
// Page surface (generic interaction surface discovered from runtime semantics)
// ---------------------------------------------------------------------------

export const SurfaceControlSchema = z.object({
  ref: ElementRefSchema,
  ariaExpanded: z.string().nullable().default(null),
  ariaControls: z.string().nullable().default(null),
  ariaHaspopup: z.string().nullable().default(null),
  ariaSelected: z.string().nullable().default(null),
  required: z.boolean().default(false),
  invalid: z.boolean().default(false),
  describedBy: z.string().default(""),
  inputType: z.string().default(""),
});

export type SurfaceControl = z.infer<typeof SurfaceControlSchema>;

export const PageSurfaceSchema = z.object({
  pageUrl: z.string().min(1),
  finalUrl: z.string().min(1),
  title: z.string().default(""),
  headingCount: z.number().int().min(0),
  headings: z
    .array(z.object({ level: z.number().int(), name: z.string() }))
    .default([]),
  landmarkRoles: z.array(z.string()).default([]),
  linkCount: z.number().int().min(0),
  buttonCount: z.number().int().min(0),
  controls: z.array(SurfaceControlSchema).default([]),
  dialogCount: z.number().int().min(0),
  dialogs: z.array(ElementRefSchema).default([]),
  tablistCount: z.number().int().min(0),
  tabCount: z.number().int().min(0),
  menuCount: z.number().int().min(0),
  disclosureCount: z.number().int().min(0),
  keyboardOrderSize: z.number().int().min(0),
  sameOriginLinkCount: z.number().int().min(0),
});

export type PageSurface = z.infer<typeof PageSurfaceSchema>;

// ---------------------------------------------------------------------------
// Probe results
// ---------------------------------------------------------------------------

export const ProbeStatusSchema = z.enum([
  "passed",
  "failed",
  "observed",
  "not-applicable",
  "not-tested",
  "inconclusive",
]);

export type ProbeStatus = z.infer<typeof ProbeStatusSchema>;

export const ActionStepSchema = z.object({
  seq: z.number().int().min(0),
  action: z.string().min(1),
  detail: z.string().default(""),
  pageUrl: z.string().min(1),
  timestamp: z.string().min(1),
});

export type ActionStep = z.infer<typeof ActionStepSchema>;

export const ProbeEvidenceSchema = z.object({
  kind: z.string().min(1),
  summary: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type ProbeEvidence = z.infer<typeof ProbeEvidenceSchema>;

export const ProbeResultSchema = z.object({
  probeId: z.string().min(1),
  targetId: z.string().min(1),
  pageUrl: z.string().min(1),
  status: ProbeStatusSchema,
  /** Short human title, e.g. "Keyboard focus can leave this dialog". */
  title: z.string().min(1),
  /** One or two plain sentences describing what was found. */
  humanSummary: z.string().min(1),
  severity: z.enum(["critical", "serious", "moderate", "minor", "info"]).default("info"),
  evidence: z.array(ProbeEvidenceSchema).default([]),
  actionTrace: z.array(ActionStepSchema).default([]),
  screenshots: z.array(z.string()).default([]),
  standardReferences: z.array(z.string()).default([]),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
});

export type ProbeResult = z.infer<typeof ProbeResultSchema>;

// ---------------------------------------------------------------------------
// Findings (human-facing projection of probe results)
// ---------------------------------------------------------------------------

export const FindingCategorySchema = z.enum([
  "confirmed-failure",
  "automated-finding",
  "observation",
  "not-tested",
]);

export type FindingCategory = z.infer<typeof FindingCategorySchema>;

/**
 * Real measured geometry for one affected element, captured by Playwright
 * during the run. Coordinates are viewport-relative CSS pixels measured at
 * the same scroll position as `screenshot`; the frontend scales them by
 * display/native size. Never guessed — absent when unmeasurable.
 */
export const ElementHighlightSchema = z.object({
  /** Screenshot artifact name this box aligns to. */
  screenshot: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  /** Human element label, e.g. `"Search" button` or `image`. */
  label: z.string().min(1),
  /** Element selector, for Developer details only. */
  selector: z.string().default(""),
});

export type ElementHighlight = z.infer<typeof ElementHighlightSchema>;

export const ExplorationFindingSchema = z.object({
  findingId: z.string().min(1),
  category: FindingCategorySchema,
  title: z.string().min(1),
  /** "What happened" in plain language. */
  whatHappened: z.string().min(1),
  /** "Why this matters" in plain language. */
  whyItMatters: z.string().min(1),
  /** Deterministic reproduction steps in plain language. */
  howReproduced: z.array(z.string()).default([]),
  pageUrl: z.string().min(1),
  severity: z.enum(["critical", "serious", "moderate", "minor", "info"]).default("info"),
  probeId: z.string().min(1),
  screenshots: z.array(z.string()).default([]),
  standardReferences: z.array(z.string()).default([]),
  /** Measured element geometry; empty when nothing was measurable. */
  highlights: z.array(ElementHighlightSchema).default([]),
});

export type ExplorationFinding = z.infer<typeof ExplorationFindingSchema>;

// ---------------------------------------------------------------------------
// Exploration run + events
// ---------------------------------------------------------------------------

export const ExplorationStageSchema = z.enum([
  "opening",
  "exploring",
  "scanning",
  "interacting",
  "reviewing",
  "done",
]);

export type ExplorationStage = z.infer<typeof ExplorationStageSchema>;

export const EXPLORATION_STAGE_LABELS: Record<ExplorationStage, string> = {
  opening: "Opening website",
  exploring: "Exploring pages",
  scanning: "Testing accessibility",
  interacting: "Testing keyboard interactions",
  reviewing: "Reviewing evidence",
  done: "Done",
};

export const ExplorationEventSchema = z.object({
  eventId: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().min(0),
  timestamp: z.string().min(1),
  stage: ExplorationStageSchema,
  status: z.enum(["running", "passed", "failed", "skipped"]).default("running"),
  message: z.string().min(1),
});

export type ExplorationEvent = z.infer<typeof ExplorationEventSchema>;

export const ExplorationLimitationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  pageUrl: z.string().default(""),
});

export type ExplorationLimitation = z.infer<typeof ExplorationLimitationSchema>;

export const ExplorationRunSchema = z.object({
  runId: z.string().min(1),
  target: WebTargetSchema,
  state: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  stages: z.array(
    z.object({
      stage: ExplorationStageSchema,
      state: z.enum(["pending", "running", "passed", "failed", "skipped"]),
    }),
  ),
  pagesVisited: z.array(z.string()).default([]),
  surfaces: z.array(PageSurfaceSchema).default([]),
  probeResults: z.array(ProbeResultSchema).default([]),
  findings: z.array(ExplorationFindingSchema).default([]),
  limitations: z.array(ExplorationLimitationSchema).default([]),
  screenshots: z.array(z.string()).default([]),
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  /** Page-level captures survive scanner failures and retain their actual URL. */
  pageCaptures: z.array(z.object({
    pageUrl: z.string().url(),
    screenshot: z.string().min(1),
    title: z.string(),
  })).optional(),
});

export type ExplorationRun = z.infer<typeof ExplorationRunSchema>;

export const ExplorationSummarySchema = z.object({
  runId: z.string().min(1),
  entryUrl: z.string().min(1),
  state: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  confirmedFailures: z.number().int().min(0),
  automatedFindings: z.number().int().min(0),
  observations: z.number().int().min(0),
  notTested: z.number().int().min(0),
  pagesVisited: z.number().int().min(0),
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable().default(null),
});

export type ExplorationSummary = z.infer<typeof ExplorationSummarySchema>;

/** Project a finished run into its human-readable summary counts. */
export function summarizeExploration(run: ExplorationRun): ExplorationSummary {
  let confirmedFailures = 0;
  let automatedFindings = 0;
  let observations = 0;
  let notTested = 0;
  for (const finding of run.findings) {
    if (finding.category === "confirmed-failure") confirmedFailures += 1;
    else if (finding.category === "automated-finding") automatedFindings += 1;
    else if (finding.category === "observation") observations += 1;
    else notTested += 1;
  }
  return {
    runId: run.runId,
    entryUrl: run.target.entryUrl,
    state: run.state,
    confirmedFailures,
    automatedFindings,
    observations,
    notTested,
    pagesVisited: run.pagesVisited.length,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

/** Allow-listed exploration artifact names (screenshots + json only). */
const EXPLORATION_ARTIFACT_PATTERN = /^(screenshot-[0-9]+\.png|exploration\.json|surface-[0-9]+\.json)$/;

export function isAllowedExplorationArtifactName(name: string): boolean {
  if (name === "" || name.length > 128) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return EXPLORATION_ARTIFACT_PATTERN.test(name);
}
