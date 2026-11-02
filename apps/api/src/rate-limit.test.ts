import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "./index.js";
import { clearLiveRunRegistryForTests, type PipelineRunner } from "./live-runs.js";
import {
  DailyCap,
  FixedWindowLimiter,
  createApiLimits,
  passcodeMatches,
  readLimit,
} from "./rate-limit.js";

/**
 * Abuse-protection tests: limiter windows, the daily paid-run cap, the
 * optional run passcode, proxy-aware client keys, and health reporting.
 * The pipeline is always a mock — no browser and no live inference.
 */

function clock(start: number): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

const quickRunner: PipelineRunner = async (runId, runsDir) => ({
  runId,
  runDir: join(runsDir, runId),
  finalState: "ACCEPTED",
  revised: false,
  usage: { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, operations: [] },
  modelCalls: 0,
});

describe("FixedWindowLimiter", () => {
  it("allows up to the limit, refuses with a retry hint, then resets", () => {
    const c = clock(1_000_000);
    const limiter = new FixedWindowLimiter(2, 60_000, c.now);
    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("a").allowed, true);
    const refused = limiter.hit("a");
    assert.equal(refused.allowed, false);
    assert.equal(refused.retryAfterSeconds, 60);
    assert.equal(limiter.hit("b").allowed, true, "clients are counted separately");
    c.advance(60_000);
    assert.equal(limiter.hit("a").allowed, true);
  });

  it("refuses everything when the limit is zero", () => {
    assert.equal(new FixedWindowLimiter(0, 1000).hit("a").allowed, false);
  });
});

describe("DailyCap", () => {
  it("caps per UTC day, releases unused units, and resets at midnight", () => {
    const c = clock(Date.parse("2026-11-02T23:59:00Z"));
    const cap = new DailyCap(2, c.now);
    assert.equal(cap.take(), true);
    assert.equal(cap.take(), true);
    assert.equal(cap.take(), false);
    assert.equal(cap.secondsUntilReset(), 60);
    cap.release();
    assert.equal(cap.remaining, 1);
    c.advance(60_000);
    assert.equal(cap.remaining, 2);
  });
});

describe("settings", () => {
  it("reads non-negative integers and falls back on invalid values", () => {
    assert.equal(readLimit({ X: "5" }, "X", 1), 5);
    assert.equal(readLimit({ X: "0" }, "X", 1), 0);
    assert.equal(readLimit({ X: "-1" }, "X", 1), 1);
    assert.equal(readLimit({ X: "abc" }, "X", 1), 1);
    assert.equal(readLimit({}, "X", 1), 1);
  });

  it("compares passcodes exactly", () => {
    assert.equal(passcodeMatches("open sesame", "open sesame"), true);
    assert.equal(passcodeMatches("open sesam", "open sesame"), false);
    assert.equal(passcodeMatches("", "open sesame"), false);
  });
});

