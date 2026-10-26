#!/usr/bin/env node
/**
 * `propose:fixture` — ONE Meta repair-proposal request from an existing
 * valid source-trace artifact. Prints the credit notice BEFORE the paid
 * call, validates the proposal locally, and persists `repair-proposal.json`
 * plus `repair-model-usage.json` next to the source artifacts.
 *
 * The proposal is NEVER applied here. Application and verification belong
 * to Phase 5. Requires `MODEL_API_KEY` in the environment — with no key the
 * command fails BEFORE any network request. Never run by tests or builds.
 */
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { runProposeFixture } from "./repair/propose.js";

async function main(): Promise<void> {
  try {
    await runProposeFixture();
  } catch (error) {
    if (error instanceof Error && error.message.includes(MODEL_API_KEY_ENV)) {
      console.error(`propose:fixture: ${error.message}`);
    } else {
      console.error(
        `propose:fixture: failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}

await main();
