#!/usr/bin/env node
/**
 * `demo:export` — export one explicitly provided completed ACCEPTED run
 * from the git-ignored `.a11yforge/runs/` tree into the versioned
 * `demo/accepted-run/` bundle. Real historical artifacts only; sanitized
 * for commit (no absolute paths, no request IDs, no secrets).
 *
 * Usage: `pnpm demo:export -- --run <run-id>`
 *
 * Zero model calls. Fails closed: nothing is written unless every
 * sanitization check passes.
 */
import { join, resolve } from "node:path";
import { exportDemoRun, DemoBundleError } from "./demo/bundle.js";
import { findWorkspaceRoot } from "./scanner/workspace.js";

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

async function main(): Promise<void> {
  const runId = flagValue("--run");
  if (runId === null || runId === "") {
    console.error("demo:export: refusing: pass the accepted run explicitly (--run <run-id>)");
    process.exitCode = 1;
    return;
  }
  const root = findWorkspaceRoot();
  const sourceDir = flagValue("--source-dir") ?? join(root, ".a11yforge", "runs");
  const outDir = flagValue("--out-dir") ?? join(root, "demo", "accepted-run");
  try {
    const manifest = await exportDemoRun({
      runDir: resolve(join(sourceDir, runId)),
      runId,
      outDir: resolve(outDir),
    });
    console.log(
      `demo:export: exported ACCEPTED run ${manifest.runId} ` +
        `(${manifest.artifacts.length} artifacts, ${manifest.redactions} redactions) ` +
        `mode=${manifest.mode} source=${manifest.source}`,
    );
  } catch (error) {
    const message = error instanceof DemoBundleError ? error.message : String(error);
    console.error(`demo:export: refused: ${message}`);
    process.exitCode = 1;
  }
}

await main();
