import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GenericSourceCandidate,
  SourceSnippet,
  SourceTraceStatus,
} from "@a11yforge/shared";
import {
  INVENTORY_MAX_FILE_BYTES,
  INVENTORY_TEXT_EXTENSIONS,
} from "./inventory.js";
import { capWeakWeight, weightTerm } from "./term-weight.js";
import type { WeightedTerm } from "./evidence-terms.js";

/**
 * Phase 9 — generic source search and candidate ranking.
 *
 * Framework-independent literal search over the inventoried text files,
 * ranked deterministically (term strength × rarity, match proximity,
 * multi-fingerprint corroboration). No LLM ranking, no expected
 * filenames. Each candidate explains WHY it ranked highly through
 * human-readable match reasons. Status is FOUND / AMBIGUOUS / NOT_FOUND;
 * automatic repair is allowed only past the sufficiency gate.
 */

/**
 * Evidence-kind suffixes identifying enough to carry a FOUND verdict
 * on their own (stable identifiers, not prose tokens). Prose-only
 * matches can reach AMBIGUOUS at best — never FOUND.
 */
export const STRONG_TERM_KINDS: ReadonlySet<string> = new Set([
  "id",
  "data-attr",
  "data-value",
  "name-exact",
  "aria-label-exact",
  "aria-controls",
  "aria-describedby",
  "class-exact",
]);

/** Top score must clear this to be FOUND. */
export const TRACE_FOUND_MIN_SCORE = 6;
/** Runner-up must trail by this margin, else AMBIGUOUS. */
export const TRACE_FOUND_MIN_MARGIN = 2;
/** Auto-repair needs this many distinct strong terms on the top file. */
export const TRACE_SUFFICIENT_DISTINCT_TERMS = 2;

/** Lines within which distinct terms count as "same region". */
export const PROXIMITY_WINDOW_LINES = 12;

export interface RankedTrace {
  status: SourceTraceStatus;
  candidates: GenericSourceCandidate[];
  reason: string;
}

interface FileHit {
  filePath: string;
  /** term -> 1-based line numbers of occurrences. */
  linesByTerm: Map<string, number[]>;
  content: string;
  lines: string[];
}

function countLiteralOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
    if (count > 10_000) return count;
  }
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

function termLines(content: string, term: string): number[] {
  const lines: number[] = [];
  let from = 0;
  for (;;) {
    const at = content.indexOf(term, from);
    if (at === -1) return lines;
    lines.push(lineOf(content, at));
    from = at + term.length;
    if (lines.length > 500) return lines;
  }
}

/** Proximity bonus: distinct terms co-occurring within a small window. */
function proximityBonus(linesByTerm: Map<string, number[]>): number {
  const terms = [...linesByTerm.keys()];
  if (terms.length < 2) return 0;
  const marks: Array<{ line: number; term: string }> = [];
  for (const [term, lines] of linesByTerm) {
    for (const line of lines.slice(0, 50)) marks.push({ line, term });
  }
  marks.sort((a, b) => a.line - b.line);
  let bonus = 0;
  for (let i = 0; i < marks.length; i += 1) {
    const windowTerms = new Set<string>([marks[i]?.term ?? ""]);
    for (let j = i + 1; j < marks.length; j += 1) {
      if ((marks[j]?.line ?? 0) - (marks[i]?.line ?? 0) > PROXIMITY_WINDOW_LINES) {
        break;
      }
      windowTerms.add(marks[j]?.term ?? "");
    }
    if (windowTerms.size >= 2) {
      bonus = Math.max(bonus, (windowTerms.size - 1) * 2);
    }
  }
  return bonus;
}

function reasonFor(term: string, kinds: string[]): string {
  const seen = new Set<string>();
  for (const kind of kinds) {
    const suffix = kind.split(":").pop() ?? kind;
    if (suffix === "id") seen.add(`element id "${term}"`);
    else if (suffix === "data-attr") seen.add(`data attribute "${term}"`);
    else if (suffix === "data-value") seen.add(`data value "${term}"`);
    else if (suffix === "name" || suffix === "name-exact") {
      seen.add(`accessible name "${term}"`);
    } else if (suffix === "aria-label" || suffix === "aria-label-exact") {
      seen.add(`aria label "${term}"`);
    } else if (suffix === "aria-controls") {
      seen.add(`aria relationship "aria-controls=${term}"`);
    } else if (suffix === "aria-describedby") {
      seen.add(`aria relationship "aria-describedby=${term}"`);
    } else if (suffix === "class" || suffix === "class-exact") {
      seen.add(`class token "${term}"`);
    } else if (suffix === "html") seen.add(`markup containing "${term}"`);
    else if (suffix === "text") seen.add(`visible text "${term}"`);
    else seen.add(`browser evidence "${term}"`);
  }
  return [...seen].join("; ");
}

/**
 * Search inventoried text files for the evidence terms and rank the
 * candidates. Deterministic: same inputs, same order, same scores.
 */
