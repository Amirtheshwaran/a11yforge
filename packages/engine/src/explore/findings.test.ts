import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectFindings } from "./findings.js";
import type { ProbeResult } from "@a11yforge/shared";

function baseResult(overrides: Partial<ProbeResult>): ProbeResult {
  return {
    probeId: "keyboard-traversal",
    targetId: "tgt-1",
    pageUrl: "https://example.com/",
    status: "observed",
    title: "Traversal observed.",
    humanSummary: "Something notable happened.",
    severity: "info",
    evidence: [],
    actionTrace: [],
    screenshots: [],
    standardReferences: [],
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    ...overrides,
  };
}

describe("projectFindings", () => {
  it("groups axe violations by rule into automated findings", () => {
    const axe = baseResult({
      probeId: "page-axe-scan",
      status: "failed",
      evidence: [
        { kind: "axe-violation", summary: "a", data: { ruleId: "image-alt", help: "Images need text", helpUrl: "https://example.com/h", impact: "critical", selector: "img", html: "<img>", failureSummary: "fix" } },
        { kind: "axe-violation", summary: "b", data: { ruleId: "image-alt", help: "Images need text", helpUrl: "https://example.com/h", impact: "critical", selector: "img.x", html: "<img>", failureSummary: "fix" } },
        { kind: "axe-violation", summary: "c", data: { ruleId: "label", help: "Label it", helpUrl: "", impact: "serious", selector: "#e", html: "<input>", failureSummary: "fix" } },
      ],
    });
    const findings = projectFindings([axe]);
    assert.equal(findings.length, 2);
    assert.ok(findings.every((finding) => finding.category === "automated-finding"));
    assert.ok((findings[0]?.title ?? "").includes("Images need text"));
    for (const finding of findings) {
      assert.ok(finding.whatHappened !== "");
      assert.ok(finding.whyItMatters !== "");
      assert.ok(finding.howReproduced.length > 0);
    }
  });

  it("maps failed interaction probes to confirmed failures", () => {
    const failed = baseResult({
      status: "failed",
      title: "Keyboard focus can leave this dialog while it is still open.",
      evidence: [{ kind: "dialog-focus-escape", summary: "escaped", data: {} }],
    });
    const findings = projectFindings([failed]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.category, "confirmed-failure");
  });

  it("maps observed to observations and untested to not-tested", () => {
    const observed = baseResult({ status: "observed", title: "Traversal noted." });
    const untested = baseResult({
      probeId: "disclosure-popup",
      status: "not-tested",
      title: "Could not safely test.",
    });
    const findings = projectFindings([observed, untested]);
    assert.deepEqual(
      findings.map((finding) => finding.category),
      ["observation", "not-tested"],
    );
  });

  it("emits nothing for passed and not-applicable results", () => {
    const findings = projectFindings([
      baseResult({ status: "passed" }),
      baseResult({ status: "not-applicable", probeId: "dialog-behavior" }),
    ]);
    assert.equal(findings.length, 0);
  });

  it("uses plain human language, never assertion identifiers", () => {
    const failed = baseResult({
      status: "failed",
      title: "Keyboard focus can leave this dialog while it is still open.",
      evidence: [{ kind: "dialog-focus-escape", summary: "escaped", data: {} }],
    });
    const [finding] = projectFindings([failed]);
    assert.ok(finding !== undefined);
    for (const text of [finding.title, finding.whatHappened, finding.whyItMatters]) {
      assert.ok(!text.includes("ev-focus-step"), text);
      assert.ok(!text.includes("assertion failed"), text);
    }
  });

  it("carries measured axe boxes into highlights aligned to the page shot", () => {
    const box = { x: 10, y: 20, width: 100, height: 30, viewportWidth: 1280, viewportHeight: 720 };
    const axe = baseResult({
      probeId: "page-axe-scan",
      status: "failed",
      screenshots: ["screenshot-0.png"],
      evidence: [
        { kind: "axe-violation", summary: "a", data: { ruleId: "image-alt", help: "Images need text", helpUrl: "https://example.com/h", impact: "critical", selector: "img.a", html: "<img>", failureSummary: "fix", box, boxLabel: "photo image" } },
        { kind: "axe-violation", summary: "b", data: { ruleId: "image-alt", help: "Images need text", helpUrl: "https://example.com/h", impact: "critical", selector: "img.b", html: "<img>", failureSummary: "fix", box: null, boxLabel: "" } },
      ],
    });
    const [finding] = projectFindings([axe]);
    assert.ok(finding !== undefined);
    assert.equal(finding.highlights.length, 1);
    assert.deepEqual(finding.highlights[0], {
      screenshot: "screenshot-0.png",
      ...box,
      label: "photo image",
      selector: "img.a",
    });
  });

  it("emits no highlights when boxes are missing, invalid, or unaligned", () => {
    const bad = { x: 0, y: 0, width: 0, height: 5, viewportWidth: 1280, viewportHeight: 720 };
    const axe = baseResult({
      probeId: "page-axe-scan",
      status: "failed",
      screenshots: [],
      evidence: [
        { kind: "axe-violation", summary: "a", data: { ruleId: "label", help: "Label it", helpUrl: "", impact: "serious", selector: "#e", html: "<input>", failureSummary: "fix", box: bad, boxLabel: "x" } },
      ],
    });
    const [noShot] = projectFindings([axe]);
    assert.deepEqual(noShot?.highlights ?? null, []);
    const withShot = baseResult({
      probeId: "page-axe-scan",
      status: "failed",
      screenshots: ["screenshot-0.png"],
      evidence: [
        { kind: "axe-violation", summary: "a", data: { ruleId: "label", help: "Label it", helpUrl: "", impact: "serious", selector: "#e", html: "<input>", failureSummary: "fix", box: { what: "nope" }, boxLabel: "x" } },
      ],
    });
    const [invalid] = projectFindings([withShot]);
    assert.deepEqual(invalid?.highlights ?? null, []);
  });

  it("highlights the focused element for keyboard anomalies", () => {
    const box = { x: 5, y: 5, width: 50, height: 20, viewportWidth: 1280, viewportHeight: 720 };
    const failed = baseResult({
      status: "failed",
      title: "Keyboard focus moved to content hidden from assistive technology.",
      screenshots: ["screenshot-1.png"],
      evidence: [
        {
          kind: "keyboard-focus-anomaly",
          summary: "focus landed on hidden content at step 3",
          data: { role: "iframe", name: "", selector: "iframe", box, startLabel: "body", steps: 3 },
        },
      ],
    });
    const [finding] = projectFindings([failed]);
    assert.ok(finding !== undefined);
    assert.equal(finding.category, "confirmed-failure");
    assert.deepEqual(finding.highlights, [
      { screenshot: "screenshot-1.png", ...box, label: "iframe", selector: "iframe" },
    ]);
  });
});
