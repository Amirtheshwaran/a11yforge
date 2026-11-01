/**
 * Developer CLI for source inspection.
 *
 * Calls the SAME underlying engine as the web product:
 *
 *   a11yforge repair --run <run-id> --finding <finding-id> --source .
 *   a11yforge repair --run <run-id> --finding <finding-id> --git https://github.com/owner/repo
 *
 * Connects source, builds the deterministic inventory + execution
 * profile, traces the finding into source, and reports whether
 * the trace meets the source-matching threshold. This entry point does
 * not propose, apply, or verify repairs, even when a model key is set.
 * It stops after the deterministic trace (exit 3 = inspection only).
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

  console.log("Finding source candidates…");
  const trace = await traceFindingToSource({
    runDir,
    findingId,
    target: connected.target,
    inventory: connected.inventory,
  });
  await writeSourceArtifacts({ runDir, connected, trace });

  if (trace.status === "FOUND" && trace.candidates[0] !== undefined) {
    console.log(`Source candidate located: ${trace.candidates[0].filePath}`);
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
  console.log("STATUS: source inspection complete — no repair proposed or verified. Generic repair execution is not connected to this CLI or the public API.");
  process.exitCode = 3;
}

await main();
