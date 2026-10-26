#!/usr/bin/env node
/**
 * `scan` — scan any URL for accessibility violations.
 *
 * Usage:
 *   pnpm scan -- http://localhost:3002
 *   pnpm scan                        (defaults to the fixture URL)
 *
 * Prints a human-readable terminal summary and writes the normalized
 * evidence JSON to `.a11yforge/runs/<scan-id>/scan.json`.
 * Exit 0: scan completed (even with findings). Exit 1: scan failed.
 */
import { join } from "node:path";
import { runAxeScan } from "./scanner/scan.js";
import { formatTerminalSummary } from "./scanner/report.js";
import { writeRunArtifact } from "./scanner/artifacts.js";
import { FIXTURE_URL } from "./scanner/fixture-server.js";
import { findWorkspaceRoot } from "./scanner/workspace.js";

interface CliArgs {
  url: string;
  writeArtifact: boolean;
  runsDir: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  let url = FIXTURE_URL;
  let writeArtifact = true;
  let runsDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      // pnpm/npm argument separator — skip, do not treat as a URL or flag.
      continue;
    } else if (arg === "--no-write") {
      writeArtifact = false;
    } else if (arg === "--runs-dir") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --runs-dir");
      }
      runsDir = next;
      i += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (arg.startsWith("http://") || arg.startsWith("https://")) {
      url = arg;
    } else {
      throw new Error(`Expected a URL, got: ${arg}`);
    }
  }
  return { url, writeArtifact, runsDir };
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      `scan: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runAxeScan(args.url);
    console.log(formatTerminalSummary(result));

    if (args.writeArtifact) {
      // Artifacts live at the workspace root regardless of which package
      // directory the command was invoked from.
      const runsDir =
        args.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");
      const artifactPath = await writeRunArtifact(result, { runsDir });
      console.log(`Artifact: ${artifactPath}`);
    }
  } catch (error) {
    console.error(
      `scan: failed to scan ${args.url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

await main();
