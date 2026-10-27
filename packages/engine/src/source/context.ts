import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenericSourceCandidate, SourceSnippet } from "@a11yforge/shared";

/**
 * Phase 9 — bounded source context extraction.
 *
 * The smallest context that explains the browser evidence: merged
 * line windows around matched lines from the highest-ranking
 * candidates. Never the whole repository. Caps on files, lines,
 * characters, and snippets; overlapping windows merged.
 */

export const MAX_CONTEXT_FILES = 3;
export const MAX_CONTEXT_TOTAL_CHARS = 24_000;
export const MAX_CONTEXT_TOTAL_LINES = 400;
export const SNIPPET_CONTEXT_LINES = 10;
export const MAX_SNIPPETS_PER_FILE = 3;

/**
 * Extract bounded snippets for the top candidates (mutates `snippets`
 * on the supplied candidates) and return the merged selected context.
 */
export async function extractSourceContext(args: {
  sourceRoot: string;
  candidates: GenericSourceCandidate[];
  maxFiles?: number;
}): Promise<SourceSnippet[]> {
  const { sourceRoot, candidates } = args;
  const maxFiles = args.maxFiles ?? MAX_CONTEXT_FILES;
  const selected: SourceSnippet[] = [];
  let usedChars = 0;
  let usedLines = 0;

  for (const candidate of candidates.slice(0, maxFiles)) {
    let content: string;
    try {
      content = await readFile(join(sourceRoot, candidate.filePath), "utf8");
    } catch {
      candidate.snippets = [];
      continue;
    }
    const lines = content.split("\n");
    const matchedLines = new Set<number>();
    for (const term of candidate.matchedTerms) {
      let from = 0;
      for (;;) {
        const at = content.indexOf(term, from);
        if (at === -1) break;
        matchedLines.add(lineNumberOf(content, at));
        from = at + term.length;
        if (matchedLines.size > 200) break;
      }
      if (matchedLines.size > 200) break;
    }
    const windows = mergeWindows(
      [...matchedLines].sort((a, b) => a - b),
      SNIPPET_CONTEXT_LINES,
      lines.length,
    ).slice(0, MAX_SNIPPETS_PER_FILE);

    candidate.snippets = [];
    for (const [start, end] of windows) {
      const slice = lines.slice(start - 1, end);
      const text = slice.join("\n");
      const matchedInWindow = candidate.matchedTerms.filter((t) =>
        text.includes(t),
      );
      const snippet: SourceSnippet = {
        filePath: candidate.filePath,
        startLine: start,
        endLine: end,
        content: text.slice(0, 8000),
        matchedTerms: matchedInWindow.sort(),
      };
      if (
        usedChars + snippet.content.length > MAX_CONTEXT_TOTAL_CHARS ||
        usedLines + (end - start + 1) > MAX_CONTEXT_TOTAL_LINES
      ) {
        break;
      }
      candidate.snippets.push(snippet);
      selected.push(snippet);
      usedChars += snippet.content.length;
      usedLines += end - start + 1;
    }
  }
  return selected;
}

function lineNumberOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

/** Merge 1-based match lines into context windows. */
export function mergeWindows(
  matchedLines: number[],
  context: number,
  totalLines: number,
): Array<[number, number]> {
  const windows: Array<[number, number]> = [];
  for (const line of matchedLines) {
    const start = Math.max(1, line - context);
    const end = Math.min(totalLines, line + context);
    const last = windows[windows.length - 1];
    if (last !== undefined && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      windows.push([start, end]);
    }
  }
  return windows;
}
