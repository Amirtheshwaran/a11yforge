#!/usr/bin/env node
/**
 * `scan:fixture` — boot the broken-shop fixture, scan it, then stop it.
 *
 * One command, full Phase 1 loop:
 *   BROKEN FIXTURE -> BROWSER LAUNCH -> AXE SCAN -> STRUCTURED FINDINGS
 *   -> TERMINAL REPORT
 *
 * Exit 0: scan completed (even with findings). Exit 1: fixture or scan failed.
 */
import { join } from "node:path";
import { runAxeScan } from "./scanner/scan.js";
import { formatTerminalSummary } from "./scanner/report.js";
import { writeRunArtifact } from "./scanner/artifacts.js";
import {
  startFixtureServer,
  type FixtureServer,
} from "./scanner/fixture-server.js";
import { findWorkspaceRoot } from "./scanner/workspace.js";

async function main(): Promise<void> {
  console.log("Starting broken-shop fixture…");
  let server: FixtureServer | undefined;
  try {
    server = await startFixtureServer();
  } catch (error) {
    console.error(
      `scan:fixture: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Fixture ready at ${server.url}`);

  try {
    const result = await runAxeScan(server.url);
    console.log(formatTerminalSummary(result));
    const artifactPath = await writeRunArtifact(result, {
      runsDir: join(findWorkspaceRoot(), ".a11yforge", "runs"),
    });
    console.log(`Artifact: ${artifactPath}`);
  } catch (error) {
    console.error(
      `scan:fixture: scan failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await server.stop();
  }
}

await main();
