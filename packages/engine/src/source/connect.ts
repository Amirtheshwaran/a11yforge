import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  ExplorationRunSchema,
  type ExplorationFinding,
  type ExplorationRun,
  type GenericSourceTrace,
  type ProbeResult,
  type SourceInventory,
  type ExecutionProfile,
  type SourceTarget,
  type UserCommandConfig,
} from "@a11yforge/shared";

export type ExplorationRunSurfaces = ExplorationRun["surfaces"];
import { cloneGitSource, copyLocalSource } from "./acquire.js";
import { defaultSourcesDir } from "./paths.js";
import { buildSourceInventory } from "./inventory.js";
import { collectFingerprints, generateSearchTerms } from "./evidence-terms.js";
import { extractSourceContext } from "./context.js";
import { searchAndRank } from "./rank.js";
import { determineExecutionProfile } from "./exec-profile.js";

/**
 * Phase 9 — source-connection orchestration.
 *
 * One shared engine path for the web product and the developer CLI:
 * acquire → inventory → execution profile → evidence-derived trace →
 * bounded context. Per-run artifacts (`source-target.json`,
 * `source-inventory.json`, `execution-profile.json`,
 * `source-trace.json`) stay in the exploration run directory.
 */

export interface ConnectSourceArgs {
  /** Public Git URL (web + CLI) or null for local-source CLI use. */
  gitUrl?: string | undefined;
  /** Absolute local source directory (trusted CLI only). */
  localPath?: string | undefined;
  sourcesDir?: string | undefined;
  sourceId?: string | undefined;
  allowPrivateGit?: boolean | undefined;
  userCommands?: UserCommandConfig | undefined;
}

export interface ConnectedSource {
  target: SourceTarget;
  inventory: SourceInventory;
  profile: ExecutionProfile;
}

export async function connectSource(
  args: ConnectSourceArgs,
): Promise<ConnectedSource> {
  if ((args.gitUrl === undefined) === (args.localPath === undefined)) {
    throw new Error("Supply exactly one of a Git URL or a local source directory.");
  }
  const sourcesDir = args.sourcesDir ?? defaultSourcesDir();
  await mkdir(sourcesDir, { recursive: true });
  const sourceId = args.sourceId ?? `src-${randomUUID().slice(0, 8)}`;
  const connectedAt = new Date().toISOString();

  const acquired =
    args.gitUrl !== undefined
      ? await cloneGitSource({
          gitUrl: args.gitUrl,
          sourcesDir,
          sourceId,
          allowPrivate: args.allowPrivateGit,
        })
      : await copyLocalSource({
          sourcePath: args.localPath as string,
          sourcesDir,
          sourceId,
        });
  const target: SourceTarget = {
    sourceId,
    kind: args.gitUrl !== undefined ? "git" : "local",
    originalReference:
      args.gitUrl !== undefined ? args.gitUrl : (args.localPath as string),
    workspacePath: acquired.workspacePath,
    revision: acquired.revision,
    connectedAt,
  };
  const { inventory } = await buildSourceInventory({
    sourceId,
    revision: acquired.revision,
    sourceRoot: acquired.workspacePath,
  });
  const profile = await determineExecutionProfile({
    sourceId,
    sourceRoot: acquired.workspacePath,
    inventory,
    userCommands: args.userCommands,
  });
  return { target, inventory, profile };
}

export interface TraceFindingArgs {
  /** Directory holding `exploration.json` (the Phase 8 run dir). */
  runDir: string;
  findingId: string;
  target: SourceTarget;
  inventory: SourceInventory;
  traceId?: string;
}

/** Load the selected finding and its probe evidence from exploration.json. */
export async function loadFindingEvidence(
  runDir: string,
  findingId: string,
): Promise<{
  finding: ExplorationFinding;
  probe: ProbeResult;
  surfaces: ExplorationRunSurfaces;
}> {
  const raw = await readFile(join(runDir, "exploration.json"), "utf8").catch(
    () => null,
  );
  if (raw === null) {
    throw new Error(`No exploration run found in ${runDir}.`);
  }
  const run = ExplorationRunSchema.parse(JSON.parse(raw) as unknown);
  const finding = run.findings.find((f) => f.findingId === findingId);
  if (finding === undefined) {
    throw new Error(`Finding ${findingId} is not in this exploration run.`);
  }
  // The finding names its probe; fall back to the first failed probe on
  // the same page when the probe id is unknown (never invent evidence).
  const probe =
    run.probeResults.find((p) => p.probeId === finding.probeId) ??
    run.probeResults.find(
      (p) => p.pageUrl === finding.pageUrl && p.status === "failed",
    );
  if (probe === undefined) {
    throw new Error(
      `No probe evidence for finding ${findingId}; tracing requires browser evidence.`,
    );
  }
  return { finding, probe, surfaces: run.surfaces };
}

/** Deterministic trace of one finding into the connected source. */
export async function traceFindingToSource(
  args: TraceFindingArgs,
): Promise<GenericSourceTrace> {
  const { runDir, findingId, target, inventory } = args;
  const { probe, surfaces } = await loadFindingEvidence(runDir, findingId);
  const fingerprints = collectFingerprints({ probe, surfaces });
  const terms = generateSearchTerms(fingerprints);
  const ranked = await searchAndRank({
    sourceRoot: target.workspacePath,
    textFiles: inventory.textFiles,
    terms,
  });
  const withContext = await extractSourceContext({
    sourceRoot: target.workspacePath,
    candidates: ranked.candidates,
  });
  return {
    traceId: args.traceId ?? `trace-${randomUUID().slice(0, 8)}`,
    sourceId: target.sourceId,
    findingId,
    status: ranked.status,
    searchTerms: terms.map((t) => t.term),
    candidates: ranked.candidates,
    selectedContext: withContext,
    reason: ranked.reason,
  };
}

/** Persist connect + trace artifacts into the exploration run dir. */
export async function writeSourceArtifacts(args: {
  runDir: string;
  connected: ConnectedSource;
  trace?: GenericSourceTrace;
}): Promise<void> {
  await mkdir(args.runDir, { recursive: true });
  await writeFile(
    join(args.runDir, "source-target.json"),
    `${JSON.stringify(args.connected.target, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(args.runDir, "source-inventory.json"),
    `${JSON.stringify(args.connected.inventory, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(args.runDir, "execution-profile.json"),
    `${JSON.stringify(args.connected.profile, null, 2)}\n`,
    "utf8",
  );
  if (args.trace !== undefined) {
    await writeFile(
      join(args.runDir, "source-trace.json"),
      `${JSON.stringify(args.trace, null, 2)}\n`,
      "utf8",
    );
  }
}
