import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the monorepo root by walking up from this file until
 * `pnpm-workspace.yaml` is found. Works from both src/ and dist/ layouts.
 * Throws when no workspace root is found — callers treat that as fatal,
 * since fixture paths and artifact dirs are defined relative to the root.
 */
export function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  throw new Error("Could not locate workspace root (pnpm-workspace.yaml)");
}
