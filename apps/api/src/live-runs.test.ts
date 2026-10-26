import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LiveRunEventSchema,
  LiveRunStatusSchema,
  containsNoSecrets,
  type LiveRunEvent,
  type LiveRunEventType,
  type LiveRunStage,
} from "@a11yforge/shared";
import { buildServer } from "./index.js";
import {
  clearLiveRunRegistryForTests,
  type PipelineRunner,
} from "./live-runs.js";

/**
 * Live-run orchestration route tests: start, duplicate prevention,
 * status projection, SSE replay ordering, failure handling, missing-key
 * behavior, artifact allow-listing, and secret/path redaction. The
 * pipeline is always a mock — no browser, no fixture, no live inference.
 */

function scriptedEvent(
  runId: string,
  type: LiveRunEventType,
  stage: LiveRunStage,
  message: string,
  metadata: Record<string, unknown> = {},
): LiveRunEvent {
  return {
    eventId: "",
    runId,
    sequence: -1,
    timestamp: new Date().toISOString(),
    type,
    stage,
    status: type.endsWith("-failed") ? "failed" : type.endsWith("-started") ? "started" : "completed",
    message,
    metadata,
  };
}

function acceptedRunner(seen: string[]): PipelineRunner {
  return async (runId, _runsDir, emit) => {
    seen.push(runId);
    const script: [LiveRunEventType, LiveRunStage, string][] = [
      ["run-started", "run", "Autonomous repair run started."],
      ["scanner-started", "scan", "Scanning."],
      ["scanner-completed", "scan", "Axe scan found 1 finding across 1 rule."],
      ["keyboard-test-started", "keyboard", "Replaying scenario."],
      ["focus-escape-detected", "keyboard", "Focus escaped to #background-control."],
      ["keyboard-test-completed", "keyboard", "Evidence recorded."],
      ["diagnosis-started", "diagnosis", "Diagnosing."],
      ["diagnosis-completed", "diagnosis", "Diagnosed: focus escapes modal."],
      ["source-trace-started", "trace", "Tracing."],
      ["source-candidate-selected", "trace", "Top candidate src/App.tsx."],
      ["repair-proposal-started", "proposal", "Proposing."],
      ["repair-proposal-completed", "proposal", "Proposal targets src/App.tsx."],
      ["repair-applied", "verify-attempt-1", "Attempt 1 applied."],
      ["typecheck-started", "verify-attempt-1", "Typechecking."],
      ["typecheck-passed", "verify-attempt-1", "Typecheck clean."],
      ["build-passed", "verify-attempt-1", "Build passed."],
      ["replay-passed", "verify-attempt-1", "Replay flips to passing."],
      ["axe-regression-passed", "verify-attempt-1", "Baseline preserved."],
      ["critic-started", "critic", "Critic requested."],
      ["critic-completed", "critic", "Critic verdict recorded."],
      ["repair-accepted", "decision", "Repair ACCEPTED."],
      ["run-completed", "run", "Run finished: ACCEPTED after 3 Meta calls."],
    ];
    for (const [type, stage, message] of script) {
      emit(scriptedEvent(runId, type, stage, message));
    }
    return {
      runId,
      runDir: join(_runsDir, runId),
      finalState: "ACCEPTED",
      revised: false,
      usage: {
        calls: 3,
        inputTokens: 300,
        outputTokens: 150,
        reasoningTokens: 600,
        operations: [],
      },
      modelCalls: 3,
    };
  };
}

