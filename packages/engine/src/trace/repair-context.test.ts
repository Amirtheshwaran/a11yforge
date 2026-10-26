import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RepairContextBundleSchema,
  type AccessibilityDiagnosis,
  type EvidenceBundle,
} from "@a11yforge/shared";
import { buildRepairContextBundle } from "./repair-context.js";
import type { SourceTraceResult } from "./trace.js";

const DIAGNOSIS: AccessibilityDiagnosis = {
  diagnosisId: "diag-ctx-1",
  issueType: "focus-containment",
  title: "Focus escapes open checkout modal",
  summary: "Keyboard focus leaves the open checkout modal.",
  severity: "serious",
  confidence: 0.9,
  affectedStrategies: ["keyboard-navigation"],
  evidenceIds: ["ev-modal-open", "ev-focus-escape"],
  observedFailure:
    "While #checkout-modal remained open, Tab moved focus to #background-control outside the modal.",
  likelyCause: "The active modal does not constrain keyboard focus.",
  recommendedRepairStrategy:
    "Implement focus containment while the modal is active.",
  relevantWcagCriteria: ["2.4.3"],
  needsSourceContext: true,
};

const BUNDLE: EvidenceBundle = {
  bundleId: "bundle-ctx-1",
  scenarioId: "checkout-modal-keyboard",
  targetUrl: "http://127.0.0.1:3002",
  assertion: "focus-contained-in-modal",
  expectedRegion: "#checkout-modal",
  failedStep: 3,
  failingKey: "Tab",
  actualFocus: "#background-control",
  items: [
    {
      id: "ev-modal-open",
      kind: "modal-open",
      summary: "Modal #checkout-modal opened.",
      selector: "#checkout-modal-close",
      insideModal: true,
    },
    {
      id: "ev-focus-escape",
      kind: "focus-escape",
      summary: "Focus escaped to #background-control.",
      selector: "#background-control",
      insideModal: false,
    },
  ],
};

const TRACE: SourceTraceResult = {
  traceId: "trace-run-1",
  diagnosisId: "diag-ctx-1",
  sourceRoot: "/tmp/fixture-src",
  searchTerms: ["background-control", "checkout-modal"],
  candidates: [
    {
      filePath: "src/App.tsx",
      score: 315,
      matchedTerms: ["background-control", "checkout-modal"],
      matchCount: 23,
      snippets: [],
    },
  ],
  selectedContext: [
    {
      filePath: "src/App.tsx",
      startLine: 120,
      endLine: 150,
      content: '<div id="checkout-modal">\n  <a id="background-control" />\n</div>',
      matchedTerms: ["background-control", "checkout-modal"],
    },
  ],
};

describe("buildRepairContextBundle", () => {
  it("packs a compact bundle with metadata but no file contents", () => {
    const bundle = buildRepairContextBundle(DIAGNOSIS, BUNDLE, TRACE);
    const parsed = RepairContextBundleSchema.parse(bundle);
    assert.equal(parsed.diagnosisId, "diag-ctx-1");
    assert.deepEqual(parsed.evidenceIds, ["ev-modal-open", "ev-focus-escape"]);
    assert.ok(parsed.observedFailure.includes("#background-control"));
    assert.ok(parsed.repairStrategy.includes("focus containment"));
    assert.equal(parsed.sourceFiles.length, 1);
    assert.equal(parsed.sourceFiles[0]?.filePath, "src/App.tsx");
    // Metadata only: no full file content rides along.
    assert.ok(!("content" in (parsed.sourceFiles[0] as object)));
    assert.equal(parsed.snippets.length, 1);
    assert.ok(
      (parsed.snippets[0]?.content.length ?? Number.MAX_SAFE_INTEGER) <= 8000,
    );
  });

  it("rejects an empty-snippet trace: the model needs anchors", () => {
    assert.throws(() =>
      buildRepairContextBundle(DIAGNOSIS, BUNDLE, {
        ...TRACE,
        selectedContext: [],
      }),
    );
  });
});
