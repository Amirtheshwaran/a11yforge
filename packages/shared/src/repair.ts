import { z } from "zod";

/**
 * Phase 4 repair-proposal schemas.
 *
 * The model PROPOSES a change; it never applies one. Every edit is anchored
 * by exact source text (`originalText` copied from the supplied source
 * context) so Phase 5 can verify deterministically — file exists,
 * anchor exists, anchor is unique, replacement is bounded — before touching
 * anything. Model-generated line numbers are context only, never anchors.
 */

/** Conservative bounds for a single repair proposal. */
export const MAX_REPAIR_FILES = 2;
export const MAX_REPAIR_EDITS = 4;

/** One structured source edit anchored by exact source text. */
export const RepairEditSchema = z.object({
  /** Repo-relative path of the file to change (must be in context). */
  filePath: z.string().min(1).max(500),
  /** Exact text copied from the supplied source; the match anchor. */
  originalText: z.string().min(1).max(4000),
  /** Complete replacement text for deterministic substitution. */
  replacementText: z.string().min(1).max(8000),
  /** Why this edit addresses the demonstrated failure. */
  reason: z.string().min(1).max(1000),
});
export type RepairEdit = z.infer<typeof RepairEditSchema>;

/**
 * Structured repair proposal returned by the Meta model.
 *
 * Grounding contract:
 * - `evidenceIds` must all exist in the supplied repair context bundle.
 * - `targetFiles` / every edit `filePath` must be files from the supplied
 *   source context — the model may not invent files.
 * - `originalText` must be copied exactly from the supplied source.
 * - The proposal is NOT applied or tested; verification belongs to Phase 5.
 */
export const RepairProposalSchema = z.object({
  /** Stable proposal id (e.g. `prop-<run-id-suffix>`). */
  proposalId: z.string().min(1),
  /** Diagnosis this proposal addresses. */
  diagnosisId: z.string().min(1),
  /** One-paragraph summary of the proposed change. */
  summary: z.string().min(1).max(2000),
  /** Why this change addresses the observed failure (not a success claim). */
  rationale: z.string().min(1).max(2000),
  /** Evidence IDs cited — every one must exist in the context bundle. */
  evidenceIds: z.array(z.string().min(1)).min(1),
  /** Repo-relative paths of files touched (bounded by MAX_REPAIR_FILES). */
  targetFiles: z.array(z.string().min(1)).min(1).max(MAX_REPAIR_FILES),
  /** Structured edits (bounded by MAX_REPAIR_EDITS). */
  edits: z.array(RepairEditSchema).min(1).max(MAX_REPAIR_EDITS),
  /** Known risks / behaviors deliberately left unchanged. */
  risks: z.array(z.string().min(1)),
  /** Steps to verify the repair once applied (build, replay, rescan). */
  verificationPlan: z.array(z.string().min(1)).min(1),
});
export type RepairProposal = z.infer<typeof RepairProposalSchema>;

/** Metadata for one ranked source file supplied as repair context. */
export const RepairSourceFileSchema = z.object({
  /** Repo-relative path within the traced source root. */
  filePath: z.string().min(1),
  /** Deterministic rank score (higher is more relevant). */
  score: z.number(),
  /** Search terms matched in this file. */
  matchedTerms: z.array(z.string().min(1)),
  /** Total term occurrences in this file. */
  matchCount: z.number().int().nonnegative(),
});
export type RepairSourceFile = z.infer<typeof RepairSourceFileSchema>;

/** One bounded source excerpt supplied as repair context. */
export const RepairSourceSnippetSchema = z.object({
  /** Repo-relative path within the traced source root. */
  filePath: z.string().min(1),
  /** 1-based first line of the excerpt. */
  startLine: z.number().int().positive(),
  /** 1-based last line of the excerpt (inclusive). */
  endLine: z.number().int().positive(),
  /** Bounded excerpt content. */
  content: z.string().min(1),
  /** Search terms matched inside this excerpt. */
  matchedTerms: z.array(z.string().min(1)),
});
export type RepairSourceSnippet = z.infer<typeof RepairSourceSnippetSchema>;

/**
 * Compact repair context bundle: the ONLY source material the repair model
 * receives. Intentionally small — no full repository, no unrelated files,
 * no node_modules, no screenshots, no full event history, no secrets.
 */
export const RepairContextBundleSchema = z.object({
  /** Bundle id, derived from the source trace id. */
  bundleId: z.string().min(1),
  /** Diagnosis being repaired. */
  diagnosisId: z.string().min(1),
  /** Evidence ids the proposal may cite. */
  evidenceIds: z.array(z.string().min(1)).min(1),
  /** Observed failure restated from evidence (fact, not inference). */
  observedFailure: z.string().min(1).max(2000),
  /** Repair strategy from the diagnosis (strategy, not a patch). */
  repairStrategy: z.string().min(1).max(2000),
  /** Ranked source-file metadata (no file contents). */
  sourceFiles: z.array(RepairSourceFileSchema).min(1),
  /** Bounded excerpts the model may anchor edits against. */
  snippets: z.array(RepairSourceSnippetSchema).min(1),
});
export type RepairContextBundle = z.infer<typeof RepairContextBundleSchema>;

/** IDs citable by a repair proposal for one context bundle. */
export function repairEvidenceIdsOf(bundle: RepairContextBundle): Set<string> {
  return new Set(bundle.evidenceIds);
}

/** Repo-relative file paths supplied in one context bundle. */
export function repairSourceFilesOf(bundle: RepairContextBundle): Set<string> {
  return new Set(bundle.sourceFiles.map((file) => file.filePath));
}
