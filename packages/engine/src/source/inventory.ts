import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { ManifestScript, SourceInventory } from "@a11yforge/shared";

/**
 * Phase 9 — deterministic source inventory.
 *
 * Facts only: file lists from a bounded walk, manifests actually present,
 * scripts declared by those manifests, lockfiles, candidate source
 * directories. No model is asked what exists; no framework layout is
 * assumed. Bounds on file count, file size, and total indexed text keep
 * huge repositories from being ingested without limits.
 */

export const INVENTORY_MAX_FILES = 20_000;
export const INVENTORY_MAX_FILE_BYTES = 512 * 1024;
export const INVENTORY_MAX_TEXT_BYTES = 8 * 1024 * 1024;

/** Directories never descended into (deps, output, caches, VCS). */
export const INVENTORY_IGNORED_DIRS: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
  "coverage",
  ".nyc_output",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  ".tox",
  "target",
  ".gradle",
  ".idea",
  ".vscode",
  ".cache",
  ".parcel-cache",
  "tmp",
  "log",
  "logs",
]);

/** Text/code extensions eligible for indexing (framework-agnostic). */
export const INVENTORY_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".swift",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".md",
  ".mdx",
  ".txt",
  ".sh",
  ".bash",
  ".sql",
  ".graphql",
  ".gql",
]);

/** Binary/asset extensions never indexed. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".bmp",
  ".avif",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
  ".lockb",
]);

/** Manifest/config basenames recognized structurally (not by framework). */
export const INVENTORY_MANIFEST_NAMES: ReadonlySet<string> = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "requirements-dev.txt",
  "Pipfile",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "makefile",
  "GNUmakefile",
  "CMakeLists.txt",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "index.html",
]);

/** Lockfile basenames (package-manager detection reads these, not prefs). */
export const INVENTORY_LOCKFILES: ReadonlySet<string> = new Set([
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "Pipfile.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
]);

/** Directory names that may hold primary source (only when present). */
const LIKELY_SOURCE_DIR_NAMES: ReadonlySet<string> = new Set([
  "src",
  "app",
  "lib",
  "components",
  "pages",
  "public",
  "static",
  "assets",
  "templates",
  "views",
  "client",
  "server",
  "pkg",
  "internal",
]);

export interface InventoryResult {
  inventory: SourceInventory;
  /** Absolute workspace root inventoried. */
  sourceRoot: string;
}

interface WalkEntry {
  relativePath: string;
  size: number;
  isText: boolean;
  isManifest: boolean;
  isLockfile: boolean;
}

