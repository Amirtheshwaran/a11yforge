import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "./index.js";
import {
  findBundledDemoDir,
  resolveDataDir,
  resolveLiveRunsDir,
  resolveRunsDirWithSource,
} from "./runs.js";

/**
 * Phase 7 deployment tests: runtime data-directory behavior, recorded-demo
 * fallback, safe health payload, and missing-key live-run handling.
 * No model calls, no fixture servers, no browsers.
 */

const SAVED_ENV: Record<string, string | undefined> = {};

function saveEnv(...names: string[]): void {
  for (const name of names) SAVED_ENV[name] = process.env[name];
}

function restoreEnv(): void {
  for (const [name, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe("runtime directories", () => {
  before(() => saveEnv("A11YFORGE_DATA_DIR", "A11YFORGE_RUNS_DIR"));
  after(() => restoreEnv());

  it("honors A11YFORGE_RUNS_DIR over A11YFORGE_DATA_DIR for live writes", () => {
    process.env["A11YFORGE_DATA_DIR"] = join(tmpdir(), "data-dir-test");
    process.env["A11YFORGE_RUNS_DIR"] = join(tmpdir(), "runs-override-test");
    assert.equal(resolveDataDir(), join(tmpdir(), "data-dir-test"));
    assert.equal(resolveLiveRunsDir(), join(tmpdir(), "runs-override-test"));
  });

  it("derives live runs from the data dir when no override is set", () => {
    delete process.env["A11YFORGE_RUNS_DIR"];
    process.env["A11YFORGE_DATA_DIR"] = join(tmpdir(), "data-dir-test");
    assert.equal(
      resolveLiveRunsDir(),
      join(tmpdir(), "data-dir-test", ".a11yforge", "runs"),
    );
  });

  it("finds the committed recorded-demo bundle from the package tree", () => {
    assert.ok(findBundledDemoDir() !== null);
  });

  it("falls back to the bundled demo when the local runs dir is empty", async () => {
    const empty = await mkdtemp(join(tmpdir(), "api-empty-runs-"));
    try {
      delete process.env["A11YFORGE_DATA_DIR"];
      process.env["A11YFORGE_RUNS_DIR"] = empty;
      const { dir, source } = resolveRunsDirWithSource();
      assert.equal(source, "bundled-recorded");
      assert.equal(dir, findBundledDemoDir());
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("deployment health and degraded modes", () => {
  let emptyRuns = "";
  const savedKey = process.env["MODEL_API_KEY"];
  const savedRunsDir = process.env["A11YFORGE_RUNS_DIR"];
  const savedDataDir = process.env["A11YFORGE_DATA_DIR"];

  before(async () => {
    emptyRuns = await mkdtemp(join(tmpdir(), "api-health-runs-"));
  });

  after(async () => {
    if (savedKey === undefined) delete process.env["MODEL_API_KEY"];
    else process.env["MODEL_API_KEY"] = savedKey;
    if (savedRunsDir === undefined) delete process.env["A11YFORGE_RUNS_DIR"];
    else process.env["A11YFORGE_RUNS_DIR"] = savedRunsDir;
    if (savedDataDir === undefined) delete process.env["A11YFORGE_DATA_DIR"];
    else process.env["A11YFORGE_DATA_DIR"] = savedDataDir;
    await rm(emptyRuns, { recursive: true, force: true });
  });

  it("serves a safe health payload with no key and no local runs", async () => {
    delete process.env["MODEL_API_KEY"];
    delete process.env["A11YFORGE_DATA_DIR"];
    process.env["A11YFORGE_RUNS_DIR"] = emptyRuns;
    const app = buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      assert.equal(res.statusCode, 200);
      const body = res.json() as Record<string, unknown>;
      assert.equal(body["status"], "ok");
      assert.equal(body["service"], "a11yforge-api");
      assert.equal(typeof body["version"], "string");
      assert.equal(body["modelConfigured"], false);
      assert.equal(body["demoMode"], "bundled-recorded");
      assert.equal(typeof body["dataDirWritable"], "boolean");
      const serialized = JSON.stringify(body);
      assert.match(serialized, /"status":"ok"/);
      assert.doesNotMatch(serialized, /\/home\/|\/Users\/|MODEL_API_KEY=|Bearer /);
    } finally {
      await app.close();
    }
  });

  it("serves the recorded ACCEPTED demo with no key and no local runs", async () => {
    delete process.env["MODEL_API_KEY"];
    process.env["A11YFORGE_RUNS_DIR"] = emptyRuns;
    const app = buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/runs/demo" });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { finalStatus: string; runId: string };
      assert.equal(body.finalStatus, "ACCEPTED");
      assert.doesNotMatch(JSON.stringify(body), /\/home\/|\/Users\//);
    } finally {
      await app.close();
    }
  });

  it("refuses live starts without MODEL_API_KEY instead of crashing", async () => {
    delete process.env["MODEL_API_KEY"];
    process.env["A11YFORGE_RUNS_DIR"] = emptyRuns;
    const app = buildServer();
    try {
      const res = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(res.statusCode, 503);
      assert.match(res.json().error as string, /not configured/);
    } finally {
      await app.close();
    }
  });

  it("keeps the recorded demo and its artifacts available alongside scan-only and incomplete runs", async () => {
    process.env["A11YFORGE_RUNS_DIR"] = emptyRuns;
    await mkdir(join(emptyRuns, "exp-scan-only"), { recursive: true });
    await writeFile(join(emptyRuns, "exp-scan-only", "exploration.json"), "{}");
    await mkdir(join(emptyRuns, "incomplete-repair"), { recursive: true });
    await writeFile(join(emptyRuns, "incomplete-repair", "scenario.json"), "{}");
    const app = buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/runs/demo" });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { finalStatus: string; runId: string };
      assert.equal(body.finalStatus, "ACCEPTED");
      const listed = await app.inject({ method: "GET", url: "/runs" });
      assert.ok((listed.json() as { runs: { runId: string }[] }).runs.some((run) => run.runId === body.runId));
      for (const path of [
        `/runs/${body.runId}`,
        `/runs/${body.runId}/artifacts/focus-escaped.png`,
        `/runs/${body.runId}/artifacts/repair-diff.patch`,
      ]) {
        assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 200);
      }
    } finally {
      await app.close();
    }
  });

  it("rejects traversal and unknown artifacts without leaking paths", async () => {
    process.env["A11YFORGE_RUNS_DIR"] = emptyRuns;
    const app = buildServer();
    try {
      for (const url of [
        "/runs/..%2Fsecret/artifacts/scenario.json",
        "/runs/demo/artifacts/.env",
        "/runs/demo/artifacts/manifest.json",
      ]) {
        const res = await app.inject({ method: "GET", url });
        assert.equal(res.statusCode, 404);
        assert.doesNotMatch(res.body, /\/home\/|\/app\//);
      }
    } finally {
      await app.close();
    }
  });
});
