import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExplorationFinding, ProbeResult } from "@a11yforge/shared";
import {
  buildSourceDiagnosisBundle,
  validateSourceDiagnosisGrounding,
} from "./diagnose-bundle.js";

function finding(): ExplorationFinding {
  return {
    findingId: "f-1",
    category: "confirmed-failure",
    title: "Keyboard focus can leave this dialog.",
    whatHappened: "Pressing Tab moved focus outside the open dialog.",
    whyItMatters: "Keyboard users lose their place.",
    howReproduced: ["Open the dialog.", "Press Tab repeatedly."],
    pageUrl: "https://example.com/page",
    severity: "serious",
    probeId: "dialog-focus",
    screenshots: [],
    standardReferences: ["https://www.w3.org/TR/WCAG21/"],
  };
}

function probe(): ProbeResult {
  return {
    probeId: "dialog-focus",
    targetId: "t",
    pageUrl: "https://example.com/page",
    status: "failed",
    title: "Focus escaped.",
    humanSummary: "Escape observed.",
    severity: "serious",
    evidence: [
      { kind: "dialog-focus-escape", summary: "Focus left the dialog.", data: {} },
    ],
    actionTrace: [
      { seq: 0, action: "key-pressed", detail: "Pressed Tab.", pageUrl: "https://example.com/page", timestamp: "t" },
    ],
    screenshots: [],
    standardReferences: [],
    startedAt: "t",
    completedAt: "t",
  };
}

describe("generic diagnosis bundle", () => {
  it("carries only the selected finding, bounded evidence, and trace context", () => {
    const bundle = buildSourceDiagnosisBundle({
      finding: finding(),
      probe: probe(),
      trace: null,
    });
    assert.equal(bundle.findingId, "f-1");
    assert.equal(bundle.observedFailure, finding().whatHappened);
    assert.equal(bundle.evidence.length, 1);
    assert.ok(/^ev-\d+$/.test(bundle.evidence[0]?.evidenceId ?? ""));
    assert.equal(bundle.sourceContext.length, 0);
  });

  it("accepts grounded evidence references", () => {
    const bundle = buildSourceDiagnosisBundle({ finding: finding(), probe: probe(), trace: null });
    const rejection = validateSourceDiagnosisGrounding({
      bundle,
      evidenceIds: [bundle.evidence[0]?.evidenceId ?? ""],
      observedFailure: "The browser showed focus leaving the dialog.",
      likelyCause: "The dialog implementation may not constrain focus while active.",
    });
    assert.equal(rejection, null);
  });

  it("rejects invented evidence and unsupplied source citations", () => {
    const bundle = buildSourceDiagnosisBundle({ finding: finding(), probe: probe(), trace: null });
    assert.ok(
      validateSourceDiagnosisGrounding({
        bundle,
        evidenceIds: ["ev-99"],
        observedFailure: "The browser showed focus leaving the dialog.",
        likelyCause: "Something may be wrong.",
      }) !== null,
    );
    assert.ok(
      validateSourceDiagnosisGrounding({
        bundle,
        evidenceIds: [bundle.evidence[0]?.evidenceId ?? ""],
        observedFailure: "The browser showed focus leaving the dialog.",
        likelyCause: "CheckoutModal.tsx line 42 forgot the trap.",
      }) !== null,
    );
  });
});
