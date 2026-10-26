import {
  RepairContextBundleSchema,
  type AccessibilityDiagnosis,
  type EvidenceBundle,
  type RepairContextBundle,
} from "@a11yforge/shared";
import type { SourceTraceResult } from "./trace.js";

/**
 * Phase 4 repair context bundle.
 *
 * The ONLY source material the repair model receives: the diagnosis facts,
 * the citable evidence ids, the recommended strategy, ranked file metadata,
 * and bounded excerpts. Entire repositories, unrelated files, screenshots,
 * full event histories, and secrets never enter the bundle.
 */
export function buildRepairContextBundle(
  diagnosis: AccessibilityDiagnosis,
  bundle: EvidenceBundle,
  trace: SourceTraceResult,
): RepairContextBundle {
  return RepairContextBundleSchema.parse({
    bundleId: `repair-ctx-${trace.traceId}`,
    diagnosisId: diagnosis.diagnosisId,
    evidenceIds: bundle.items.map((item) => item.id),
    observedFailure: diagnosis.observedFailure,
    repairStrategy: diagnosis.recommendedRepairStrategy,
    sourceFiles: trace.candidates.map((candidate) => ({
      filePath: candidate.filePath,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
      matchCount: candidate.matchCount,
    })),
    snippets: trace.selectedContext.map((snippet) => ({
      filePath: snippet.filePath,
      startLine: snippet.startLine,
      endLine: snippet.endLine,
      content: snippet.content,
      matchedTerms: snippet.matchedTerms,
    })),
  });
}
