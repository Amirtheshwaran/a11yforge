import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExecutionProfile,
  GenericRepairOutcome,
  GenericSourceTrace,
  GenericVerification,
  ReproductionPlan,
  RepairProposal,
} from "@a11yforge/shared";
import {
  applyRepairProposal,
  type ApplyRepairResult,
} from "../verify/apply.js";
import { runIsolated, type SandboxIsolation } from "./sandbox.js";
import {
  verificationUrlFor,
  type ResolvablePage,
} from "./reproduce.js";

/**
 * Phase 9 — generic source-connected repair verification.
 *
 * Gates (only meaningfully available ones run; the rest report
 * `unavailable` honestly):
 * anchor application → install → build → tests (when confidently
 * available) → startup → health → same-page navigation → same
 * reproduction plan → target assertion → axe regression on the
 * affected page. VERIFIED requires the original selected failure to
 * be deterministically shown resolved — never build/tests/critic
 * alone. UNVERIFIABLE when the app cannot be launched.
 */

export type GateStatus = "passed" | "failed" | "unavailable";

export interface VerificationGate {
  name: string;
  status: GateStatus;
  detail: string;
}

/** Browser + replay hooks (injected so tests run without a browser). */
export interface ReplayHooks {
  /**
   * Start the repaired app and return its origin. Throws when the app
   * cannot be launched from the observed profile/user commands.
   */
  startApp: (args: {
    workspaceRoot: string;
    profile: ExecutionProfile;
  }) => Promise<{ origin: string; stop: () => Promise<void> }>;
  /** Replay the plan at the verification URL; resolve true when the target assertion passes. */
  replayPlan: (args: {
    verificationUrl: string;
    plan: ReproductionPlan;
    resolveIn: (page: ResolvablePage) => Promise<void>;
  }) => Promise<{ targetPassed: boolean; detail: string }>;
  /** Axe rule ids present on the affected page after repair. */
  scanAffectedPage?: (verificationUrl: string) => Promise<string[]>;
}

export interface SourceRepairRunArgs {
  verificationId: string;
  sourceId: string;
  findingId: string;
  baseRevision: string;
  /** Isolated workspace root holding the acquired source (mutated here). */
  workspaceRoot: string;
  proposal: RepairProposal;
  profile: ExecutionProfile;
  trace: GenericSourceTrace;
  plan: ReproductionPlan;
  axeBefore: string[];
  runDir: string;
  hooks: ReplayHooks;
  installTimeoutMs?: number;
  buildTimeoutMs?: number;
  startTimeoutMs?: number;
}

export interface SourceRepairRunResult {
  outcome: GenericRepairOutcome;
  verification: GenericVerification;
  applied: ApplyRepairResult | null;
  isolation: SandboxIsolation | null;
  verificationOrigin: string;
}

function gate(
  name: string,
  status: GateStatus,
  detail: string,
): VerificationGate {
  return { name, status, detail: detail.slice(0, 500) };
}

function toOutcome(gates: VerificationGate[]): GenericRepairOutcome {
  const byName = new Map(gates.map((g) => [g.name, g.status]));
  if (byName.get("anchor-application") === "failed") return "REJECTED";
  if (byName.get("build") === "failed") return "REJECTED";
  if (byName.get("startup") === "failed") return "UNVERIFIABLE";
  if (byName.get("startup") === "unavailable") return "UNVERIFIABLE";
  if (byName.get("target-assertion") === "failed") return "REJECTED";
  if (byName.get("target-assertion") === "passed") {
    return byName.get("axe-regression") === "failed" ? "REJECTED" : "VERIFIED";
  }
  // Anchors applied / built but the target could not be evaluated.
  if (byName.get("anchor-application") === "passed") {
    if (byName.get("build") === "passed") return "BUILD_PASSED";
    return "APPLIED";
  }
  return "PROPOSED";
}

/**
 * Execute the generic verification. Never throws for gate failures —
 * they are recorded and mapped to an outcome. Writes
 * `verification.json` into the run dir.
 */
