#!/usr/bin/env node
/**
 * `recover:fixture` — bounded verifier-driven recovery on the fixture.
 *
 * Attempt 2 of MAX_REPAIR_ATTEMPTS (2): consumes the preserved Attempt-1
 * artifacts, builds verifier feedback, requests exactly ONE revised repair
 * proposal, applies it in a FRESH isolated workspace, and re-runs
 * deterministic verification (typecheck first) plus the critic iff every
 * gate passes. Any deterministic failure STOPS with no further model
 * call — there is never a Proposal #3. Exit 0 only when ACCEPTED.
 */
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { runRecoverFixture } from "./verify/recover-fixture.js";

async function main(): Promise<void> {
  try {
    const result = await runRecoverFixture();
    console.log(`Repair workspace: ${result.workspace?.workspaceRoot ?? "(none)"}`);
    console.log(`Artifacts: ${result.runDir}`);
    if (result.finalState !== "ACCEPTED") {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(MODEL_API_KEY_ENV)) {
      console.error(`recover:fixture: ${error.message}`);
    } else {
      console.error(
        `recover:fixture: failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}

await main();
