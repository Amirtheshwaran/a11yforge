/**
 * Phase 8 — developer CLI for universal exploration.
 *
 * Runs the exact same generic engine the product uses:
 *
 *   pnpm explore -- --url https://example.com [--max-pages 3] [--allow-private]
 *
 * Human-readable output, zero model calls.
 */

import { randomUUID } from "node:crypto";
import { isPrivateTargetsAllowed } from "./explore/target.js";
import { runExploration } from "./explore/orchestrator.js";
import { summarizeExploration } from "@a11yforge/shared";

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

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  const url = flagValue("url");
  if (url === null || url === "") {
    console.error("Usage: pnpm explore -- --url https://example.com [--max-pages 3] [--allow-private]");
    process.exitCode = 2;
    return;
  }
  const maxPages = Number(flagValue("max-pages") ?? "3");
  const allowPrivate = hasFlag("allow-private") || isPrivateTargetsAllowed();
  if (allowPrivate) {
    console.warn("Warning: private-target mode is on. Do not enable it on an untrusted public deployment.");
  }
  const runId = `exp-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const runsDir = process.env["A11YFORGE_RUNS_DIR"] ?? ".a11yforge/runs";

  const run = await runExploration({
    runId,
    entryUrl: url,
    policy: Number.isInteger(maxPages) ? { maxPages } : {},
    runsDir,
    allowPrivate,
    emit: (event) => {
      console.log(`[${event.stage}] ${event.message}`);
    },
  });

  const summary = summarizeExploration(run);
  console.log("");
  const pageCount = run.pagesVisited.length;
  console.log(`Accessibility test ${run.state === "COMPLETED" ? "complete" : run.state.toLowerCase()}: ${pageCount} ${pageCount === 1 ? "page" : "pages"} tested.`);
  console.log(`  Confirmed interaction failures: ${summary.confirmedFailures}`);
  console.log(`  Automated findings: ${summary.automatedFindings}`);
  console.log(`  Observations: ${summary.observations}`);
  console.log(`  Not tested: ${summary.notTested}`);
  for (const finding of run.findings) {
    console.log(`  - [${finding.category}] ${finding.title} (${finding.pageUrl})`);
  }
  for (const limitation of run.limitations) {
    console.log(`  ! ${limitation.message}`);
  }
  if (run.findings.length === 0 && run.state === "COMPLETED") {
    console.log("No accessibility failures were reproduced in the interactions tested.");
  }
  if (run.state === "FAILED") process.exitCode = 1;
}

await main();