export async function searchAndRank(args: {
  sourceRoot: string;
  textFiles: string[];
  terms: WeightedTerm[];
}): Promise<RankedTrace> {
  const { sourceRoot, textFiles, terms } = args;
  const kindsByTerm = new Map<string, string[]>(
    terms.map((t) => [t.term, t.kinds]),
  );
  const filesWithTerm = new Map<string, number>();
  const hits: FileHit[] = [];

  for (const filePath of textFiles) {
    const lower = filePath.toLowerCase();
    const dot = lower.lastIndexOf(".");
    const ext = dot === -1 ? "" : lower.slice(dot);
    if (!INVENTORY_TEXT_EXTENSIONS.has(ext)) continue;
    let st;
    try {
      st = await lstat(join(sourceRoot, filePath));
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > INVENTORY_MAX_FILE_BYTES) continue;
    let content: string;
    try {
      content = await readFile(join(sourceRoot, filePath), "utf8");
    } catch {
      continue;
    }
    // Skip binary-looking content that slipped past the extension filter.
    if (content.includes("\0")) continue;
    const linesByTerm = new Map<string, number[]>();
    for (const { term } of terms) {
      if (!content.includes(term)) continue;
      linesByTerm.set(term, termLines(content, term));
      filesWithTerm.set(term, (filesWithTerm.get(term) ?? 0) + 1);
    }
    if (linesByTerm.size > 0) {
      hits.push({ filePath, linesByTerm, content, lines: content.split("\n") });
    }
  }

  const totalFiles = Math.max(textFiles.length, 1);
  const candidates: GenericSourceCandidate[] = hits.map((hit) => {
    let score = 0;
    const reasons: string[] = [];
    const matchedTerms = [...hit.linesByTerm.keys()].sort();
    for (const term of matchedTerms) {
      const occurrences = countLiteralOccurrences(hit.content, term);
      const kinds = kindsByTerm.get(term) ?? ["evidence:text"];
      const raw = weightTerm(kinds, filesWithTerm.get(term) ?? 1, totalFiles);
      score += capWeakWeight(term, raw) * (1 + Math.log1p(occurrences));
      reasons.push(reasonFor(term, kinds));
    }
    score += proximityBonus(hit.linesByTerm);
    // Multi-fingerprint corroboration: distinct evidence kinds in one file.
    const kindFamilies = new Set<string>();
    for (const term of matchedTerms) {
      for (const kind of kindsByTerm.get(term) ?? []) {
        kindFamilies.add(kind.split(":")[0] ?? kind);
      }
    }
    if (kindFamilies.size >= 2) score += (kindFamilies.size - 1) * 1.5;
    return {
      filePath: hit.filePath,
      score: Math.round(score * 100) / 100,
      matchedTerms,
      matchCount: matchedTerms.reduce(
        (n, t) => n + countLiteralOccurrences(hit.content, t),
        0,
      ),
      matchReasons: reasons.sort().slice(0, 10),
      snippets: [] as SourceSnippet[],
    };
  });

  candidates.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.filePath < b.filePath
        ? -1
        : 1,
  );

  const top = candidates.slice(0, 8);
  if (top.length === 0) {
    return {
      status: "NOT_FOUND",
      candidates: [],
      reason:
        "None of the identifiers observed in the browser appear in the connected source.",
    };
  }
  const first = top[0] as GenericSourceCandidate;
  const second = top[1] as GenericSourceCandidate | undefined;
  const margin = second === undefined ? Number.POSITIVE_INFINITY : first.score - second.score;
  const firstHasStrongTerm = first.matchedTerms.some((term) =>
    (kindsByTerm.get(term) ?? []).some((kind) =>
      STRONG_TERM_KINDS.has(kind.split(":").pop() ?? ""),
    ),
  );
  if (
    first.score >= TRACE_FOUND_MIN_SCORE &&
    first.matchedTerms.length >= TRACE_SUFFICIENT_DISTINCT_TERMS &&
    margin >= TRACE_FOUND_MIN_MARGIN &&
    firstHasStrongTerm
  ) {
    return {
      status: "FOUND",
      candidates: top,
      reason: `Top candidate ${first.filePath} matched ${String(first.matchedTerms.length)} distinct evidence terms with a clear margin.`,
    };
  }
  if (first.score >= TRACE_FOUND_MIN_SCORE && margin < TRACE_FOUND_MIN_MARGIN) {
    return {
      status: "AMBIGUOUS",
      candidates: top,
      reason: `Several files matched the browser evidence closely (${first.filePath} vs ${second?.filePath ?? "none"}); automatic repair is withheld until the source is disambiguated.`,
    };
  }
  return {
    status: first.matchedTerms.length > 0 ? "AMBIGUOUS" : "NOT_FOUND",
    candidates: top,
    reason:
      first.matchedTerms.length > 0
        ? `Only weak matches were found (best: ${first.filePath}); automatic repair is withheld.`
        : "None of the identifiers observed in the browser appear in the connected source.",
  };
}

/** Automatic repair is allowed only on a sufficient FOUND trace. */
export function isTraceSufficientForRepair(trace: {
  status: SourceTraceStatus;
  candidates: GenericSourceCandidate[];
  selectedContext: SourceSnippet[];
}): boolean {
  const top = trace.candidates[0];
  return (
    trace.status === "FOUND" &&
    top !== undefined &&
    top.matchedTerms.length >= TRACE_SUFFICIENT_DISTINCT_TERMS &&
    trace.selectedContext.length > 0
  );
}
