import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DemoBundleError,
  exportDemoRun,
  sanitizeJsonArtifact,
  sanitizeTextArtifact,
  validateDemoBundle,
} from "./bundle.js";
import { findWorkspaceRoot } from "../scanner/workspace.js";

/**
 * Phase 7 recorded-demo bundle tests: sanitization, fail-closed refusal,
 * and export → validate round-trip. Zero model calls; the only real
 * artifacts touched are the committed sanitized bundle (read) and temp
 * copies (written under os.tmpdir).
 */

describe("sanitizeJsonArtifact", () => {
  it("redacts provider request IDs to null and keeps token usage", () => {
    const { sanitized, redactions } = sanitizeJsonArtifact("model-usage.json", {
      model: "muse-spark-1.3-contributor",
      operation: "accessibility-diagnosis",
      inputTokens: 952,
      outputTokens: 880,
      requestId: "chatcmpl-abc123",
    });
    assert.equal(redactions, 1);
    assert.deepEqual(sanitized, {
      model: "muse-spark-1.3-contributor",
      operation: "accessibility-diagnosis",
      inputTokens: 952,
      outputTokens: 880,
      requestId: null,
    });
  });

  it("rewrites the machine-local source root to its repo-relative form", () => {
    const { sanitized } = sanitizeJsonArtifact("source-trace.json", {
      sourceRoot: "/home/someone/a11yforge/fixtures/broken-shop",
    });
    assert.deepEqual(sanitized, { sourceRoot: "fixtures/broken-shop" });
  });

  it("refuses banned keys", () => {
    assert.throws(
      () => sanitizeJsonArtifact("model-usage.json", { apiKey: "abc" }),
      DemoBundleError,
    );
  });

  it("refuses absolute filesystem paths", () => {
    assert.throws(
      () => sanitizeJsonArtifact("diagnosis.json", { note: "at /home/user/x" }),
      DemoBundleError,
    );
  });

  it("refuses authorization material and secret-like values", () => {
    assert.throws(
      () => sanitizeJsonArtifact("a.json", { h: "Bearer abcdef123456" }),
      DemoBundleError,
    );
    assert.throws(
      () => sanitizeJsonArtifact("a.json", { h: "MODEL_API_KEY=xyz" }),
      DemoBundleError,
    );
  });
});

describe("sanitizeTextArtifact", () => {
  it("accepts a clean unified diff and refuses secret text", () => {
    sanitizeTextArtifact("repair-diff.patch", "diff --git a/src/App.tsx\n+guard\n");
    assert.throws(
      () => sanitizeTextArtifact("repair-diff.patch", "Authorization: Bearer abcdef123456"),
      DemoBundleError,
    );
  });
});

describe("assertAcceptedRun refusals", () => {
  it("refuses a missing run directory", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "demo-missing-")), "nope");
    await assert.rejects(exportDemoRun({ runDir: dir, runId: "nope", outDir: dir }), DemoBundleError);
  });

  it("refuses an incomplete run directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-partial-"));
    try {
      await assert.rejects(
        exportDemoRun({ runDir: dir, runId: "partial", outDir: join(dir, "out") }),
        DemoBundleError,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("committed recorded-demo bundle", () => {
  const root = findWorkspaceRoot();
  const bundleDir = join(root, "demo", "accepted-run");

  it("validates the committed bundle end to end", async () => {
    const result = await validateDemoBundle(bundleDir);
    assert.equal(result.artifacts >= 20, true);
    assert.equal(result.screenshots >= 2, true);
  });

  it("round-trips: re-export from the committed bundle validates clean", async () => {
    const out = await mkdtemp(join(tmpdir(), "demo-roundtrip-"));
    try {
      const parsed = JSON.parse(
        await readFile(join(bundleDir, "manifest.json"), "utf8"),
      ) as { runId: string };
      const exported = await exportDemoRun({
        runDir: join(bundleDir, parsed.runId),
        runId: parsed.runId,
        outDir: join(out, "bundle"),
      });
      assert.equal(exported.mode, "recorded");
      assert.equal(exported.source, "real-a11yforge-run");
      const result = await validateDemoBundle(join(out, "bundle"));
      assert.equal(result.runId, parsed.runId);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it("round-trip source stays a copy: committed bundle untouched", async () => {
    // Guard against exporter path confusion — the committed run dir must
    // still hold the same artifact count after the round-trip above.
    const manifest = JSON.parse(
      await readFile(join(bundleDir, "manifest.json"), "utf8"),
    ) as { runId: string; artifacts: string[] };
    const onDisk = await readdir(join(bundleDir, manifest.runId));
    assert.equal(onDisk.length, manifest.artifacts.length);
  });
});
