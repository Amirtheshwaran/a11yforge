import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "./index.js";

/**
 * API read-model route tests: run listing, demo selection, view serving,
 * artifact allow-listing, and missing-artifact empty states. No model
 * calls, no fixture servers — artifacts are synthesized in a temp dir and
 * A11YFORGE_RUNS_DIR points the API at it.
 */

const RUN_ID = "2026-10-26T17-40-55-727Z-7c0d4f";

function observation(seq: number, selector: string, insideModal: boolean) {
  return {
    seq,
    action: seq === 0 ? "modal-open" : "press",
    key: seq === 0 ? null : "Tab",
    timestamp: "2026-10-26T17:40:56.471Z",
    pageUrl: "http://127.0.0.1:3002/",
    selector,
    tagName: "button",
    role: "button",
    accessibleName: selector,
    text: selector,
    tabIndex: 0,
    disabled: false,
    ariaHidden: false,
    insideModal,
  };
}

describe("run routes", () => {
  let runsDir = "";
  let app: ReturnType<typeof buildServer>;
  const previousRunsDir = process.env["A11YFORGE_RUNS_DIR"];

  before(async () => {
    runsDir = await mkdtemp(join(tmpdir(), "api-runs-"));
    const dir = join(runsDir, RUN_ID);
    await mkdir(dir, { recursive: true });
    const files: Record<string, unknown> = {
      "scenario.json": {
        runId: RUN_ID,
        scenarioId: "checkout-modal-keyboard",
        targetUrl: "http://127.0.0.1:3002",
        startedAt: "2026-10-26T17:40:56.287Z",
        completedAt: "2026-10-26T17:40:56.527Z",
        observations: [
          observation(0, "#checkout-modal-close", true),
          observation(1, "#checkout-modal-email", true),
          observation(2, "#checkout-modal-continue", true),
          observation(3, "#background-control", false),
        ],
        assertions: [
          {
            assertion: "focus-contained-in-modal",
            passed: false,
            step: 3,
            pressedKey: "Tab",
            expectedRegion: "#checkout-modal",
            actualFocus: "#background-control",
            actualHtml: "<a id=\"background-control\">x</a>",
          },
        ],
        screenshots: [],
        events: [],
      },
      "diagnosis.json": {
        diagnosisId: "diag-1",
        issueType: "focus-containment",
        title: "Focus escapes open checkout modal",
        summary: "Focus escaped the open modal.",
        severity: "serious",
        confidence: 0.95,
        affectedStrategies: ["keyboard-navigation"],
        evidenceIds: ["ev-modal-open", "ev-assertion-failed"],
        observedFailure: "Tab moved focus outside the open modal.",
        likelyCause: "No focus trap in the dialog.",
        recommendedRepairStrategy: "Cycle Tab within the dialog.",
        relevantWcagCriteria: ["2.4.3 Focus Order"],
        needsSourceContext: true,
      },
      "source-trace.json": {
        traceId: "trace-1",
        diagnosisId: "diag-1",
        sourceRoot: "/home/user/work/a11yforge/fixtures/broken-shop",
        searchTerms: ["checkout-modal"],
        candidates: [
          {
            filePath: "src/App.tsx",
            score: 915,
            matchedTerms: ["checkout-modal"],
            matchCount: 23,
            snippets: [],
          },
        ],
        selectedContext: [
          {
            filePath: "src/App.tsx",
            startLine: 117,
            endLine: 187,
            content: "snippet",
            matchedTerms: ["checkout-modal"],
          },
        ],
      },
      "repair-proposal.json": {
        proposalId: "prop-001",
        diagnosisId: "diag-1",
        summary: "Add focus-trap key handler.",
        rationale: "Wrap Tab within the dialog.",
        evidenceIds: ["ev-modal-open"],
        targetFiles: ["src/App.tsx"],
        edits: [
          {
            filePath: "src/App.tsx",
            originalText: "anchor",
            replacementText: "anchor+handler",
            reason: "wrap",
          },
        ],
        risks: [],
        verificationPlan: ["replay"],
      },
      "repair-lifecycle.json": {
        repairId: "repair-001",
        proposalId: "prop-001",
        state: "ACCEPTED",
        transitions: [],
      },
      "repair-verification.json": {
        repairId: "repair-001",
        proposalId: "prop-001",
        buildPassed: true,
        buildCommand: "vite build",
        buildExitCode: 0,
        buildDurationMs: 500,
        originalAssertion: { passed: false, actualFocus: "#background-control" },
        repairedAssertion: { passed: true, actualFocus: "#checkout-modal-email" },
        scenarioPassed: true,
        baselineAxeRules: ["button-name"],
        repairedAxeRules: ["button-name"],
        newAxeViolations: [],
        removedBaselineRules: [],
        newSeriousCritical: [],
        resolvedTargetFailure: true,
        regressions: [],
        diffArtifact: "repair-diff.patch",
        evidenceArtifacts: [],
        decisionBasis: "deterministic gate passed: typecheck clean, build passed",
      },
      "critic-decision.json": {
        decision: "ACCEPT",
        confidence: 0.82,
        summary: "After focus is inside the modal.",
        evidenceIds: ["ev-assertion-failed"],
        verificationConcerns: [],
        remainingRisks: ["Escape path not tested"],
      },
    };
    for (const [name, value] of Object.entries(files)) {
      await writeFile(join(dir, name), JSON.stringify(value));
    }
    await writeFile(join(dir, "focus-escaped.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const incomplete = join(runsDir, "2026-10-26T18-00-00-000Z-eeeeee");
    await mkdir(incomplete, { recursive: true });
    await writeFile(
      join(incomplete, "scenario.json"),
      JSON.stringify((files["scenario.json"] as Record<string, unknown>)),
    );
    process.env["A11YFORGE_RUNS_DIR"] = runsDir;
    app = buildServer();
  });

  after(async () => {
    await app.close();
    if (previousRunsDir === undefined) delete process.env["A11YFORGE_RUNS_DIR"];
    else process.env["A11YFORGE_RUNS_DIR"] = previousRunsDir;
    await rm(runsDir, { recursive: true, force: true });
  });

  it("lists runs newest-first", async () => {
    const res = await app.inject({ method: "GET", url: "/runs" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { runs: { runId: string }[] };
    assert.equal(body.runs.length, 2);
    assert.equal(body.runs[0]?.runId, "2026-10-26T18-00-00-000Z-eeeeee");
  });

  it("serves the accepted demo run without absolute paths", async () => {
    const res = await app.inject({ method: "GET", url: "/runs/demo" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body["runId"], RUN_ID);
    assert.equal(body["finalStatus"], "ACCEPTED");
    assert.ok(!JSON.stringify(body).includes("/home/user"));
    assert.ok(!JSON.stringify(body).toLowerCase().includes("model_api_key"));
  });

  it("serves a single run view and rejects unknown runs", async () => {
    const ok = await app.inject({ method: "GET", url: `/runs/${RUN_ID}` });
    assert.equal(ok.statusCode, 200);
    const missing = await app.inject({ method: "GET", url: "/runs/no-such-run" });
    assert.equal(missing.statusCode, 404);
  });

  it("reports incomplete runs as missing instead of inventing data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/runs/2026-10-26T18-00-00-000Z-eeeeee",
    });
    assert.equal(res.statusCode, 404);
    assert.match((res.json() as { error: string }).error, /incomplete/);
  });

  it("serves allow-listed artifacts with strict content types", async () => {
    const png = await app.inject({
      method: "GET",
      url: `/runs/${RUN_ID}/artifacts/focus-escaped.png`,
    });
    assert.equal(png.statusCode, 200);
    assert.match(png.headers["content-type"] ?? "", /image\/png/);
  });

  it("refuses traversal, secrets, and unknown artifacts", async () => {
    for (const name of [
      "..%2Fscenario.json",
      ".env",
      "MODEL_API_KEY.json",
      "repair-diff.patch.exe",
      "nope.png",
    ]) {
      const res = await app.inject({
        method: "GET",
        url: `/runs/${RUN_ID}/artifacts/${name}`,
      });
      assert.equal(res.statusCode, 404, name);
    }
    const badRun = await app.inject({
      method: "GET",
      url: "/runs/..%2Fsecret/artifacts/scenario.json",
    });
    assert.equal(badRun.statusCode, 404);
  });
});
