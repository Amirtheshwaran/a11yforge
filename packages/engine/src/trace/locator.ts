import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

/**
 * Phase 4 deterministic source locator.
 *
 * Walks a local source tree, counts literal occurrences of the extracted
 * search terms, and ranks candidate files — no model involvement. An exact
 * occurrence of a strong selector/id (e.g. `checkout-modal`) ranks strongly,
 * and multiple distinct matching terms in one file raise confidence.
 *
 * Bounds (never ingest an unlimited repository):
 * - only plausible source/config extensions are read;
 * - ignored directories, lockfiles, and oversized files are skipped;
 * - the walk refuses trees beyond MAX_SOURCE_FILES_SCANNED entries.
 */

/** Plausible project source/config extensions for this fixture phase. */
export const TRACE_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
]);

/** Directories never descended into (deps, build output, artifacts). */
export const TRACE_IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  ".a11yforge",
  ".git",
  "test-results",
  "playwright-report",
  "blob-report",
  "out",
  "build",
  ".turbo",
  ".vite",
  "__pycache__",
]);

/** Filenames never read (lockfiles, generated manifests). */
export const TRACE_IGNORED_FILES: ReadonlySet<string> = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
]);

/** Refuse trees larger than this many readable entries. */
export const MAX_SOURCE_FILES_SCANNED = 500;

/** Skip files larger than this (bytes) — never ingest huge generated files. */
export const MAX_SOURCE_FILE_BYTES = 256_000;

/** Source lines kept on each side of a matching line. */
export const SNIPPET_CONTEXT_LINES = 15;

/** Snippets kept per file (highest match density first). */
export const MAX_SNIPPETS_PER_FILE = 3;

/** Hard cap on lines per snippet (excess trailing lines are dropped). */
export const MAX_SNIPPET_LINES = 100;

/** Hard cap on characters per snippet (trailing lines dropped to fit). */
export const MAX_SNIPPET_CHARS = 8000;

/** One bounded source excerpt around matching lines. */
export interface SourceSnippet {
  /** Source-root-relative path with `/` separators. */
  filePath: string;
  /** 1-based first line of the excerpt. */
  startLine: number;
  /** 1-based last line of the excerpt (inclusive). */
  endLine: number;
  /** Bounded excerpt content. */
  content: string;
  /** Search terms matched inside this excerpt. */
  matchedTerms: string[];
}

/** One ranked candidate source file. */
export interface SourceCandidate {
  /** Source-root-relative path with `/` separators. */
  filePath: string;
  /**
   * Deterministic rank score:
   * `distinctMatchedTerms * 100 + totalOccurrences * 5`.
   * Ties break by `matchCount` desc, then `filePath` asc.
   */
  score: number;
  /** Search terms occurring in this file (sorted). */
  matchedTerms: string[];
  /** Total term occurrences in this file. */
  matchCount: number;
  /** Bounded excerpts (at most MAX_SNIPPETS_PER_FILE). */
  snippets: SourceSnippet[];
}

function toRepoPath(sourceRoot: string, absolutePath: string): string {
  return relative(sourceRoot, absolutePath).split(sep).join("/");
}

function isIgnoredDir(name: string): boolean {
  return TRACE_IGNORED_DIRS.has(name) || name.startsWith(".playwright");
}

function isReadableSource(name: string): boolean {
  if (TRACE_IGNORED_FILES.has(name)) {
    return false;
  }
  return TRACE_SOURCE_EXTENSIONS.has(extname(name).toLowerCase());
}

/** Deterministically ordered walk of readable source files. */
export async function collectSourceFiles(
  sourceRoot: string,
): Promise<string[]> {
  const found: string[] = [];
  const queue: string[] = [sourceRoot];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDir(entry.name)) {
          queue.push(absolute);
        }
      } else if (entry.isFile() && isReadableSource(entry.name)) {
        found.push(absolute);
        if (found.length > MAX_SOURCE_FILES_SCANNED) {
          throw new Error(
            `source locator: source tree under ${sourceRoot} exceeds the file limit ` +
              `(${MAX_SOURCE_FILES_SCANNED} readable files); refusing an unbounded ingest`,
          );
        }
      }
    }
  }
  return found.sort();
}

/** Non-overlapping literal occurrences of `term` in `content`. */
export function countOccurrences(content: string, term: string): number {
  if (term === "") {
    return 0;
  }
  let count = 0;
  let from = 0;
  for (;;) {
    const at = content.indexOf(term, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + term.length;
  }
}

/** 1-based line numbers containing `term` (literal match). */
function matchingLines(lines: string[], term: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i] as string).includes(term)) {
      result.push(i + 1);
    }
  }
  return result;
}

