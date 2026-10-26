import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AccessibilityScanResult } from "@a11yforge/shared";

/**
 * Persists the normalized scan result as JSON for future agents.
 * The artifact holds our compact evidence format, not a raw axe dump.
 */

export interface ArtifactOptions {
  /** Directory under which `<scanId>/scan.json` is written. */
  runsDir?: string;
}

const DEFAULT_RUNS_DIR = join(".a11yforge", "runs");

export async function writeRunArtifact(
  result: AccessibilityScanResult,
  options: ArtifactOptions = {},
): Promise<string> {
  const runsDir = resolve(options.runsDir ?? DEFAULT_RUNS_DIR);
  const runDir = join(runsDir, result.scanId);
  await mkdir(runDir, { recursive: true });
  const artifactPath = join(runDir, "scan.json");
  await writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return artifactPath;
}
