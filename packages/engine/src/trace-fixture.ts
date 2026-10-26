#!/usr/bin/env node
/**
 * `trace:fixture` — deterministic source tracing for the latest successful
 * diagnosis. Fully deterministic and free: selects the latest diagnosis
 * artifact, derives search terms from evidence, searches
 * fixtures/broken-shop, ranks candidates, prints the strongest matches, and
 * writes `source-trace.json`. Makes ZERO Meta API calls and modifies no
 * fixture source.
 */
import { runTraceFixture, formatTraceSummary } from "./trace/trace.js";

async function main(): Promise<void> {
  try {
    const result = await runTraceFixture();
    console.log(
      formatTraceSummary(result.trace, result.runId, result.tracePath),
    );
    console.log(`Artifact: ${result.tracePath}`);
    if (!result.sufficient) {
      console.error(
        "trace:fixture: trace is INSUFFICIENT — no repair-model call will be authorized from this trace.",
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `trace:fixture: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

await main();
