#!/usr/bin/env node
/**
 * `repair:fixture` — the closed autonomous repair loop on the fixture.
 *
 * Consumes the existing scenario, diagnosis, source trace, and validated
 * repair proposal, then executes: validate proposal → isolated workspace
 * → apply → build → replay the SAME scenario → axe regression scan →
 * deterministic gate → bounded critic iff eligible → final verdict.
 *
 * Never generates another repair proposal. Never mutates the main
 * fixture source. Exit 0 only when the repair is ACCEPTED.
 */
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { runRepairFixture } from "./verify/repair-fixture.js";

async function main(): Promise<void> {
  try {
    const result = await runRepairFixture();
    console.log(`Repair workspace: ${result.workspace.workspaceRoot}`);
    console.log(`Artifacts: ${result.runDir}`);
    if (result.finalState !== "ACCEPTED") {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(MODEL_API_KEY_ENV)) {
      console.error(`repair:fixture: ${error.message}`);
    } else {
      console.error(
        `repair:fixture: failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}

await main();
