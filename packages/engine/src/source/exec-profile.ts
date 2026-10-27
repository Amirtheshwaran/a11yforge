import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CommandFact,
  ExecutionProfile,
  PackageManager,
  SourceInventory,
  UserCommandConfig,
} from "@a11yforge/shared";

/**
 * Phase 9 — build/run environment discovery.
 *
 * Execution commands are NEVER guessed by a model. Each command cites
 * where it came from: a manifest script (`package.json#scripts.build`),
 * a recognized manifest standard, or explicit user configuration.
 * No command is claimed unless it was actually observed.
 */

export interface ExecutionProfileInput {
  sourceId: string;
  sourceRoot: string;
  inventory: SourceInventory;
  /** Optional advanced user-supplied commands (explicit evidence). */
  userCommands?: UserCommandConfig | undefined;
}

function fact(command: string, source: string): CommandFact {
  return { command: command.slice(0, 500), source };
}

/** Package manager from lockfiles actually present — never preference. */
export function detectPackageManager(lockfiles: string[]): PackageManager {
  const bases = lockfiles.map((f) => f.split("/").pop() ?? "");
  if (bases.includes("pnpm-lock.yaml")) return "pnpm";
  if (bases.includes("yarn.lock")) return "yarn";
  if (bases.includes("package-lock.json")) return "npm";
  if (bases.includes("bun.lock") || bases.includes("bun.lockb")) return "bun";
  return "unknown";
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function scriptOf(
  scripts: SourceInventory["scripts"],
  manifest: string,
  name: string,
  runner: string,
): CommandFact | null {
  const entry = scripts.find(
    (s) => s.source === `${manifest}#scripts.${name}`,
  );
  if (entry === undefined) return null;
  return fact(`${runner} ${name}`.trim(), entry.source);
}

/**
 * Determine the execution profile from repository facts.
 * Adapter order is structural (manifest presence), user commands fill
 * gaps and are labeled `user-supplied`.
 */
export async function determineExecutionProfile(
  input: ExecutionProfileInput,
): Promise<ExecutionProfile> {
  const { sourceId, sourceRoot, inventory, userCommands } = input;
  const user = (kind: keyof UserCommandConfig): CommandFact | null => {
    const value = userCommands?.[kind];
    return value === undefined ? null : fact(value, "user-supplied");
  };

  // Adapter 1: Node package manifest (top-level package.json with scripts).
  const nodeManifest = inventory.manifestFiles
    .filter((f) => f.split("/").pop() === "package.json")
    .sort((a, b) => a.length - b.length)[0];
  if (nodeManifest !== undefined) {
    const pkg = await readJsonFile(join(sourceRoot, nodeManifest));
    const scriptsRecord =
      pkg !== null && typeof pkg.scripts === "object" && pkg.scripts !== null
        ? (pkg.scripts as Record<string, unknown>)
        : null;
    const has = (name: string): boolean =>
      scriptsRecord !== null && typeof scriptsRecord[name] === "string";
    const manager = detectPackageManager(inventory.lockfiles);
    const runner = manager === "unknown" ? "npm run" : manager === "npm" ? "npm run" : manager;
    const install =
      manager === "pnpm"
        ? "pnpm install --frozen-lockfile"
        : manager === "yarn"
          ? "yarn install --frozen-lockfile"
          : manager === "npm"
            ? "npm ci"
            : manager === "bun"
              ? "bun install --frozen-lockfile"
              : null;
    const workingDirectory =
      nodeManifest.includes("/") === true
        ? (nodeManifest.split("/").slice(0, -1).join("/") ?? ".")
        : ".";
    const installCommand =
      user("installCommand") ??
      (install === null ? null : fact(install, `lockfile-standard:${manager}`));
    const buildCommand =
      user("buildCommand") ??
      (has("build") ? scriptOf(inventory.scripts, nodeManifest, "build", runner) : null);
    const startCommand =
      user("startCommand") ??
      (has("start")
        ? scriptOf(inventory.scripts, nodeManifest, "start", runner)
        : has("preview")
          ? scriptOf(inventory.scripts, nodeManifest, "preview", runner)
          : has("serve")
            ? scriptOf(inventory.scripts, nodeManifest, "serve", runner)
            : null);
    const testCommands = has("test")
      ? [scriptOf(inventory.scripts, nodeManifest, "test", runner)].filter(
          (c): c is CommandFact => c !== null,
        )
      : [];
    if (user("testCommand") !== null) {
      testCommands.unshift(user("testCommand") as CommandFact);
    }
    const observed = [installCommand, buildCommand, startCommand].filter(
      (c) => c !== null && c.source !== "user-supplied",
    ).length;
    const confidence =
      buildCommand !== null && startCommand !== null
        ? "high"
        : observed > 0 || startCommand !== null
          ? "partial"
          : userCommands === undefined
            ? "unknown"
            : "partial";
    return {
      sourceId,
      adapter: "node-manifest",
      installCommand,
      buildCommand,
      startCommand,
      testCommands,
      packageManager: manager,
      workingDirectory,
      confidence,
      explanation:
        confidence === "high"
          ? `Observed package.json scripts in ${nodeManifest}; install, build, and start commands come from the manifest and lockfile.`
          : `Observed ${nodeManifest} but no confident launch command. Supply install/start/build commands to verify repairs.`,
    };
  }

  // Adapter 2: Python project manifests.
  const pyManifest = inventory.manifestFiles.find((f) => {
    const base = f.split("/").pop() ?? "";
    return (
      base === "pyproject.toml" ||
      base === "requirements.txt" ||
      base === "setup.py"
    );
  });
  if (pyManifest !== undefined) {
    return {
      sourceId,
      adapter: "python-manifest",
      installCommand:
        user("installCommand") ??
        fact("pip install -r requirements.txt", `manifest-standard:${pyManifest}`),
      buildCommand: user("buildCommand") ?? null,
      startCommand: user("startCommand") ?? null,
      testCommands:
        user("testCommand") === null ? [] : [user("testCommand") as CommandFact],
      packageManager: "unknown",
      workingDirectory: ".",
      confidence: user("startCommand") !== null ? "partial" : "unknown",
      explanation: `Observed ${pyManifest}; Python projects vary too much to infer a launch command. Supply a start command to verify repairs.`,
    };
  }

  // Adapter 3: static HTML project (index.html at root, no build needed).
  const rootIndex = inventory.textFiles
    .filter((f) => !f.includes("/"))
    .find((f) => f.toLowerCase() === "index.html");
  if (rootIndex !== undefined) {
    return {
      sourceId,
      adapter: "static-html",
      installCommand: user("installCommand") ?? null,
      buildCommand: user("buildCommand") ?? null,
      startCommand:
        user("startCommand") ??
        fact("static-file-server ./index.html", `manifest-standard:${rootIndex}`),
      testCommands:
        user("testCommand") === null ? [] : [user("testCommand") as CommandFact],
      packageManager: "unknown",
      workingDirectory: ".",
      confidence: "partial",
      explanation: `Observed root ${rootIndex} with no build manifest; the page can be served statically for replay.`,
    };
  }

  // No adapter applies: honest unknown, user commands are the only facts.
  return {
    sourceId,
    adapter: "unknown",
    installCommand: user("installCommand") ?? null,
    buildCommand: user("buildCommand") ?? null,
    startCommand: user("startCommand") ?? null,
    testCommands:
      user("testCommand") === null ? [] : [user("testCommand") as CommandFact],
    packageManager: detectPackageManager(inventory.lockfiles),
    workingDirectory: ".",
    confidence: userCommands === undefined ? "unknown" : "partial",
    explanation:
      "No recognized manifest was observed, so A11yForge cannot determine how to launch this project. Supply install, build, and start commands to verify repairs.",
  };
}
