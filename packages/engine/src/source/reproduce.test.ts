import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AmbiguousElementError,
  buildReproductionPlan,
  relativePagePath,
  resolveElement,
  verificationUrlFor,
  type ResolvablePage,
} from "./reproduce.js";
import type { ProbeResult, ReproElementRef } from "@a11yforge/shared";

function probe(): ProbeResult {
  return {
    probeId: "dialog-focus",
    targetId: "t",
    pageUrl: "https://example.com/settings/profile?tab=a11y",
    status: "failed",
    title: "Keyboard focus can leave this dialog.",
    humanSummary: "Focus escaped.",
    severity: "serious",
    evidence: [
      {
        kind: "dialog-focus-escape",
        summary: "Focus moved outside the dialog.",
        data: { ruleId: "aria-dialog-name" },
      },
    ],
    actionTrace: [
      { seq: 0, action: "page-loaded", detail: "Page loaded.", pageUrl: "https://example.com/settings/profile?tab=a11y", timestamp: "t" },
      { seq: 1, action: "key-pressed", detail: "Pressed Tab.", pageUrl: "https://example.com/settings/profile?tab=a11y", timestamp: "t" },
    ],
    screenshots: [],
    standardReferences: ["https://www.w3.org/TR/WCAG21/"],
    startedAt: "t",
    completedAt: "t",
  };
}

function stubPage(counts: { id: number; data: number; roleName: number; selector: number }): ResolvablePage {
  return {
    findById: async () => counts.id,
    findByDataAttribute: async () => counts.data,
    findByRoleAndName: async () => counts.roleName,
    findBySelector: async () => counts.selector,
  };
}

function ref(partial: Partial<ReproElementRef>): ReproElementRef {
  return {
    elementId: "",
    dataAttribute: "",
    role: "",
    accessibleName: "",
    fingerprint: "",
    domPath: "",
    replaySelector: "",
    ...partial,
  };
}

describe("reproduction plans", () => {
  it("derives the relative page path from the original URL", () => {
    assert.equal(
      relativePagePath("https://example.com/settings/profile?tab=a11y"),
      "/settings/profile?tab=a11y",
    );
    assert.equal(relativePagePath("not a url"), "/");
  });

  it("maps the SAME relative location onto the verification origin", () => {
    const plan = buildReproductionPlan({ planId: "p1", findingId: "f1", probe: probe() });
    assert.equal(plan.pagePath, "/settings/profile?tab=a11y");
    assert.equal(
      verificationUrlFor(plan, "http://verification-target:4123"),
      "http://verification-target:4123/settings/profile?tab=a11y",
    );
    assert.ok(plan.actions.length > 0);
    assert.ok(plan.assertions.length > 0);
    assert.deepEqual(plan.axeRules, ["aria-dialog-name"]);
  });

  it("re-resolves by stable id first", async () => {
    await resolveElement(stubPage({ id: 1, data: 5, roleName: 5, selector: 5 }), ref({ elementId: "x" }));
  });

  it("fails on ambiguous matches instead of guessing", async () => {
    await assert.rejects(
      resolveElement(stubPage({ id: 2, data: 0, roleName: 0, selector: 0 }), ref({ elementId: "x" })),
      AmbiguousElementError,
    );
    await assert.rejects(
      resolveElement(
        stubPage({ id: 0, data: 0, roleName: 0, selector: 0 }),
        ref({ replaySelector: "button" }),
      ),
      AmbiguousElementError,
    );
  });

  it("falls through id miss to data attribute to role+name", async () => {
    await resolveElement(
      stubPage({ id: 0, data: 1, roleName: 5, selector: 5 }),
      ref({ elementId: "gone", dataAttribute: "data-testid=email", role: "button", accessibleName: "Send" }),
    );
    await resolveElement(
      stubPage({ id: 0, data: 0, roleName: 1, selector: 5 }),
      ref({ role: "button", accessibleName: "Send" }),
    );
  });
});
