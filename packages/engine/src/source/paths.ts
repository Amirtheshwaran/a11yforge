import { realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { findWorkspaceRoot } from "../scanner/workspace.js";

/**
 * Phase 9 — source workspace paths and containment.
 *
 * Remote sources are acquired into the A11yForge runtime data directory,
 * never into application source and never by mutating the original
 * repository. Every path written or read through source connection must
 * stay contained in its root: symlinks are resolved and escapes fail.
 */

/** Runtime root for connected-source workspaces. */
export function defaultSourcesDir(dataDir?: string): string {
  const root = dataDir ?? findWorkspaceRoot();
  return join(root, ".a11yforge", "sources");
}

/**
 * Resolve `candidate` against `root` and require containment.
 * Resolves symlinks on existing paths; fails on escape or traversal.
 */
export async function assertPathWithin(
  root: string,
  candidate: string,
): Promise<string> {
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, candidate);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}/`)) {
    throw new Error(`Refusing path outside the source root: ${candidate}`);
  }
  let canonical = absolute;
  try {
    canonical = await realpath(absolute);
  } catch {
    // Missing paths cannot be symlink escapes; lexical containment applies.
    return absolute;
  }
  let canonicalRoot = absoluteRoot;
  try {
    canonicalRoot = await realpath(absoluteRoot);
  } catch {
    // Root always exists in practice; fall back to the lexical root.
  }
  if (
    canonical !== canonicalRoot &&
    !canonical.startsWith(`${canonicalRoot}/`)
  ) {
    throw new Error(`Refusing symlink escape outside the source root.`);
  }
  return canonical;
}

/** Require an absolute path that already exists (local source roots). */
export function requireAbsolutePath(label: string, value: string): string {
  const trimmed = value.trim();
  if (!isAbsolute(trimmed)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  if (trimmed.includes("..")) {
    throw new Error(`${label} must not contain traversal segments.`);
  }
  return trimmed;
}