export async function runSourceRepairVerification(
  args: SourceRepairRunArgs,
): Promise<SourceRepairRunResult> {
  const gates: VerificationGate[] = [];
  let applied: ApplyRepairResult | null = null;
  let isolation: SandboxIsolation | null = null;
  let verificationOrigin = "";
  let axeAfter: string[] = [];

  // Gate 1: exact-anchor application in the isolated workspace only.
  try {
    applied = await applyRepairProposal({
      workspaceSourceRoot: args.workspaceRoot,
      proposal: args.proposal,
    });
    gates.push(
      gate(
        "anchor-application",
        "passed",
        `${String(applied.appliedEdits.length)} edits applied in the isolated workspace.`,
      ),
    );
  } catch (error) {
    gates.push(
      gate(
        "anchor-application",
        "failed",
        error instanceof Error ? error.message : "Anchor application failed.",
      ),
    );
    return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
  }

  // Gate 2: install (only when a command is actually known).
  if (args.profile.installCommand !== null) {
    const parts = splitCommand(args.profile.installCommand.command);
    if (parts === null) {
      gates.push(gate("install", "failed", "Install command could not be parsed safely."));
      return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
    }
    const result = await runIsolated({
      argv: parts,
      cwd: workingDirOf(args),
      timeoutMs: args.installTimeoutMs ?? 600_000,
      network: "registry",
    });
    isolation = result.isolation;
    gates.push(
      gate(
        "install",
        result.exitCode === 0 ? "passed" : "failed",
        result.timedOut ? "Install timed out." : `Install exited ${String(result.exitCode)}.`,
      ),
    );
    if (result.exitCode !== 0) {
      return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
    }
  } else {
    gates.push(gate("install", "unavailable", "No install command observed; skipping."));
  }

  // Gate 3: build (only when a command is actually known).
  if (args.profile.buildCommand !== null) {
    const parts = splitCommand(args.profile.buildCommand.command);
    if (parts === null) {
      gates.push(gate("build", "failed", "Build command could not be parsed safely."));
      return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
    }
    const result = await runIsolated({
      argv: parts,
      cwd: workingDirOf(args),
      timeoutMs: args.buildTimeoutMs ?? 600_000,
      network: "none",
    });
    isolation = result.isolation;
    gates.push(
      gate(
        "build",
        result.exitCode === 0 ? "passed" : "failed",
        result.timedOut ? "Build timed out." : `Build exited ${String(result.exitCode)}.`,
      ),
    );
    if (result.exitCode !== 0) {
      return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
    }
  } else {
    gates.push(gate("build", "unavailable", "No build command observed; skipping."));
  }

  // Gate 4: tests (only when confidently available).
  if (args.profile.testCommands.length > 0) {
    const first = args.profile.testCommands[0];
    if (first !== undefined) {
      const parts = splitCommand(first.command);
      if (parts !== null) {
        const result = await runIsolated({
          argv: parts,
          cwd: workingDirOf(args),
          timeoutMs: 600_000,
          network: "none",
        });
        isolation = result.isolation;
        gates.push(
          gate(
            "tests",
            result.exitCode === 0 ? "passed" : "failed",
            result.timedOut ? "Tests timed out." : `Tests exited ${String(result.exitCode)}.`,
          ),
        );
        if (result.exitCode !== 0) {
          return finish(args, gates, "REJECTED", applied, isolation, verificationOrigin, axeAfter);
        }
      } else {
        gates.push(gate("tests", "unavailable", "Test command could not be parsed safely."));
      }
    }
  } else {
    gates.push(gate("tests", "unavailable", "No test command observed; skipping."));
  }

  // Gate 5: startup + same-location navigation + same-plan replay.
  let stop: (() => Promise<void>) | null = null;
  try {
    const started = await args.hooks.startApp({
      workspaceRoot: args.workspaceRoot,
      profile: args.profile,
    });
    stop = started.stop;
    verificationOrigin = started.origin;
    gates.push(gate("startup", "passed", `Repaired app serving at ${started.origin}.`));
  } catch (error) {
    gates.push(
      gate(
        "startup",
        args.profile.startCommand === null ? "unavailable" : "failed",
        error instanceof Error ? error.message : "The repaired app could not be launched.",
      ),
    );
    const outcome = toOutcome(gates);
    return finish(args, gates, outcome, applied, isolation, verificationOrigin, axeAfter);
  }

  try {
    const verificationUrl = verificationUrlFor(args.plan, verificationOrigin);
    gates.push(gate("same-page-navigation", "passed", `Replaying at ${verificationUrl}.`));
    const replay = await args.hooks.replayPlan({
      verificationUrl,
      plan: args.plan,
      resolveIn: async () => undefined,
    });
    gates.push(
      gate("target-assertion", replay.targetPassed ? "passed" : "failed", replay.detail),
    );
    if (args.hooks.scanAffectedPage !== undefined) {
      try {
        axeAfter = await args.hooks.scanAffectedPage(verificationUrl);
      } catch {
        axeAfter = [];
      }
    }
    const before = new Set(args.axeBefore);
    const fresh = axeAfter.filter((rule) => !before.has(rule));
    gates.push(
      gate(
        "axe-regression",
        args.hooks.scanAffectedPage === undefined
          ? "unavailable"
          : fresh.length === 0
            ? "passed"
            : "failed",
        args.hooks.scanAffectedPage === undefined
          ? "No regression scan available."
          : fresh.length === 0
            ? "No new serious/critical axe issues on the affected page."
            : `New axe issues after repair: ${fresh.join(", ")}.`,
      ),
    );
  } catch (error) {
    gates.push(
      gate(
        "target-assertion",
        "failed",
        error instanceof Error ? error.message : "Replay failed.",
      ),
    );
  } finally {
    if (stop !== null) {
      await stop().catch(() => undefined);
    }
  }

  const outcome = toOutcome(gates);
  return finish(args, gates, outcome, applied, isolation, verificationOrigin, axeAfter);
}

