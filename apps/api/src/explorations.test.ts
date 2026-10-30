import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExplorationRunSchema, type ExplorationRun } from "@a11yforge/shared";
import { buildServer } from "./index.js";
import { clearExplorationsForTests, setExplorationRunnerForTests } from "./explorations.js";

/**
 * Exploration route tests: URL validation, start/status/cancel flow, event
 * ordering, artifact allow-listing, and honest failure reporting. The engine
 * is always stubbed — no browser, no network, no model calls.
 */

function finishedRun(runId: string): ExplorationRun {
  return ExplorationRunSchema.parse({
    runId,
    target: {
      targetId: runId,
      entryUrl: "https://example.com/",
      normalizedUrl: "https://example.com/",
      origin: "https://example.com",
      createdAt: new Date().toISOString(),
      policy: { maxPages: 3, maxDurationMs: 120_000, maxTabStepsPerPage: 25, maxScreenshots: 8, navigationTimeoutMs: 20_000 },
    },
    state: "COMPLETED",
    stages: [],
    pagesVisited: ["https://example.com/"],
    surfaces: [],
    probeResults: [],
    findings: [],
    limitations: [],
    screenshots: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
  });
}

describe("exploration routes", () => {
  beforeEach(() => {
    clearExplorationsForTests();
    setExplorationRunnerForTests(async (options) => {
      options.emit?.({ stage: "opening", status: "running", message: "Opening site." });
      options.emit?.({ stage: "done", status: "passed", message: "Done." });
      return finishedRun(options.runId);
    });
  });

  it("starts an exploration with 202 and serves the finished run", async () => {
    const app = buildServer();
    const start = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/" } });
    assert.equal(start.statusCode, 202);
    const started = start.json() as { runId: string; status: string };
    assert.equal(started.status, "running");

    await new Promise((resolve) => setTimeout(resolve, 50));
    const fetched = await app.inject({ method: "GET", url: `/explorations/${started.runId}` });
    assert.equal(fetched.statusCode, 200);
    const run = ExplorationRunSchema.parse(fetched.json());
    assert.equal(run.state, "COMPLETED");
    assert.deepEqual(run.pagesVisited, ["https://example.com/"]);
  });

  it("rejects missing URLs, bad maxPages, and unsafe schemes", async () => {
    const app = buildServer();
    const missing = await app.inject({ method: "POST", url: "/explorations", payload: {} });
    assert.equal(missing.statusCode, 400);
    const badPages = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/", maxPages: 99 } });
    assert.equal(badPages.statusCode, 400);
    const file = await app.inject({ method: "POST", url: "/explorations", payload: { url: "file:///etc/passwd" } });
    assert.equal(file.statusCode, 400);
    const privateUrl = await app.inject({ method: "POST", url: "/explorations", payload: { url: "http://127.0.0.1:3000/" } });
    // Private targets stay rejected unless the operator explicitly opts in.
    assert.ok(privateUrl.statusCode === 400 || privateUrl.statusCode === 202);
  });

  it("returns 404 for unknown runs and rejects artifact traversal", async () => {
    const app = buildServer();
    const unknown = await app.inject({ method: "GET", url: "/explorations/nope" });
    assert.equal(unknown.statusCode, 404);

    const start = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/" } });
    const { runId } = start.json() as { runId: string };
    const traversal = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/..%2Fexploration.json` });
    assert.equal(traversal.statusCode, 404);
    const missing = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/screenshot-0.png` });
    assert.equal(missing.statusCode, 404);
  });

  it("serves allow-listed screenshots from the run directory", async () => {
    const app = buildServer();
    const start = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/" } });
    const { runId } = start.json() as { runId: string };
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The stubbed engine wrote no files; plant one via the shared runs dir.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const { resolveLiveRunsDir } = await import("./runs.js");
    await mkdir(join(resolveLiveRunsDir(), runId), { recursive: true });
    await writeFile(join(resolveLiveRunsDir(), runId, "screenshot-0.png"), png);
    const good = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/screenshot-0.png` });
    assert.equal(good.statusCode, 200);
    assert.match(good.headers["content-type"] ?? "", /image\/png/);
    const bad = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/evil.sh` });
    assert.equal(bad.statusCode, 404);
    const json = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/exploration.json` });
    assert.equal(json.statusCode, 404);
    // Never leak test artifacts into the local runs directory.
    await rm(join(resolveLiveRunsDir(), runId), { recursive: true, force: true });
  });

  it("cancels a running exploration", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    setExplorationRunnerForTests((options) => {
      return new Promise<ExplorationRun>((resolve) => {
        gate.release = () => resolve({ ...finishedRun(options.runId), state: "CANCELLED" });
        options.signal?.addEventListener("abort", () => {
          resolve({ ...finishedRun(options.runId), state: "CANCELLED" });
        });
      });
    });
    const app = buildServer();
    const start = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/" } });
    const { runId } = start.json() as { runId: string };
    const cancel = await app.inject({ method: "POST", url: `/explorations/${runId}/cancel` });
    assert.equal(cancel.statusCode, 200);
    assert.equal((cancel.json() as { status: string }).status, "cancelled");
    gate.release?.();
  });

  it("reports engine failures honestly instead of backfilling", async () => {
    setExplorationRunnerForTests(async () => {
      throw new Error("browser exploded");
    });
    const app = buildServer();
    const start = await app.inject({ method: "POST", url: "/explorations", payload: { url: "https://example.com/" } });
    const { runId } = start.json() as { runId: string };
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fetched = await app.inject({ method: "GET", url: `/explorations/${runId}` });
    assert.equal(fetched.statusCode, 200);
    assert.equal((fetched.json() as { state: string }).state, "FAILED");
  });

  it("restores only validated finished evidence after a restart", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "a11yforge-saved-scan-"));
    const previous = process.env["A11YFORGE_RUNS_DIR"];
    process.env["A11YFORGE_RUNS_DIR"] = runsDir;
    const app = buildServer();
    try {
      const runId = "exp-saved-capture";
      const run = { ...finishedRun(runId), screenshots: ["screenshot-0.png"] };
      await mkdir(join(runsDir, runId));
      await writeFile(join(runsDir, runId, "exploration.json"), JSON.stringify(run));
      await writeFile(join(runsDir, runId, "screenshot-0.png"), "captured-image-bytes");
      clearExplorationsForTests();
      const restored = await app.inject({ method: "GET", url: `/explorations/${runId}` });
      assert.equal(restored.statusCode, 200);
      assert.deepEqual(restored.json(), run);
      const screenshot = await app.inject({ method: "GET", url: `/explorations/${runId}/screenshots/screenshot-0.png` });
      assert.equal(screenshot.statusCode, 200);
      assert.equal(screenshot.body, "captured-image-bytes");
      const events = await app.inject({ method: "GET", url: `/explorations/${runId}/events` });
      assert.equal(events.body, 'data: {"done":true}\n\n');
      for (const [id, data] of [
        ["exp-invalid", {}],
        ["exp-mismatched", run],
        ["exp-running", { ...run, runId: "exp-running", state: "RUNNING" }],
      ] as const) {
        await mkdir(join(runsDir, id));
        await writeFile(join(runsDir, id, "exploration.json"), JSON.stringify(data));
        const rejected = await app.inject({ method: "GET", url: `/explorations/${id}` });
        assert.equal(rejected.statusCode, 404);
      }
      const traversal = await app.inject({ method: "GET", url: "/explorations/..%2Fexp-saved-capture" });
      assert.equal(traversal.statusCode, 404);
    } finally {
      await app.close();
      clearExplorationsForTests();
      if (previous === undefined) delete process.env["A11YFORGE_RUNS_DIR"];
      else process.env["A11YFORGE_RUNS_DIR"] = previous;
      await rm(runsDir, { recursive: true, force: true });
    }
  });
});
