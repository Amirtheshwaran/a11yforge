#!/usr/bin/env node
/**
 * `diagnose:fixture` — diagnose the latest failed `focus-contained-in-modal`
 * Phase 2 artifact with exactly one Meta Model API request.
 *
 * Consumes the deterministically selected completed scenario run (never a
 * fresh browser run), builds the compact evidence bundle, prints the credit
 * notice, makes one structured-output request, validates locally (Zod +
 * evidence-reference grounding), and persists `diagnosis.json` plus
 * `model-usage.json` next to the source `scenario.json`.
 *
 * Requires `MODEL_API_KEY` in the environment. With no key the command
 * fails BEFORE any network request. This command is never run by tests or
 * builds — the user performs the single live request manually.
 */
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { runDiagnoseFixture } from "./diagnosis/diagnose.js";

async function main(): Promise<void> {
  try {
    await runDiagnoseFixture();
  } catch (error) {
    if (error instanceof Error && error.message.includes(MODEL_API_KEY_ENV)) {
      console.error(`diagnose:fixture: ${error.message}`);
    } else {
      console.error(
        `diagnose:fixture: failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}

await main();
