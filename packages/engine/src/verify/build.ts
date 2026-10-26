import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Phase 5 repaired-fixture build.
 *
 * Runs the real fixture build inside the isolated workspace and captures
 * command, exit status, duration, and bounded stdout/stderr. A failed
 * build ends the repair as BUILD_FAILED — never a second model call, never
 * an automatic retry in this phase.
 */

export interface BuildResult {
  command: string;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  passed: boolean;
}

/** Characters of process output retained per stream (bounded evidence). */
export const MAX_BUILD_OUTPUT_CHARS = 8000;

export interface BuildWorkspaceDeps {
  /** Absolute fixture copy inside the repair workspace. */
  workspaceSourceRoot: string;
  /** Build timeout (default 120s). */
  timeoutMs?: number;
  /**
   * Command override for tests: replaces the vite build invocation.
   * Production always runs the real fixture build.
   */
  command?: string[];
}

function viteBuildCommand(workspaceSourceRoot: string): {
  command: string[];
  display: string;
} {
  const fixtureRequire = createRequire(
    join(workspaceSourceRoot, "package.json"),
  );
  const vitePkgPath = fixtureRequire.resolve("vite/package.json");
  const viteBin = join(dirname(vitePkgPath), "bin", "vite.js");
  return {
    command: [process.execPath, viteBin, "build"],
    display: "node <workspace>/node_modules/vite/bin/vite.js build",
  };
}

/** Run the fixture build inside the workspace and capture the outcome. */
export function buildWorkspace(
  deps: BuildWorkspaceDeps,
): Promise<BuildResult> {
  const { workspaceSourceRoot, timeoutMs = 120_000 } = deps;
  const resolved = deps.command
    ? { command: deps.command, display: deps.command.join(" ") }
    : viteBuildCommand(workspaceSourceRoot);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const [executable, ...rest] = resolved.command;
    if (!executable) {
      resolve({
        command: resolved.display,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdoutTail: "",
        stderrTail: "empty build command",
        passed: false,
      });
      return;
    }
    let timedOut = false;
    const child = spawn(executable, rest, {
      cwd: workspaceSourceRoot,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        command: resolved.display,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdoutTail: stdout.slice(-MAX_BUILD_OUTPUT_CHARS),
        stderrTail: `build spawn failed: ${error.message}`.slice(
          0,
          MAX_BUILD_OUTPUT_CHARS,
        ),
        passed: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command: resolved.display,
        exitCode: timedOut ? null : code,
        durationMs: Date.now() - startedAt,
        stdoutTail: stdout.slice(-MAX_BUILD_OUTPUT_CHARS),
        stderrTail: timedOut
          ? `build timed out after ${timeoutMs}ms`
          : stderr.slice(-MAX_BUILD_OUTPUT_CHARS),
        passed: !timedOut && code === 0,
      });
    });
  });
}
