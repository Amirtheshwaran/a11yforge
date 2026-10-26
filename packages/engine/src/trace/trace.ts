import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  AccessibilityDiagnosisSchema,
  KeyboardScenarioResultSchema,
  type AccessibilityDiagnosis,
  type KeyboardScenarioResult,
} from "@a11yforge/shared";
import { buildFocusContainmentBundle } from "../diagnosis/evidence-bundle.js";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import { extractSearchTerms } from "./search-terms.js";
import { searchSourceTree, type SourceCandidate } from "./locator.js";
import type { SourceSnippet } from "./locator.js";

/**
 * Phase 4 deterministic source trace.
 *
 * Links a successful diagnosis to the source files that render the failing
 * DOM — by literal search terms from evidence, never by model judgment.
 * The trace is useful on its own (persisted next to the run artifacts) and
 * gates the future repair-proposal request: an insufficient trace STOPS the
 * pipeline instead of spending a model call without source evidence.
 */

export const SourceSnippetSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string().min(1),
  matchedTerms: z.array(z.string().min(1)),
});

export const SourceCandidateSchema = z.object({
  filePath: z.string().min(1),
  score: z.number(),
  matchedTerms: z.array(z.string().min(1)),
  matchCount: z.number().int().nonnegative(),
  snippets: z.array(SourceSnippetSchema),
});

export const SourceTraceResultSchema = z.object({
  traceId: z.string().min(1),
  diagnosisId: z.string().min(1),
  /** Absolute source root that was searched (local trees only). */
  sourceRoot: z.string().min(1),
  searchTerms: z.array(z.string().min(1)),
  candidates: z.array(SourceCandidateSchema),
  /** Bounded excerpts supplied to the repair model. */
  selectedContext: z.array(SourceSnippetSchema),
});
export type SourceTraceResult = z.infer<typeof SourceTraceResultSchema>;

/** A trace this weak never authorizes a repair-model call. */
export const MIN_TRACE_MATCHED_TERMS = 2;
export const MIN_TRACE_MATCH_COUNT = 3;

/** Context supplied to the repair model is capped at this many files. */
export const MAX_TRACE_CONTEXT_FILES = 3;

/** Total snippet characters supplied to the repair model. */
export const MAX_TOTAL_CONTEXT_CHARS = 24_000;

/**
 * A trace authorizes a repair-model call only when the top candidate shows
 * corroborating evidence (several distinct terms, several occurrences) and
 * at least one bounded snippet was selected.
 */
export function isTraceSufficient(trace: SourceTraceResult): boolean {
  const top = trace.candidates[0];
  return (
    top !== undefined &&
    top.matchedTerms.length >= MIN_TRACE_MATCHED_TERMS &&
    top.matchCount >= MIN_TRACE_MATCH_COUNT &&
    trace.selectedContext.length > 0
  );
}

/** Deterministic selection: the latest run holding a diagnosis + scenario. */
export interface DiagnosedRunSelection {
  runId: string;
  runDir: string;
  diagnosis: AccessibilityDiagnosis;
  result: KeyboardScenarioResult;
}