function toRepoPath(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

/**
 * Build the deterministic inventory of an acquired source tree.
 * `sourceId` and `revision` label the result; everything else is observed.
 */
export async function buildSourceInventory(args: {
  sourceId: string;
  revision: string;
  sourceRoot: string;
}): Promise<InventoryResult> {
  const { sourceId, revision, sourceRoot } = args;
  const entries: WalkEntry[] = [];
  const foundDirs = new Set<string>();
  let filesTruncated = false;
  let textTruncated = false;
  let totalBytes = 0;
  let textBytes = 0;

  const queue: string[] = [sourceRoot];
  let seen = 0;
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      const absolute = join(dir, dirent.name);
      const rel = toRepoPath(sourceRoot, absolute);
      if (rel === "" || rel.startsWith("..")) continue;
      if (dirent.isSymbolicLink()) {
        // Never follow source symlinks during indexing: resolve and
        // require containment; record the link itself, not its target.
        let canonical: string | null = null;
        try {
          canonical = await realpath(absolute);
        } catch {
          continue; // Dangling link — skip, never chase.
        }
        let canonicalRoot = sourceRoot;
        try {
          canonicalRoot = await realpath(sourceRoot);
        } catch {
          // Fall back to the lexical root.
        }
        if (
          canonical !== canonicalRoot &&
          !canonical.startsWith(`${canonicalRoot}/`)
        ) {
          continue; // Escape — skip, never follow.
        }
        const target = await lstat(canonical).catch(() => null);
        if (target !== null && target.isDirectory()) {
          foundDirs.add(rel);
        } else if (target !== null && target.isFile()) {
          seen += 1;
          if (seen > INVENTORY_MAX_FILES) {
            filesTruncated = true;
            break;
          }
          totalBytes += target.size;
          entries.push({
            relativePath: rel,
            size: target.size,
            isText: false,
            isManifest: false,
            isLockfile: false,
          });
        }
        continue;
      }
      if (dirent.isDirectory()) {
        if (!INVENTORY_IGNORED_DIRS.has(dirent.name)) {
          foundDirs.add(rel);
          queue.push(absolute);
        }
        continue;
      }
      if (!dirent.isFile()) continue;
      seen += 1;
      if (seen > INVENTORY_MAX_FILES) {
        filesTruncated = true;
        break;
      }
      const st = await lstat(absolute).catch(() => null);
      const size = st?.size ?? 0;
      totalBytes += size;
      const lowerExt = extname(dirent.name).toLowerCase();
      const baseName = dirent.name;
      const isLockfile = INVENTORY_LOCKFILES.has(baseName);
      const isManifest =
        INVENTORY_MANIFEST_NAMES.has(baseName) && !isLockfile;
      const isText =
        !isLockfile &&
        !BINARY_EXTENSIONS.has(lowerExt) &&
        (INVENTORY_TEXT_EXTENSIONS.has(lowerExt) || isManifest);
      if (isText) {
        if (
          size > INVENTORY_MAX_FILE_BYTES ||
          textBytes + Math.min(size, INVENTORY_MAX_FILE_BYTES) >
            INVENTORY_MAX_TEXT_BYTES
        ) {
          textTruncated = true;
          continue;
        }
        textBytes += size;
      }
      entries.push({
        relativePath: rel,
        size,
        isText,
        isManifest,
        isLockfile,
      });
    }
    if (filesTruncated) break;
  }

  entries.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
  const textFiles = entries.filter((e) => e.isText).map((e) => e.relativePath);
  const manifestFiles = entries
    .filter((e) => e.isManifest)
    .map((e) => e.relativePath);
  const lockfiles = entries
    .filter((e) => e.isLockfile)
    .map((e) => e.relativePath);
  const scripts = await readManifestScripts(sourceRoot, manifestFiles);
  const likelySourceDirs = [...foundDirs]
    .filter((d) => {
      const base = d.split("/").pop() ?? "";
      return LIKELY_SOURCE_DIR_NAMES.has(base.toLowerCase());
    })
    .sort();

  // Directory count: distinct parent prefixes of all entries + found dirs.
  const dirSet = new Set<string>(foundDirs);
  for (const entry of entries) {
    const parts = entry.relativePath.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  }

  return {
    sourceRoot,
    inventory: {
      sourceId,
      revision,
      fileCount: seen,
      directoryCount: dirSet.size,
      totalBytes,
      textFiles,
      manifestFiles,
      lockfiles,
      scripts,
      likelySourceDirs,
      truncated: { files: filesTruncated, textBytes: textTruncated },
    },
  };
}

/** Scripts declared by manifests (currently package.json; extensible). */
async function readManifestScripts(
  sourceRoot: string,
  manifestFiles: string[],
): Promise<ManifestScript[]> {
  const scripts: ManifestScript[] = [];
  for (const manifest of manifestFiles) {
    if (manifest.split("/").pop() !== "package.json") continue;
    let raw: string;
    try {
      raw = await readFile(join(sourceRoot, manifest), "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.scripts !== "object" || record.scripts === null) continue;
    const entries = Object.entries(record.scripts as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [name, command] of entries) {
      if (typeof command !== "string" || command.length === 0) continue;
      scripts.push({
        name,
        command: command.slice(0, 500),
        source: `${manifest}#scripts.${name}`,
      });
      if (scripts.length >= 100) return scripts;
    }
  }
  return scripts;
}
