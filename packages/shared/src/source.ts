import { z } from "zod";

/**
 * Phase 9 — generic source-connection schemas.
 *
 * A11yForge connects browser evidence (Phase 8 exploration) to source code
 * (an arbitrary public Git repository or a local developer tree) without
 * any framework, application, route, or fixture knowledge. Every fact here
 * is deterministically observed: commit SHAs from git, file lists from a
 * bounded walk, commands from repository manifests or explicit user input.
 * The model never invents files, paths, commands, or selectors.
 */

// ---------------------------------------------------------------------------
// SourceTarget
// ---------------------------------------------------------------------------

export const SourceKindSchema = z.enum(["git", "local"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceTargetSchema = z.object({
  sourceId: z.string().min(1),
  kind: SourceKindSchema,
  /** Exactly what the user supplied: the Git URL or the local path label. */
  originalReference: z.string().min(1),
  /** Absolute path of the isolated workspace copy. Never the original repo. */
  workspacePath: z.string().min(1),
  /** Resolved commit SHA for Git sources; content hash for local sources. */
  revision: z.string().min(1),
  connectedAt: z.string().min(1),
});
export type SourceTarget = z.infer<typeof SourceTargetSchema>;

// ---------------------------------------------------------------------------
// SourceInventory (deterministic repository facts, never model output)
// ---------------------------------------------------------------------------

export const ManifestScriptSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  /** Manifest-relative source, e.g. `package.json#scripts.build`. */
  source: z.string().min(1),
});
export type ManifestScript = z.infer<typeof ManifestScriptSchema>;

export const SourceInventorySchema = z.object({
  sourceId: z.string().min(1),
  revision: z.string().min(1),
  fileCount: z.number().int().min(0),
  directoryCount: z.number().int().min(0),
  totalBytes: z.number().int().min(0),
  /** Indexed text/code files (bounded, repo-relative, `/`-separated). */
  textFiles: z.array(z.string().min(1)),
  /** Manifest/config files actually present (package.json, Makefile, …). */
  manifestFiles: z.array(z.string().min(1)),
  /** Lockfiles actually present (pnpm-lock.yaml, package-lock.json, …). */
  lockfiles: z.array(z.string().min(1)),
  /** Scripts declared by manifests, each citing its source. */
  scripts: z.array(ManifestScriptSchema),
  /** Candidate source directories actually present (src/, app/, lib/, …). */
  likelySourceDirs: z.array(z.string().min(1)),
  /** True when bounds truncated the walk (never silently partial). */
  truncated: z.object({
    files: z.boolean(),
    textBytes: z.boolean(),
  }),
});
export type SourceInventory = z.infer<typeof SourceInventorySchema>;

// ---------------------------------------------------------------------------
// ExecutionProfile (commands only from observed facts or the user)
// ---------------------------------------------------------------------------

export const CommandFactSchema = z.object({
  command: z.string().min(1),
  /** Where the command came from: manifest source or `user-supplied`. */
  source: z.string().min(1),
});
export type CommandFact = z.infer<typeof CommandFactSchema>;

export const PackageManagerSchema = z.enum([
  "pnpm",
  "yarn",
  "npm",
  "bun",
  "unknown",
]);
export type PackageManager = z.infer<typeof PackageManagerSchema>;

export const ExecutionProfileSchema = z.object({
  sourceId: z.string().min(1),
  /** Which adapter produced this profile, or `user-supplied`, or `unknown`. */
  adapter: z.string().min(1),
  installCommand: CommandFactSchema.nullable(),
  buildCommand: CommandFactSchema.nullable(),
  startCommand: CommandFactSchema.nullable(),
  testCommands: z.array(CommandFactSchema),
  packageManager: PackageManagerSchema,
  workingDirectory: z.string().min(1),
  /**
   * `high` — every needed command observed in the repo;
   * `partial` — some observed, launch not confidently determined;
   * `unknown` — no adapter applies, user commands required.
   */
  confidence: z.enum(["high", "partial", "unknown"]),
  /** Human explanation of what was observed (or not observed). */
  explanation: z.string().min(1),
});
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;

/** Optional advanced user-supplied commands (CLI flags or web form). */
export const UserCommandConfigSchema = z.object({
  installCommand: z.string().min(1).optional(),
  buildCommand: z.string().min(1).optional(),
  startCommand: z.string().min(1).optional(),
  testCommand: z.string().min(1).optional(),
});
export type UserCommandConfig = z.infer<typeof UserCommandConfigSchema>;

// ---------------------------------------------------------------------------
// Generic source trace (browser evidence → source, no LLM ranking)
// ---------------------------------------------------------------------------