export async function findLatestDiagnosedRun(
  runsDir: string,
): Promise<DiagnosedRunSelection> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error) {
    throw new Error(
      `trace:fixture: cannot list runs in ${runsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let lastError: string | null = null;
  for (const runId of entries.sort().reverse()) {
    const runDir = join(runsDir, runId);
    let diagnosisRaw: string;
    let resultRaw: string;
    try {
      [diagnosisRaw, resultRaw] = await Promise.all([
        readFile(join(runDir, "diagnosis.json"), "utf8"),
        readFile(join(runDir, "scenario.json"), "utf8"),
      ]);
    } catch {
      continue; // Scan-only run or pre-diagnosis run — skip.
    }
    const diagnosis = AccessibilityDiagnosisSchema.safeParse(
      safeJsonParse(diagnosisRaw),
    );
    if (!diagnosis.success) {
      lastError = `${join(runDir, "diagnosis.json")} is not a valid diagnosis artifact`;
      continue;
    }
    const result = KeyboardScenarioResultSchema.safeParse(
      safeJsonParse(resultRaw),
    );
    if (!result.success) {
      lastError = `${join(runDir, "scenario.json")} is not a valid scenario artifact`;
      continue;
    }
    return {
      runId,
      runDir,
      diagnosis: diagnosis.data,
      result: result.data,
    };
  }
  throw new Error(
    `trace:fixture: no completed run with diagnosis.json + scenario.json found under ${runsDir}` +
      (lastError !== null ? ` (last skipped artifact: ${lastError})` : "") +
      ". Run `pnpm scenario:fixture` and `pnpm diagnose:fixture` first.",
  );
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export interface BuildSourceTraceArgs {
  diagnosis: AccessibilityDiagnosis;
  result: KeyboardScenarioResult;
  /** Absolute local source root to search. */
  sourceRoot: string;
}

export async function buildSourceTrace(
  args: BuildSourceTraceArgs,
): Promise<SourceTraceResult> {
  const bundle = buildFocusContainmentBundle(args.result);
  const searchTerms = extractSearchTerms(args.diagnosis, bundle);
  const candidates = await searchSourceTree(args.sourceRoot, searchTerms);

  const selectedContext: SourceSnippet[] = [];
  let usedChars = 0;
  for (const candidate of candidates.slice(0, MAX_TRACE_CONTEXT_FILES)) {
    for (const snippet of candidate.snippets) {
      if (usedChars + snippet.content.length > MAX_TOTAL_CONTEXT_CHARS) {
        break;
      }
      selectedContext.push(snippet);
      usedChars += snippet.content.length;
    }
  }

  return SourceTraceResultSchema.parse({
    traceId: `trace-${args.result.runId}`,
    diagnosisId: args.diagnosis.diagnosisId,
    sourceRoot: args.sourceRoot,
    searchTerms,
    candidates,
    selectedContext,
  });
}

export interface TraceFixtureDeps {
  runsDir?: string;
  /** Absolute local source root (defaults to fixtures/broken-shop). */
  sourceRoot?: string;
}

export interface TraceFixtureResult {
  runId: string;
  trace: SourceTraceResult;
  tracePath: string;
  sufficient: boolean;
}

export function defaultFixtureSourceRoot(): string {
  return join(findWorkspaceRoot(), "fixtures", "broken-shop");
}

export async function runTraceFixture(
  deps: TraceFixtureDeps = {},
): Promise<TraceFixtureResult> {
  const runsDir =
    deps.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");
  const sourceRoot = deps.sourceRoot ?? defaultFixtureSourceRoot();
  const selection = await findLatestDiagnosedRun(runsDir);
  const trace = await buildSourceTrace({
    diagnosis: selection.diagnosis,
    result: selection.result,
    sourceRoot,
  });
  const tracePath = join(selection.runDir, "source-trace.json");
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return {
    runId: selection.runId,
    trace,
    tracePath,
    sufficient: isTraceSufficient(trace),
  };
}

/** Compact terminal report — ranks and line ranges, never file contents. */
export function formatTraceSummary(
  trace: SourceTraceResult,
  runId: string,
  tracePath: string,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Source Trace");
  lines.push("");
  lines.push("Diagnosis:");
  lines.push(trace.diagnosisId);
  lines.push("");
  lines.push("Search terms:");
  for (const term of trace.searchTerms) {
    lines.push(term);
  }
  lines.push("");
  lines.push("Candidates:");
  lines.push("");
  const top = trace.candidates.slice(0, 5);
  if (top.length === 0) {
    lines.push("(no source files matched the search terms)");
  }
  top.forEach((candidate: SourceCandidate, index: number) => {
    lines.push(`${index + 1}. ${candidate.filePath}`);
    lines.push(`   score: ${candidate.score}`);
    lines.push(`   matches: ${candidate.matchedTerms.join(", ")}`);
  });
  lines.push("");
  lines.push("Selected context:");
  if (trace.selectedContext.length === 0) {
    lines.push("(none)");
  }
  for (const snippet of trace.selectedContext) {
    lines.push(
      `${snippet.filePath} lines ${snippet.startLine}-${snippet.endLine}`,
    );
  }
  lines.push("");
  if (!isTraceSufficient(trace)) {
    lines.push(
      "STATUS: INSUFFICIENT — no repair-model call is authorized without stronger source evidence.",
    );
    lines.push("");
  }
  lines.push(`Run: ${runId}`);
  lines.push(`Artifact: ${tracePath}`);
  lines.push("");
  return lines.join("\n");
}
