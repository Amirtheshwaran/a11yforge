#!/usr/bin/env node
/**
 * `demo:validate` — verify the committed recorded-demo bundle:
 * accepted status, artifact schemas, before/after verification, critic
 * verdict, usage evidence, screenshots, diffs, integrity hashes, and no
 * absolute paths or secret-like values anywhere. Fails closed.
 *
 * Usage: `pnpm demo:validate [-- --dir demo/accepted-run]`
 *
 * Zero model calls.
 */
import { join, resolve } from "node:path";
import { validateDemoBundle, DemoBundleError } from "./demo/bundle.js";
import { findWorkspaceRoot } from "./scanner/workspace.js";

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

async function main(): Promise<void> {
  const dir =
    flagValue("--dir") ?? join(findWorkspaceRoot(), "demo", "accepted-run");
  try {
    const result = await validateDemoBundle(resolve(dir));
    console.log(
      `demo:validate: OK run=${result.runId} ` +
        `artifacts=${result.artifacts} screenshots=${result.screenshots} ` +
        `mode=recorded source=real-a11yforge-run`,
    );
  } catch (error) {
    const message = error instanceof DemoBundleError ? error.message : String(error);
    console.error(`demo:validate: FAILED: ${message}`);
    process.exitCode = 1;
  }
}

await main();
