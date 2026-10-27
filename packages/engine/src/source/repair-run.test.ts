import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSourceRepairVerification, type ReplayHooks } from "./repair-run.js";
import type {
  ExecutionProfile,
  GenericSourceTrace,
  ReproductionPlan,
  RepairProposal,
} from "@a11yforge/shared";

const PROFILE_BASE: ExecutionProfile = {
  sourceId: "src-test",
  adapter: "static-html",
  installCommand: null,
  buildCommand: null,
  startCommand: null,
  testCommands: [],
  packageManager: "unknown",
  workingDirectory: ".",
  confidence: "partial",
  explanation: "static",
};

function trace(): GenericSourceTrace {
  return {
    traceId: "trace-1",
    sourceId: "src-test",
    findingId: "f1",
    status: "FOUND",
    searchTerms: ["user-email"],
    candidates: [],
    selectedContext: [],
    reason: "test",
  };
}

function plan(): ReproductionPlan {
  return {
    planId: "p1",
    findingId: "f1",
    pageUrl: "https://example.com/page",
    pagePath: "/page",
    initialConditions: [],
    actions: [{ seq: 0, action: "inspect", key: "", target: null, detail: "check" }],
    assertions: ["target holds"],
    axeRules: [],
  };
}

function proposal(): RepairProposal {
  return {
    proposalId: "prop-1",
    diagnosisId: "d1",
    summary: "Add a label.",
    rationale: "Addresses the failure.",
    evidenceIds: ["ev-01"],
    targetFiles: ["index.html"],
    edits: [
      {
        filePath: "index.html",
        originalText: '<input id="user-email">',
        replacementText: '<label for="user-email">Email</label><input id="user-email">',
        reason: "Labels the control.",
      },
    ],
    risks: [],
    verificationPlan: ["replay"],
  };
}

async function setupSource(): Promise<{ root: string; ws: string; runDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "a11y-repair-"));
  const ws = join(root, "repo");
  const runDir = join(root, "run");
  await mkdir(ws, { recursive: true });
  await writeFile(join(ws, "index.html"), '<input id="user-email">', "utf8");
  return { root, ws, runDir };
}

const PASS_HOOKS: ReplayHooks = {
  startApp: async () => ({ origin: "http://verify:1", stop: async () => undefined }),
  replayPlan: async () => ({ targetPassed: true, detail: "Target assertion passed." }),
  scanAffectedPage: async () => ["label"],
};

describe("generic repair verification", () => {
  it("rejects when anchors do not apply", async () => {
    const { root, ws, runDir } = await setupSource();
    try {
      const bad: RepairProposal = {
        ...proposal(),
        edits: [
          {
            filePath: "index.html",
            originalText: "<does-not-exist>",
            replacementText: "<x></x>",
            reason: "bad",
          },
        ],
      };
      const result = await runSourceRepairVerification({
        verificationId: "v1",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: bad,
        profile: PROFILE_BASE,
        trace: trace(),
        plan: plan(),
        axeBefore: [],
        runDir,
        hooks: PASS_HOOKS,
      });
      assert.equal(result.outcome, "REJECTED");
      assert.equal(result.verification.gates[0]?.status, "failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is UNVERIFIABLE when the app cannot be launched", async () => {
    const { root, ws, runDir } = await setupSource();
    try {
      const result = await runSourceRepairVerification({
        verificationId: "v1",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: proposal(),
        profile: PROFILE_BASE,
        trace: trace(),
        plan: plan(),
        axeBefore: [],
        runDir,
        hooks: {
          startApp: async () => {
            throw new Error("No start command observed.");
          },
          replayPlan: PASS_HOOKS.replayPlan,
        },
      });
      assert.equal(result.outcome, "UNVERIFIABLE");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("verifies only when the target failure itself passes", async () => {
    const { root, ws, runDir } = await setupSource();
    try {
      const verified = await runSourceRepairVerification({
        verificationId: "v1",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: proposal(),
        profile: { ...PROFILE_BASE, startCommand: { command: "serve", source: "user-supplied" } },
        trace: trace(),
        plan: plan(),
        axeBefore: ["label"],
        runDir,
        hooks: PASS_HOOKS,
      });
      assert.equal(verified.outcome, "VERIFIED");

      const failing = await runSourceRepairVerification({
        verificationId: "v2",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: proposal(),
        profile: { ...PROFILE_BASE, startCommand: { command: "serve", source: "user-supplied" } },
        trace: trace(),
        plan: plan(),
        axeBefore: ["label"],
        runDir,
        hooks: {
          ...PASS_HOOKS,
          replayPlan: async () => ({ targetPassed: false, detail: "Still failing." }),
        },
      });
      assert.equal(failing.outcome, "REJECTED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects on new axe regressions even when the target passes", async () => {
    const { root, ws, runDir } = await setupSource();
    try {
      const result = await runSourceRepairVerification({
        verificationId: "v1",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: proposal(),
        profile: { ...PROFILE_BASE, startCommand: { command: "serve", source: "user-supplied" } },
        trace: trace(),
        plan: plan(),
        axeBefore: [],
        runDir,
        hooks: {
          ...PASS_HOOKS,
          scanAffectedPage: async () => ["color-contrast"],
        },
      });
      assert.equal(result.outcome, "REJECTED");
      assert.deepEqual(result.verification.newSeriousOrCritical, ["color-contrast"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects path-traversal and ambiguous anchors in proposals", async () => {
    const { root, ws, runDir } = await setupSource();
    try {
      await writeFile(join(ws, "dup.html"), "<x></x><x></x>", "utf8");
      const traversal: RepairProposal = {
        ...proposal(),
        targetFiles: ["../outside.html"],
        edits: [
          {
            filePath: "../outside.html",
            originalText: "a",
            replacementText: "b",
            reason: "evil",
          },
        ],
      };
      const r1 = await runSourceRepairVerification({
        verificationId: "v1",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: traversal,
        profile: PROFILE_BASE,
        trace: trace(),
        plan: plan(),
        axeBefore: [],
        runDir,
        hooks: PASS_HOOKS,
      });
      assert.equal(r1.outcome, "REJECTED");

      const ambiguous: RepairProposal = {
        ...proposal(),
        targetFiles: ["dup.html"],
        edits: [
          { filePath: "dup.html", originalText: "<x></x>", replacementText: "<y></y>", reason: "amb" },
        ],
      };
      const r2 = await runSourceRepairVerification({
        verificationId: "v2",
        sourceId: "src-test",
        findingId: "f1",
        baseRevision: "abc",
        workspaceRoot: ws,
        proposal: ambiguous,
        profile: PROFILE_BASE,
        trace: trace(),
        plan: plan(),
        axeBefore: [],
        runDir,
        hooks: PASS_HOOKS,
      });
      assert.equal(r2.outcome, "REJECTED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
