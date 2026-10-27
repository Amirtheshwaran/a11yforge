import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldLiveEvidence, formatTokens } from "./lib/live-evidence.ts";

/**
 * Live-run evidence folding: SSE frames accumulate into progressive
 * summaries for display. Unknown event types are ignored; the status poll
 * and persisted run stay authoritative. Frames here are minimal
 * `{ type, message, metadata }` shapes matching the shared schemas.
 */

function frame(type, message, metadata = {}) {
  return { type, message, metadata };
}

describe("live evidence folding", () => {
  it("starts empty and ignores unknown event types", () => {
    assert.deepEqual(foldLiveEvidence([]), {
      findings: null,
      escape: null,
      diagnosis: null,
      diagnosisMeta: null,
      source: null,
      proposal: null,
    });
    assert.deepEqual(
      foldLiveEvidence([frame("run-started", "hello", {})]).findings,
      null,
    );
  });

  it("summarizes scanner findings with rule names", () => {
    const out = foldLiveEvidence([
      frame("scanner-completed", "scan done", { findings: 2, rules: ["a", "b"] }),
    ]);
    assert.equal(out.findings, "2 findings across 2 rules: a, b");
  });

  it("falls back to the message when counts are missing", () => {
    const out = foldLiveEvidence([frame("scanner-completed", "scan done", {})]);
    assert.equal(out.findings, "scan done");
  });

  it("records the escape step and focus target", () => {
    const out = foldLiveEvidence([
      frame("focus-escape-detected", "escaped", { step: 4, actualFocus: "#bg" }),
    ]);
    assert.equal(out.escape, "step 4 → #bg");
  });

  it("extracts diagnosis title and attribute metadata", () => {
    const out = foldLiveEvidence([
      frame("diagnosis-completed", "Diagnosed: focus trap", {
        issueType: "focus",
        severity: "serious",
        confidence: 0.9,
      }),
    ]);
    assert.equal(out.diagnosis, "focus trap");
    assert.equal(out.diagnosisMeta, "issueType: focus · severity: serious · confidence: 0.9");
  });

  it("records source candidate and repair proposal", () => {
    const out = foldLiveEvidence([
      frame("source-candidate-selected", "candidate", { file: "a.ts", score: 7 }),
      frame("repair-proposal-completed", "proposal", {
        targetFiles: ["a.ts"],
        edits: 2,
      }),
    ]);
    assert.equal(out.source, "a.ts · score 7");
    assert.equal(out.proposal, "a.ts · 2 edits");
  });

  it("formats token usage with missing values as n/a", () => {
    assert.equal(
      formatTokens({ inputTokens: 10, outputTokens: 5, reasoningTokens: null }),
      "in 10 · out 5",
    );
    assert.equal(
      formatTokens({ inputTokens: null, outputTokens: null, reasoningTokens: 3 }),
      "in n/a · out n/a · reasoning 3",
    );
  });
});