describe("POST /runs guards", () => {
  let runsDir = "";
  const saved: Record<string, string | undefined> = {};
  const keys = ["A11YFORGE_RUNS_DIR", "MODEL_API_KEY", "A11YFORGE_RUN_PASSCODE"];

  before(async () => {
    for (const k of keys) saved[k] = process.env[k];
    runsDir = await mkdtemp(join(tmpdir(), "api-limits-"));
    process.env["A11YFORGE_RUNS_DIR"] = runsDir;
    process.env["MODEL_API_KEY"] = "test-placeholder-key";
  });

  after(async () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await rm(runsDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearLiveRunRegistryForTests();
    delete process.env["A11YFORGE_RUN_PASSCODE"];
  });

  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 20));
    clearLiveRunRegistryForTests();
  }

  it("requires the passcode when one is configured", async () => {
    process.env["A11YFORGE_RUN_PASSCODE"] = "demo-passcode";
    const app = buildServer({ runner: quickRunner, logger: false });
    try {
      const missing = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(missing.statusCode, 401);
      assert.equal((missing.json() as { passcodeRequired: boolean }).passcodeRequired, true);
      const wrong = await app.inject({
        method: "POST",
        url: "/runs",
        headers: { "x-a11yforge-passcode": "nope" },
      });
      assert.equal(wrong.statusCode, 401);
      const right = await app.inject({
        method: "POST",
        url: "/runs",
        headers: { "x-a11yforge-passcode": "demo-passcode" },
      });
      assert.equal(right.statusCode, 202);
      const health = await app.inject({ method: "GET", url: "/health" });
      assert.equal((health.json() as { runPasscodeRequired: boolean }).runPasscodeRequired, true);
    } finally {
      await app.close();
    }
  });

  it("limits runs per client and does not count refused attempts", async () => {
    const limits = createApiLimits({
      A11YFORGE_RUNS_PER_HOUR_PER_CLIENT: "1",
      A11YFORGE_MAX_RUNS_PER_DAY: "10",
    });
    const app = buildServer({ runner: quickRunner, limits, logger: false });
    try {
      process.env["A11YFORGE_RUN_PASSCODE"] = "demo-passcode";
      const denied = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(denied.statusCode, 401);
      delete process.env["A11YFORGE_RUN_PASSCODE"];

      const first = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(first.statusCode, 202, "a refused passcode must not use the allowance");
      await settle();
      const second = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(second.statusCode, 429);
      assert.ok(Number(second.headers["retry-after"]) > 0);
    } finally {
      await app.close();
    }
  });

  it("keys clients by the forwarded address from the trusted proxy", async () => {
    const limits = createApiLimits({ A11YFORGE_RUNS_PER_HOUR_PER_CLIENT: "1" });
    const app = buildServer({ runner: quickRunner, limits, logger: false });
    try {
      const a = await app.inject({
        method: "POST",
        url: "/runs",
        headers: { "x-forwarded-for": "203.0.113.7" },
      });
      assert.equal(a.statusCode, 202);
      await settle();
      const b = await app.inject({
        method: "POST",
        url: "/runs",
        headers: { "x-forwarded-for": "203.0.113.8" },
      });
      assert.equal(b.statusCode, 202, "a different client has its own allowance");
      await settle();
      const spoofed = await app.inject({
        method: "POST",
        url: "/runs",
        headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.7" },
      });
      assert.equal(spoofed.statusCode, 429, "a forged leading address must not reset the limit");
    } finally {
      await app.close();
    }
  });

  it("enforces the global daily cap and reports what remains", async () => {
    const limits = createApiLimits({
      A11YFORGE_RUNS_PER_HOUR_PER_CLIENT: "10",
      A11YFORGE_MAX_RUNS_PER_DAY: "1",
    });
    const app = buildServer({ runner: quickRunner, limits, logger: false });
    try {
      const before = await app.inject({ method: "GET", url: "/health" });
      assert.equal((before.json() as { runsRemainingToday: number }).runsRemainingToday, 1);
      assert.equal((await app.inject({ method: "POST", url: "/runs" })).statusCode, 202);
      await settle();
      const capped = await app.inject({ method: "POST", url: "/runs" });
      assert.equal(capped.statusCode, 429);
      assert.match((capped.json() as { error: string }).error, /budget/);
      const afterHealth = await app.inject({ method: "GET", url: "/health" });
      assert.equal((afterHealth.json() as { runsRemainingToday: number }).runsRemainingToday, 0);
    } finally {
      await app.close();
    }
  });
});

describe("POST /explorations per-client limit", () => {
  it("refuses a client over its hourly scan allowance before any target lookup", async () => {
    const limits = createApiLimits({ A11YFORGE_SCANS_PER_HOUR_PER_CLIENT: "0" });
    const app = buildServer({ limits, logger: false });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/explorations",
        payload: { url: "https://example.com" },
      });
      assert.equal(res.statusCode, 429);
      assert.ok(Number(res.headers["retry-after"]) > 0);
    } finally {
      await app.close();
    }
  });
});
