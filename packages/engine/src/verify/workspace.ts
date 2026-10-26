import { cp, copyFile, mkdir, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "../scanner/workspace.js";

/**
 * Phase 5 isolated repair workspace.
 *
 * The main fixture source is NEVER mutated while testing a proposal.
 * Instead the files required to build the fixture are copied into a
 * git-ignored workspace (`.a11yforge/workspaces/<repair-id>/`) and the
 * repair is applied there. `node_modules` is symlinked (never copied) so
 * the workspace builds identically without duplicating dependencies.
 *
 * Retention policy: workspaces are RETAINED as repair artifacts — an
 * accepted repair's workspace is the demonstration of the autonomous fix,
 * and a rejected one preserves the failure evidence. `cleanRepairWorkspace`
 * exists only for explicit manual reclamation; the pipeline never deletes
 * a workspace on its own. It refuses any path outside the workspaces dir.
 */

export const REPAIR_WORKSPACES_DIRNAME = "workspaces";

/** Fixture entries required to build/test broken-shop in isolation. */
export const REPAIR_WORKSPACE_ENTRIES = [
  "src",
  "public",
  "index.html",
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
] as const;

/**
 * Monorepo base config the fixture extends via `../../tsconfig.base.json`.
 * The workspace mirrors the repo-relative layout
 * (`<workspace>/fixtures/broken-shop/` + `<workspace>/tsconfig.base.json`)
 * so the relative extends resolves exactly as in the monorepo and the
 * isolated build type-checks against the same compiler options.
 */
export const REPAIR_WORKSPACE_BASE_CONFIG = "tsconfig.base.json";

/** Repo-relative fixture location mirrored inside the workspace. */
export const REPAIR_WORKSPACE_FIXTURE_DIR = ["fixtures", "broken-shop"] as const;

export interface RepairWorkspace {
  repairId: string;
  /** Absolute workspace root (`.a11yforge/workspaces/<repair-id>/`). */
  workspaceRoot: string;
  /** Absolute fixture copy inside the workspace. */
  sourceRoot: string;
}

export function defaultWorkspacesDir(): string {
  return join(findWorkspaceRoot(), ".a11yforge", REPAIR_WORKSPACES_DIRNAME);
}

/**
 * Create an isolated workspace for one repair. Copies only the entries
 * needed to build/test the fixture and symlinks `node_modules`.
 */
export async function createRepairWorkspace(args: {
  repairId: string;
  fixtureRoot: string;
  workspacesDir: string;
  /**
   * Absolute monorepo base config to mirror into the workspace.
   * Defaults to the workspace root's tsconfig.base.json.
   */
  tsconfigBasePath?: string;
}): Promise<RepairWorkspace> {
  const { repairId, fixtureRoot, workspacesDir } = args;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repairId)) {
    throw new Error(`Invalid repair id for workspace: ${repairId}`);
  }
  const workspaceRoot = join(workspacesDir, repairId);
  if (existsSync(workspaceRoot)) {
    throw new Error(
      `Repair workspace already exists: ${workspaceRoot} (refusing to overwrite repair evidence)`,
    );
  }
  const sourceRoot = join(workspaceRoot, ...REPAIR_WORKSPACE_FIXTURE_DIR);
  await mkdir(sourceRoot, { recursive: true });
  for (const entry of REPAIR_WORKSPACE_ENTRIES) {
    await cp(join(fixtureRoot, entry), join(sourceRoot, entry), {
      recursive: true,
      errorOnExist: false,
    });
  }
  const baseConfig =
    args.tsconfigBasePath ?? join(findWorkspaceRoot(), REPAIR_WORKSPACE_BASE_CONFIG);
  if (existsSync(baseConfig)) {
    await copyFile(baseConfig, join(workspaceRoot, REPAIR_WORKSPACE_BASE_CONFIG));
  }
  const modulesSrc = join(fixtureRoot, "node_modules");
  if (existsSync(modulesSrc)) {
    await symlink(modulesSrc, join(sourceRoot, "node_modules"), "dir");
  }
  return { repairId, workspaceRoot, sourceRoot };
}

/**
 * Remove a repair workspace. Refuses any directory outside the
 * workspaces dir — this can never delete the main working tree.
 */
export async function cleanRepairWorkspace(args: {
  workspaceRoot: string;
  workspacesDir: string;
}): Promise<void> {
  const { workspaceRoot, workspacesDir } = args;
  const root = workspaceRoot.endsWith("/")
    ? workspaceRoot.slice(0, -1)
    : workspaceRoot;
  if (!root.startsWith(`${workspacesDir}/`) || root === workspacesDir) {
    throw new Error(
      `Refusing to clean outside the repair workspaces dir: ${workspaceRoot}`,
    );
  }
  await rm(root, { recursive: true, force: true });
}