export const SourceTraceStatusSchema = z.enum([
  "FOUND",
  "AMBIGUOUS",
  "NOT_FOUND",
]);
export type SourceTraceStatus = z.infer<typeof SourceTraceStatusSchema>;

export const SourceSnippetSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string().min(1),
  matchedTerms: z.array(z.string().min(1)),
});
export type SourceSnippet = z.infer<typeof SourceSnippetSchema>;

export const GenericSourceCandidateSchema = z.object({
  filePath: z.string().min(1),
  score: z.number(),
  matchedTerms: z.array(z.string().min(1)),
  matchCount: z.number().int().nonnegative(),
  /** Human-readable reasons, e.g. `element id "main-nav"`. */
  matchReasons: z.array(z.string().min(1)),
  snippets: z.array(SourceSnippetSchema),
});
export type GenericSourceCandidate = z.infer<
  typeof GenericSourceCandidateSchema
>;

export const GenericSourceTraceSchema = z.object({
  traceId: z.string().min(1),
  sourceId: z.string().min(1),
  findingId: z.string().min(1),
  status: SourceTraceStatusSchema,
  /** Deterministic search terms derived only from browser evidence. */
  searchTerms: z.array(z.string().min(1)),
  candidates: z.array(GenericSourceCandidateSchema),
  selectedContext: z.array(SourceSnippetSchema),
  /** Plain-language explanation of the status (for the UI). */
  reason: z.string().min(1),
});
export type GenericSourceTrace = z.infer<typeof GenericSourceTraceSchema>;

// ---------------------------------------------------------------------------
// ReproductionPlan (replay the SAME failure against the repaired app)
// ---------------------------------------------------------------------------

export const ReproActionTypeSchema = z.enum([
  "navigate",
  "focus",
  "tab",
  "shift-tab",
  "press-key",
  "safe-click",
  "inspect",
]);
export type ReproActionType = z.infer<typeof ReproActionTypeSchema>;

export const ReproElementRefSchema = z.object({
  elementId: z.string().default(""),
  dataAttribute: z.string().default(""),
  role: z.string().default(""),
  accessibleName: z.string().default(""),
  fingerprint: z.string().default(""),
  domPath: z.string().default(""),
  replaySelector: z.string().default(""),
});
export type ReproElementRef = z.infer<typeof ReproElementRefSchema>;

export const ReproActionSchema = z.object({
  seq: z.number().int().min(0),
  action: ReproActionTypeSchema,
  /** Key for press-key (e.g. `Tab`, `Escape`), empty otherwise. */
  key: z.string().default(""),
  target: ReproElementRefSchema.nullable().default(null),
  detail: z.string().default(""),
});
export type ReproAction = z.infer<typeof ReproActionSchema>;

export const ReproductionPlanSchema = z.object({
  planId: z.string().min(1),
  findingId: z.string().min(1),
  /** Original absolute page URL where the failure was observed. */
  pageUrl: z.string().min(1),
  /** Relative application location (`/path?query`) replayed on verify. */
  pagePath: z.string().min(1),
  initialConditions: z.array(z.string().min(1)),
  actions: z.array(ReproActionSchema),
  /** Deterministic assertions evaluated after replay. */
  assertions: z.array(z.string().min(1)),
  /** Axe rule ids to re-check on the affected page, when applicable. */
  axeRules: z.array(z.string().min(1)),
});
export type ReproductionPlan = z.infer<typeof ReproductionPlanSchema>;

// ---------------------------------------------------------------------------
// Generic repair outcome (VERIFIED only on replayed target success)
// ---------------------------------------------------------------------------

export const GenericRepairOutcomeSchema = z.enum([
  "PROPOSED",
  "APPLIED",
  "BUILD_PASSED",
  "TARGET_VERIFIED",
  "VERIFIED",
  "REJECTED",
  "UNVERIFIABLE",
]);
export type GenericRepairOutcome = z.infer<typeof GenericRepairOutcomeSchema>;

export const GenericVerificationSchema = z.object({
  verificationId: z.string().min(1),
  sourceId: z.string().min(1),
  findingId: z.string().min(1),
  outcome: GenericRepairOutcomeSchema,
  gates: z.array(
    z.object({
      name: z.string().min(1),
      status: z.enum(["passed", "failed", "unavailable"]),
      detail: z.string().min(1),
    }),
  ),
  /** Base commit SHA the patch applies to. */
  baseRevision: z.string().min(1),
  /** Verification origin (isolated repaired app), empty when unlaunched. */
  verificationOrigin: z.string().default(""),
  axeBefore: z.array(z.string().min(1)),
  axeAfter: z.array(z.string().min(1)),
  newSeriousOrCritical: z.array(z.string().min(1)),
});
export type GenericVerification = z.infer<typeof GenericVerificationSchema>;
