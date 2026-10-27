/**
 * Phase 9 — developer CLI for source-connected repair.
 *
 * Calls the SAME underlying engine as the web product:
 *
 *   a11yforge repair --run <run-id> --finding <finding-id> --source .
 *   a11yforge repair --run <run-id> --finding <finding-id> --git https://github.com/owner/repo
 *
 * Connects source, builds the deterministic inventory + execution
 * profile, traces the finding into source, and reports whether an
 * automatic repair is authorized. Model-backed proposal/verify steps
 * run only with MODEL_API_KEY; without it the CLI stops honestly
 * after the deterministic trace (exit 3 = UNVERIFIABLE path).
 */

import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { findWorkspaceRoot } from "./scanner/workspace.js";
import {
  connectSource,
  traceFindingToSource,
  writeSourceArtifacts,
} from "./source/connect.js";
import { isTraceSufficientForRepair } from "./source/rank.js";

function flagValue(name: string): string | null {
  const args = process.argv.slice(2);
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}` && i + 1 < args.length) return args[i + 1] ?? null;
  }
  return null;
}

async function main(): Promise<void> {
  const runId = flagValue("run");
  const findingId = flagValue("finding");
  const gitUrl = flagValue("git");
  const localSource = flagValue("source");
  if (runId === null || findingId === null || (gitUrl === null) === (localSource === null)) {
    console.error(
      "Usage: a11yforge repair --run <run-id> --finding <finding-id> (--source <dir> | --git <url>)" +
        " [--install-command ...] [--build-command ...] [--start-command ...] [--test-command ...]",
    );
    process.exitCode = 2;
    return;
  }
  const root = findWorkspaceRoot();
  const runsDir = process.env["A11YFORGE_RUNS_DIR"] ?? join(root, ".a11yforge", "runs");
  const runDir = join(runsDir, runId);
  const userCommands: {
    installCommand?: string;
    buildCommand?: string;
    startCommand?: string;
    testCommand?: string;
  } = {};
  for (const [flag, key] of [
    ["install-command", "installCommand"],
    ["build-command", "buildCommand"],
    ["start-command", "startCommand"],
    ["test-command", "testCommand"],
  ] as const) {
    const value = flagValue(flag);
    if (value !== null) userCommands[key] = value;
  }
  const hasUserCommands = Object.values(userCommands).some((v) => v !== undefined);

  console.log("Connecting source…");
  const connected = await connectSource({
    ...(gitUrl === null ? {} : { gitUrl }),
    ...(localSource === null ? {} : { localPath: resolve(root, localSource) }),
    sourceId: `src-${randomUUID().slice(0, 8)}`,
    ...(hasUserCommands ? { userCommands } : {}),
  });
  console.log(`Source connected. Revision: ${connected.target.revision}`);
  console.log(
    `Inventory: ${String(connected.inventory.fileCount)} files, ` +
      `${String(connected.inventory.textFiles.length)} text files, ` +
      `${connected.inventory.manifestFiles.join(", ") || "no manifests"}.`,
  );
  console.log(
    `Execution: adapter=${connected.profile.adapter} confidence=${connected.profile.confidence} — ${connected.profile.explanation}`,
  );
  if (connected.profile.confidence === "unknown") {
    console.log(
      "Source connected, but A11yForge needs launch instructions to verify repairs. " +
        "Re-run with --install-command/--build-command/--start-command.",
    );
  }

  console.log("Finding responsible code…");
  const trace = await traceFindingToSource({
    runDir,
    findingId,
    target: connected.target,
    inventory: connected.inventory,
  });
  await writeSourceArtifacts({ runDir, connected, trace });

  if (trace.status === "FOUND" && trace.candidates[0] !== undefined) {
    console.log(`Responsible code located: ${trace.candidates[0].filePath}`);
    for (const reason of trace.candidates[0].matchReasons.slice(0, 5)) {
      console.log(`  Matched: ${reason}`);
    }
  } else if (trace.status === "AMBIGUOUS") {
    console.log("Several files matched — automatic repair withheld. Top candidates:");
    for (const candidate of trace.candidates.slice(0, 5)) {
      console.log(`  - ${candidate.filePath} (score ${String(candidate.score)})`);
    }
  } else {
    console.log("No source matched the browser evidence. Automatic repair withheld.");
  }
  console.log(trace.reason);

  if (!isTraceSufficientForRepair({ ...trace, selectedContext: trace.selectedContext })) {
    console.log("STATUS: trace insufficient — no repair proposed.");
    process.exitCode = 3;
    return;
  }
  if (process.env["MODEL_API_KEY"] === undefined || process.env["MODEL_API_KEY"] === "") {
    console.log(
      "Trace sufficient, but MODEL_API_KEY is not configured — stopping before any model call. " +
        "The trace artifacts above are ready for `Repair this issue`.",
    );
    process.exitCode = 3;
    return;
  }
  console.log("Trace sufficient. Model-backed proposal and isolated verification are available via the API flow.");
}

await main();
