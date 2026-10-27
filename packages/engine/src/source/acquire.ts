import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseGitSource, sanitizeGitError } from "./git-url.js";
import { assertPathWithin, requireAbsolutePath } from "./paths.js";

/**
 * Phase 9 — safe source acquisition.
 *
 * Remote sources: bounded shallow clone (`--depth 1`, no submodules, no
 * hooks, `file://` transport disabled), no repository code executed during
 * cloning, partial clones removed on failure, displayed errors sanitized.
 * Local sources (trusted CLI only): bounded copy into the workspace with
 * symlink-escape and root-containment checks. The original is never mutated.
 */

export const CLONE_TIMEOUT_MS = 120_000;
export const CLONE_MAX_BYTES = 512 * 1024 * 1024;
export const LOCAL_COPY_MAX_BYTES = 512 * 1024 * 1024;
export const LOCAL_COPY_MAX_FILES = 20_000;

export interface CloneResult {
  /** Absolute workspace directory holding the acquired source. */
  workspacePath: string;
  /** Resolved commit SHA (reproducibility record). */
  revision: string;
}

function runGit(
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env,
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8").slice(0, 4000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8").slice(0, 4000);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`git ${args[0] ?? ""} exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/** Minimal environment for git: no credentials, no hooks, no user config. */
export function gitCloneEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  if (process.env.SYSTEMROOT !== undefined) env.SYSTEMROOT = process.env.SYSTEMROOT;
  return env;
}

function sourceDirName(sourceId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sourceId)) {
    throw new Error(`Invalid source id: ${sourceId}`);
  }
  return sourceId;
}

/**
 * Shallow-clone a validated public Git URL into the sources directory.
 * Cleans up the partial clone on any failure.
 */
export async function cloneGitSource(args: {
  gitUrl: string;
  sourcesDir: string;
  sourceId?: string | undefined;
  timeoutMs?: number | undefined;
  allowPrivate?: boolean | undefined;
}): Promise<CloneResult> {
  const parsed = parseGitSource(args.gitUrl, {
    allowPrivate: args.allowPrivate,
  });
  const sourceId = args.sourceId ?? `src-${randomUUID().slice(0, 8)}`;
  const destDir = join(args.sourcesDir, sourceDirName(sourceId), "repo");
  await rm(destDir, { recursive: true, force: true });
  const timeoutMs = args.timeoutMs ?? CLONE_TIMEOUT_MS;
  const env = gitCloneEnv();
  try {
    await runGit(
      [
        "clone",
        "--depth",
        "1",
        "--no-recurse-submodules",
        "--config",
        "core.hooksPath=/dev/null",
        "--config",
        "protocol.file.allow=never",
        parsed.cloneUrl,
        destDir,
      ],
      args.sourcesDir,
      timeoutMs,
      env,
    );
    const { stdout } = await runGit(["rev-parse", "HEAD"], destDir, 30_000, env);
    const revision = stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error("Could not resolve the cloned commit.");
    }
    return { workspacePath: destDir, revision };
  } catch (error) {
    await rm(destDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`Could not connect that repository: ${sanitizeGitError(error)}`);
  }
}

/**
 * Copy a trusted local directory into the workspace (CLI path only).
 * Fails on symlink escapes, containment violations, and size bounds.
 * Returns the workspace path plus a content hash as the revision record.
 */
export async function copyLocalSource(args: {
  sourcePath: string;
  sourcesDir: string;
  sourceId?: string;
}): Promise<CloneResult> {
  const absolute = requireAbsolutePath("Source directory", args.sourcePath);
  const st = await stat(absolute).catch(() => null);
  if (st === null || !st.isDirectory()) {
    throw new Error("That local source directory does not exist.");
  }
  const sourceId = args.sourceId ?? `src-${randomUUID().slice(0, 8)}`;
  const destDir = join(args.sourcesDir, sourceDirName(sourceId), "repo");
  await rm(destDir, { recursive: true, force: true });
  const staging = await mkdtemp(join(args.sourcesDir, `.staging-${sourceDirName(sourceId)}-`));
  try {
    await cp(absolute, staging, {
      recursive: true,
      dereference: false,
      filter: (src) => !src.split("/").includes(".git"),
      errorOnExist: false,
    });
    const hash = createHash("sha256");
    const { count, bytes } = await hashTree(staging, destDir, hash);
    if (count > LOCAL_COPY_MAX_FILES || bytes > LOCAL_COPY_MAX_BYTES) {
      throw new Error("That source tree exceeds the local ingest bounds.");
    }
    await rm(destDir, { recursive: true, force: true });
    await cp(staging, destDir, { recursive: true, dereference: false });
    return { workspacePath: destDir, revision: `local-${hash.digest("hex").slice(0, 40)}` };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function hashTree(
  staging: string,
  destDir: string,
  hash: ReturnType<typeof createHash>,
): Promise<{ count: number; bytes: number }> {
  // Walk the staging copy: resolve every symlink, enforce containment and
  // size bounds before the tree is promoted to the workspace.
  const { readdir, lstat, readlink } = await import("node:fs/promises");
  const { join: joinPath, relative } = await import("node:path");
  let count = 0;
  let bytes = 0;
  const queue: string[] = [staging];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      count += 1;
      if (count > LOCAL_COPY_MAX_FILES + 1000) {
        throw new Error("That source tree exceeds the local ingest bounds.");
      }
      const absolute = joinPath(dir, entry.name);
      const rel = relative(staging, absolute);
      if (rel === "" || rel.startsWith("..")) {
        throw new Error("Refusing path outside the source root.");
      }
      const lst = await lstat(absolute);
      if (lst.isSymbolicLink()) {
        const target = await readlink(absolute);
        const resolved = joinPath(dir, target);
        await assertPathWithin(staging, relative(staging, resolved));
        const real = await import("node:fs/promises").then((fs) =>
          fs.realpath(resolved).catch(() => null),
        );
        if (real === null) {
          throw new Error("Refusing dangling source symlink.");
        }
        await assertPathWithin(staging, relative(staging, real));
      } else if (lst.isDirectory()) {
        queue.push(absolute);
      } else if (lst.isFile()) {
        bytes += lst.size;
        if (bytes > LOCAL_COPY_MAX_BYTES + 64 * 1024 * 1024) {
          throw new Error("That source tree exceeds the local ingest bounds.");
        }
        if (lst.size <= 1024 * 1024) {
          hash.update(rel);
          hash.update(await readFile(absolute).catch(() => Buffer.alloc(0)));
        } else {
          hash.update(rel);
          hash.update(String(lst.size));
        }
      }
    }
  }
  void destDir;
  return { count, bytes };
}

/** Remove a connected-source workspace. Refuses paths outside sourcesDir. */
export async function cleanSourceWorkspace(args: {
  workspacePath: string;
  sourcesDir: string;
}): Promise<void> {
  // workspacePath is <sourcesDir>/<sourceId>/repo — remove the source root.
  const { dirname } = await import("node:path");
  const sourceRoot = dirname(args.workspacePath);
  const root = sourceRoot.endsWith("/") ? sourceRoot.slice(0, -1) : sourceRoot;
  const base = args.sourcesDir.endsWith("/") ? args.sourcesDir.slice(0, -1) : args.sourcesDir;
  if (!root.startsWith(`${base}/`) || root === base) {
    throw new Error("Refusing to clean outside the sources directory.");
  }
  await rm(root, { recursive: true, force: true });
}
