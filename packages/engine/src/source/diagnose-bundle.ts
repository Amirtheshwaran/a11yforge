import { z } from "zod";
import type {
  ExplorationFinding,
  GenericSourceTrace,
  ProbeResult,
  SourceSnippet,
} from "@a11yforge/shared";

/**
 * Phase 9 — generic source-connected diagnosis bundle.
 *
 * Reuses the evidence-grounded diagnosis architecture with fixture
 * assumptions removed from the generic path. The model receives ONLY
 * the selected finding, deterministic browser evidence, the action
 * trace, standards metadata, and the bounded source trace — never the
 * whole page, the whole repository, or unrelated findings. The model
 * must distinguish the observed failure from the likely implementation
 * cause, citing only supplied evidence ids.
 */

export const SOURCE_EVIDENCE_ID_PATTERN = /^ev-[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const SourceDiagnosisBundleSchema = z.object({
  findingId: z.string().min(1),
  /** Human title of the selected finding. */
  title: z.string().min(1),
  /** What the browser showed, in plain language. */
  observedFailure: z.string().min(1),
  /** Why it matters (standards-grounded, from the finding). */
  whyItMatters: z.string().min(1),
  /** Deterministic reproduction steps (plain language). */
  howReproduced: z.array(z.string().min(1)),
  /** Citable evidence items (id + summary only — bounded). */
  evidence: z.array(
    z.object({
      evidenceId: z.string().regex(SOURCE_EVIDENCE_ID_PATTERN),
      summary: z.string().min(1).max(500),
    }),
  ),
  /** Recorded browser action trace (bounded, plain language). */
  actionTrace: z.array(z.string().min(1).max(300)),
  /** Standards references attached to the finding/probe. */
  standardReferences: z.array(z.string().min(1)),
  /** Bounded source context from deterministic tracing (may be empty). */
  sourceContext: z.array(
    z.object({
      filePath: z.string().min(1),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      content: z.string().min(1).max(8000),
    }),
  ),
});
export type SourceDiagnosisBundle = z.infer<typeof SourceDiagnosisBundleSchema>;

export const MAX_DIAGNOSIS_EVIDENCE = 12;
export const MAX_DIAGNOSIS_ACTIONS = 20;
export const MAX_DIAGNOSIS_CONTEXT_FILES = 3;

function evidenceIdFor(index: number): string {
  return `ev-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Build the bounded diagnosis bundle. Pure function of the finding,
 * its probe result, and the deterministic source trace.
 */
export function buildSourceDiagnosisBundle(args: {
  finding: ExplorationFinding;
  probe: ProbeResult;
  trace: GenericSourceTrace | null;
}): SourceDiagnosisBundle {
  const { finding, probe, trace } = args;
  const evidence = probe.evidence.slice(0, MAX_DIAGNOSIS_EVIDENCE).map(
    (item, index) => ({
      evidenceId: evidenceIdFor(index),
      summary: item.summary.slice(0, 500),
    }),
  );
  const actionTrace = probe.actionTrace
    .slice(0, MAX_DIAGNOSIS_ACTIONS)
    .map((step) => `${step.action}: ${step.detail}`.slice(0, 300));
  const standardReferences = [
    ...new Set([...finding.standardReferences, ...probe.standardReferences]),
  ].slice(0, 8);
  const sourceContext: SourceDiagnosisBundle["sourceContext"] =
    (trace?.selectedContext.slice(0, MAX_DIAGNOSIS_CONTEXT_FILES * 2) ?? []).map(
      (snippet: SourceSnippet) => ({
        filePath: snippet.filePath,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
        content: snippet.content.slice(0, 8000),
      }),
    );
  return SourceDiagnosisBundleSchema.parse({
    findingId: finding.findingId,
    title: finding.title,
    observedFailure: finding.whatHappened,
    whyItMatters: finding.whyItMatters,
    howReproduced: finding.howReproduced.slice(0, 10),
    evidence,
    actionTrace,
    standardReferences,
    sourceContext,
  });
}

/**
 * Validate that a model diagnosis cites only supplied evidence ids and
 * keeps observed failure separate from implementation cause. Returns the
 * rejection reason, or null when grounded.
 */
export function validateSourceDiagnosisGrounding(args: {
  bundle: SourceDiagnosisBundle;
  evidenceIds: string[];
  observedFailure: string;
  likelyCause: string;
}): string | null {
  const known = new Set([
    ...args.bundle.evidence.map((e) => e.evidenceId),
  ]);
  for (const id of args.evidenceIds) {
    if (!SOURCE_EVIDENCE_ID_PATTERN.test(id) || !known.has(id)) {
      return `Unknown evidence reference: ${id}`;
    }
  }
  if (args.evidenceIds.length === 0) {
    return "At least one evidence reference is required.";
  }
  if (args.observedFailure.trim().length < 10) {
    return "The observed failure must describe what the browser showed.";
  }
  if (args.likelyCause.trim().length < 10) {
    return "The likely cause must be stated separately from the observed failure.";
  }
  // The cause must not masquerade as a measured fact: it may only use
  // hedging-free language when it names supplied source lines.
  const namesFileLine = /line\s+\d+|\.tsx|\.ts|\.jsx|\.js|\.py|\.vue/i.test(
    args.likelyCause,
  );
  const namesSuppliedFile =
    args.bundle.sourceContext.length > 0 &&
    args.bundle.sourceContext.some((s) => args.likelyCause.includes(s.filePath));
  if (namesFileLine && !namesSuppliedFile) {
    return "The likely cause names source that was not supplied — only supplied source context may be cited.";
  }
  return null;
}