interface Window {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent windows; input must be sorted by start. */
function mergeWindows(windows: Window[]): Window[] {
  const merged: Window[] = [];
  for (const window of windows) {
    const last = merged[merged.length - 1];
    if (last !== undefined && window.start <= last.end + 1) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ start: window.start, end: window.end });
    }
  }
  return merged;
}

function termsInRange(
  lines: string[],
  start: number,
  end: number,
  terms: string[],
): string[] {
  const matched: string[] = [];
  for (const term of terms) {
    for (let line = start; line <= end; line += 1) {
      if ((lines[line - 1] as string).includes(term)) {
        matched.push(term);
        break;
      }
    }
  }
  return matched;
}

/**
 * Extract bounded snippets for `matchedTerms` in one file's lines.
 * Windows merge, oversized windows truncate from the end (still containing
 * at least one match), and trailing lines drop until the char cap holds.
 */
export function extractSnippets(
  filePath: string,
  lines: string[],
  matchedTerms: string[],
): SourceSnippet[] {
  const lineCount = lines.length;
  const raw: Window[] = [];
  for (const term of matchedTerms) {
    for (const line of matchingLines(lines, term)) {
      raw.push({
        start: Math.max(1, line - SNIPPET_CONTEXT_LINES),
        end: Math.min(lineCount, line + SNIPPET_CONTEXT_LINES),
      });
    }
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = mergeWindows(raw);

  const scored = merged.map((window) => {
    let end = Math.min(window.end, window.start + MAX_SNIPPET_LINES - 1);
    let matched = termsInRange(lines, window.start, end, matchedTerms);
    // Truncation from the end cannot drop every match: the window was built
    // around matches, but a pathological spread could — drop such windows.
    if (matched.length === 0) {
      return null;
    }
    let content = lines.slice(window.start - 1, end).join("\n");
    while (content.length > MAX_SNIPPET_CHARS && end > window.start) {
      end -= 1;
      matched = termsInRange(lines, window.start, end, matchedTerms);
      content = lines.slice(window.start - 1, end).join("\n");
    }
    if (matched.length === 0) {
      return null;
    }
    const occurrences = matched.reduce(
      (sum, term) =>
        sum +
        countOccurrences(lines.slice(window.start - 1, end).join("\n"), term),
      0,
    );
    return {
      snippet: {
        filePath,
        startLine: window.start,
        endLine: end,
        content,
        matchedTerms: matched,
      } satisfies SourceSnippet,
      distinct: matched.length,
      occurrences,
    };
  });
  const viable = scored.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  viable.sort(
    (a, b) =>
      b.distinct - a.distinct ||
      b.occurrences - a.occurrences ||
      a.snippet.startLine - b.snippet.startLine,
  );
  return viable
    .slice(0, MAX_SNIPPETS_PER_FILE)
    .map((entry) => entry.snippet)
    .sort((a, b) => a.startLine - b.startLine);
}

/** Rank one file's content against the search terms (null when no match). */
export function rankFileContent(
  filePath: string,
  content: string,
  searchTerms: string[],
): SourceCandidate | null {
  if (content.includes("\0")) {
    return null; // Binary despite a source-like extension — skip.
  }
  const matchedTerms = searchTerms.filter(
    (term) => term !== "" && content.includes(term),
  );
  if (matchedTerms.length === 0) {
    return null;
  }
  matchedTerms.sort();
  const matchCount = matchedTerms.reduce(
    (sum, term) => sum + countOccurrences(content, term),
    0,
  );
  const lines = content.split("\n");
  return {
    filePath,
    score: matchedTerms.length * 100 + matchCount * 5,
    matchedTerms,
    matchCount,
    snippets: extractSnippets(filePath, lines, matchedTerms),
  };
}

/**
 * Search `sourceRoot` for `searchTerms` and rank every file with at least
 * one literal match. Returns candidates sorted by score desc, matchCount
 * desc, filePath asc. Makes ZERO model calls.
 */
export async function searchSourceTree(
  sourceRoot: string,
  searchTerms: string[],
): Promise<SourceCandidate[]> {
  const files = await collectSourceFiles(sourceRoot);
  const candidates: SourceCandidate[] = [];
  for (const absolute of files) {
    const info = await stat(absolute);
    if (info.size > MAX_SOURCE_FILE_BYTES) {
      continue;
    }
    const content = await readFile(absolute, "utf8");
    const candidate = rankFileContent(
      toRepoPath(sourceRoot, absolute),
      content,
      searchTerms,
    );
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.matchCount - a.matchCount ||
      (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0),
  );
  return candidates;
}