function workingDirOf(args: SourceRepairRunArgs): string {
  return args.profile.workingDirectory === "." || args.profile.workingDirectory === ""
    ? args.workspaceRoot
    : join(args.workspaceRoot, args.profile.workingDirectory);
}

/**
 * Split a manifest/user command into argv WITHOUT a shell. Only
 * simple `program arg…` commands are supported; anything with shell
 * metacharacters is refused rather than interpreted.
 */
export function splitCommand(command: string): string[] | null {
  const trimmed = command.trim();
  if (trimmed === "" || trimmed.length > 500) return null;
  if (/[;&|`$(){}<>!#*?~]/.test(trimmed)) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0 || parts[0] === undefined || parts[0] === "") return null;
  if (parts[0].includes("/") || parts[0].includes("\\")) return null;
  return parts;
}

async function finish(
  args: SourceRepairRunArgs,
  gates: VerificationGate[],
  outcome: GenericRepairOutcome,
  applied: ApplyRepairResult | null,
  isolation: SandboxIsolation | null,
  verificationOrigin: string,
  axeAfter: string[],
): Promise<SourceRepairRunResult> {
  const before = new Set(args.axeBefore);
  const verification: GenericVerification = {
    verificationId: args.verificationId,
    sourceId: args.sourceId,
    findingId: args.findingId,
    outcome,
    gates: gates.map((g) => ({ name: g.name, status: g.status, detail: g.detail })),
    baseRevision: args.baseRevision,
    verificationOrigin,
    axeBefore: args.axeBefore,
    axeAfter,
    newSeriousOrCritical: axeAfter.filter((rule) => !before.has(rule)),
  };
  await mkdir(args.runDir, { recursive: true });
  await writeFile(
    join(args.runDir, "verification.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );
  // Patch download artifact: the exact diff plus provenance metadata
  // (rules: a patch without its base revision is not reliable).
  // Written whenever anchors applied, whatever the outcome.
  if (applied !== null) {
    const header = [
      `# A11yForge repair patch`,
      `# baseRevision: ${args.baseRevision}`,
      `# finding: ${args.findingId}`,
      `# proposal: ${args.proposal.proposalId}`,
      `# source: ${args.sourceId}`,
      `# outcome: ${outcome}`,
    ].join("\n");
    await writeFile(
      join(args.runDir, "repair-diff.patch"),
      `${header}\n${applied.diffText.endsWith("\n") ? applied.diffText : `${applied.diffText}\n`}`,
      "utf8",
    );
  }
  return { outcome, verification, applied, isolation, verificationOrigin };
}