async function waitForSettled(
  app: ReturnType<typeof buildServer>,
  runId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const res = await app.inject({ method: "GET", url: `/runs/${runId}/status` });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    if (body["state"] !== "RUNNING") return body;
    if (Date.now() > deadline) throw new Error("run did not settle in time");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("live run routes", () => {
  let runsDir = "";
  const previousRunsDir = process.env["A11YFORGE_RUNS_DIR"];
  const previousKey = process.env["MODEL_API_KEY"];

  before(async () => {
    runsDir = await mkdtemp(join(tmpdir(), "api-live-"));
    process.env["A11YFORGE_RUNS_DIR"] = runsDir;
    process.env["MODEL_API_KEY"] = "test-placeholder-key";
  });

  after(async () => {
    if (previousRunsDir === undefined) delete process.env["A11YFORGE_RUNS_DIR"];
    else process.env["A11YFORGE_RUNS_DIR"] = previousRunsDir;
    if (previousKey === undefined) delete process.env["MODEL_API_KEY"];
    else process.env["MODEL_API_KEY"] = previousKey;
    await rm(runsDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearLiveRunRegistryForTests();
  });

  it("starts a run and settles to COMPLETED with ordered valid events", async () => {
    const seen: string[] = [];
    const app = buildServer({ runner: acceptedRunner(seen) });
    try {
      const started = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(started.statusCode, 202);
      const { runId } = started.json() as { runId: string; status: string };
      assert.ok(typeof runId === "string" && runId.length > 0);

      const final = await waitForSettled(app, runId);
      assert.equal(final["state"], "COMPLETED");
      assert.equal(final["finalState"], "ACCEPTED");

      const eventsRes = await app.inject({ method: "GET", url: `/runs/${runId}/events` });
      assert.equal(eventsRes.statusCode, 200);
      assert.match(eventsRes.headers["content-type"] ?? "", /text\/event-stream/);
      const blocks = eventsRes.body.split("\n\n").filter((b) => b.includes("data:"));
      assert.ok(blocks.length >= 20);
      const parsed = blocks.map((b) => {
        const line = b.split("\n").find((l) => l.startsWith("data:")) ?? "";
        return LiveRunEventSchema.parse(JSON.parse(line.slice(5).trim()) as unknown);
      });
      for (let i = 0; i < parsed.length; i += 1) {
        assert.equal(parsed[i]?.sequence, i);
        assert.equal(parsed[i]?.runId, runId);
      }
      assert.equal(parsed[0]?.type, "run-started");
      assert.equal(parsed[parsed.length - 1]?.type, "run-completed");
      assert.ok(containsNoSecrets(eventsRes.body));

      const status = LiveRunStatusSchema.parse(final);
      assert.equal(status.eventCount, parsed.length);
      assert.ok(status.stages.some((s) => s.id === "scan" && s.state === "passed"));
    } finally {
      await app.close();
    }
  });

  it("rejects a duplicate start while a run is active", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: PipelineRunner = async (runId, runsDirArg, emit) => {
      emit(scriptedEvent(runId, "run-started", "run", "Started."));
      await gate;
      emit(scriptedEvent(runId, "run-completed", "run", "Done."));
      return {
        runId,
        runDir: join(runsDirArg, runId),
        finalState: "ACCEPTED",
        revised: false,
        usage: { calls: 0, inputTokens: null, outputTokens: null, reasoningTokens: null, operations: [] },
        modelCalls: 0,
      };
    };
    const app = buildServer({ runner });
    try {
      const first = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(first.statusCode, 202);
      const { runId } = first.json() as { runId: string };
      const second = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(second.statusCode, 409);
      const body = second.json() as { error: string; runId: string };
      assert.equal(body.runId, runId);
      assert.match(body.error, /already in progress/);
      release();
      const final = await waitForSettled(app, runId);
      assert.equal(final["state"], "COMPLETED");
    } finally {
      await app.close();
    }
  });

  it("records run failure without hanging when the pipeline throws", async () => {
    const runner: PipelineRunner = async () => {
      throw new Error("mock verifier exploded");
    };
    const app = buildServer({ runner });
    try {
      const started = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(started.statusCode, 202);
      const { runId } = started.json() as { runId: string };
      const final = await waitForSettled(app, runId);
      assert.equal(final["state"], "FAILED");
      assert.match(String(final["error"]), /mock verifier exploded/);
      const eventsRes = await app.inject({ method: "GET", url: `/runs/${runId}/events` });
      assert.ok(eventsRes.body.includes("run-failed"));
    } finally {
      await app.close();
    }
  });

  it("refuses to start when MODEL_API_KEY is missing", async () => {
    const app = buildServer({ runner: acceptedRunner([]) });
    try {
      delete process.env["MODEL_API_KEY"];
      const res = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(res.statusCode, 503);
      assert.match((res.json() as { error: string }).error, /not configured/);
    } finally {
      process.env["MODEL_API_KEY"] = "test-placeholder-key";
      await app.close();
    }
  });

  it("projects active-run status and allow-lists artifacts mid-run", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: PipelineRunner = async (runId, runsDirArg, emit) => {
      emit(scriptedEvent(runId, "run-started", "run", "Started."));
      emit(scriptedEvent(runId, "scanner-started", "scan", "Scanning."));
      await mkdir(join(runsDirArg, runId), { recursive: true });
      await writeFile(join(runsDirArg, runId, "scan.json"), "{}");
      await writeFile(join(runsDirArg, runId, "MODEL_API_KEY.json"), "{}");
      await gate;
      emit(scriptedEvent(runId, "run-completed", "run", "Done."));
      return {
        runId,
        runDir: join(runsDirArg, runId),
        finalState: "ACCEPTED",
        revised: false,
        usage: { calls: 0, inputTokens: null, outputTokens: null, reasoningTokens: null, operations: [] },
        modelCalls: 0,
      };
    };
    const app = buildServer({ runner });
    try {
      const started = await app.inject({ method: "POST", url: "/runs" });
      const { runId } = started.json() as { runId: string };
      const mid = await app.inject({ method: "GET", url: `/runs/${runId}/status` });
      assert.equal(mid.statusCode, 200);
      const status = LiveRunStatusSchema.parse(mid.json());
      assert.equal(status.state, "RUNNING");
      assert.ok(status.stages.some((s) => s.id === "scan" && s.state === "running"));
      assert.ok(status.artifacts.includes("scan.json"));
      assert.ok(!status.artifacts.some((a) => /key/i.test(a)));
      release();
      await waitForSettled(app, runId);
    } finally {
      await app.close();
    }
  });

  it("redacts secrets and absolute paths from live event payloads", async () => {
    const runner: PipelineRunner = async (runId, runsDirArg, emit) => {
      emit(
        scriptedEvent(runId, "run-started", "run", "Started.", {
          MODEL_API_KEY: "sk-live-secret-value",
          nested: { authorization: "Bearer abc123" },
          file: "/home/judge/work/a11yforge/fixtures/broken-shop/src/App.tsx",
          big: "y".repeat(5000),
        }),
      );
      emit(scriptedEvent(runId, "run-completed", "run", "Done."));
      return {
        runId,
        runDir: join(runsDirArg, runId),
        finalState: "ACCEPTED",
        revised: false,
        usage: { calls: 0, inputTokens: null, outputTokens: null, reasoningTokens: null, operations: [] },
        modelCalls: 0,
      };
    };
    const app = buildServer({ runner });
    try {
      const started = await app.inject({ method: "POST", url: "/runs" });
      const { runId } = started.json() as { runId: string };
      await waitForSettled(app, runId);
      const eventsRes = await app.inject({ method: "GET", url: `/runs/${runId}/events` });
      assert.ok(!eventsRes.body.includes("sk-live-secret-value"));
      assert.ok(!eventsRes.body.includes("Bearer abc123"));
      assert.ok(!eventsRes.body.includes("/home/judge"));
      assert.ok(eventsRes.body.includes("fixtures/broken-shop/src/App.tsx"));
      assert.ok(containsNoSecrets(eventsRes.body));
      const statusRes = await app.inject({ method: "GET", url: `/runs/${runId}/status` });
      assert.ok(containsNoSecrets(statusRes.body));
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown live runs", async () => {
    const app = buildServer({ runner: acceptedRunner([]) });
    try {
      assert.equal((await app.inject({ method: "GET", url: "/runs/nope/status" })).statusCode, 404);
      assert.equal((await app.inject({ method: "GET", url: "/runs/nope/events" })).statusCode, 404);
    } finally {
      await app.close();
    }
  });
});
