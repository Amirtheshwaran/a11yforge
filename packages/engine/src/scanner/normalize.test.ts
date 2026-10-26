import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AxeResults } from "axe-core";
import { AccessibilityScanResultSchema } from "@a11yforge/shared";
import { normalizeAxeResults } from "./normalize.js";

function fakeAxeResults(): AxeResults {
  return {
    toolOptions: {},
    testEngine: { name: "axe-core", version: "4.10.3" },
    testRunner: { name: "axe" },
    testEnvironment: {},
    timestamp: "2026-10-26T00:00:00.000Z",
    url: "http://localhost:3002/",
    passes: [],
    violations: [
      {
        id: "button-name",
        impact: "serious",
        description: "Ensures buttons have discernible text",
        help: "Buttons must have discernible text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
        tags: [],
        nodes: [
          {
            html: '<button class="quantity-decrement"></button>',
            target: ["button.quantity-decrement"],
            failureSummary: "Fix any of the following:\n  Element does not have inner text",
          },
          {
            html: '<button class="other"></button>',
            target: ["button.other"],
          },
        ],
      },
      {
        id: "image-alt",
        impact: "critical",
        description: "Ensures <img> elements have alternate text or a role of none or presentation",
        help: "Images must have alternate text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        tags: [],
        nodes: [
          {
            html: '<img class="product-image" src="/product.svg">',
            target: ["img.product-image"],
            failureSummary: "Fix any of the following:\n  Element does not have an alt attribute",
          },
        ],
      },
    ],
    incomplete: [],
    inapplicable: [],
  } as unknown as AxeResults;
}

describe("normalizeAxeResults", () => {
  it("expands one violation per affected node with stable ids", () => {
    const result = normalizeAxeResults({
      axeResults: fakeAxeResults(),
      pageUrl: "http://localhost:3002/",
      scanId: "test-scan",
      startedAt: "2026-10-26T00:00:00.000Z",
      completedAt: "2026-10-26T00:00:01.000Z",
    });

    assert.equal(result.findings.length, 3);
    assert.deepEqual(
      result.findings.map((f) => f.id),
      ["button-name#0", "button-name#1", "image-alt#0"],
    );
    assert.equal(result.findings[0]?.selector, "button.quantity-decrement");
    assert.equal(
      result.findings[0]?.html,
      '<button class="quantity-decrement"></button>',
    );
    assert.match(result.findings[0]?.failureSummary ?? "", /inner text/);
    // A node without a failure summary normalizes to an empty string.
    assert.equal(result.findings[1]?.failureSummary, "");
    for (const finding of result.findings) {
      assert.equal(finding.pageUrl, "http://localhost:3002/");
    }
  });

  it("emits results that satisfy the shared schema", () => {
    const result = normalizeAxeResults({
      axeResults: fakeAxeResults(),
      pageUrl: "http://localhost:3002/",
      scanId: "test-scan",
      startedAt: "2026-10-26T00:00:00.000Z",
      completedAt: "2026-10-26T00:00:01.000Z",
    });
    assert.doesNotThrow(() =>
      AccessibilityScanResultSchema.parse(result),
    );
  });

  it("preserves null impact when axe reports none", () => {
    const axe = fakeAxeResults();
    const violation = axe.violations[0];
    assert.ok(violation);
    violation.impact = null;
    const result = normalizeAxeResults({
      axeResults: axe,
      pageUrl: "http://localhost:3002/",
      scanId: "test-scan",
      startedAt: "2026-10-26T00:00:00.000Z",
      completedAt: "2026-10-26T00:00:01.000Z",
    });
    assert.equal(result.findings[0]?.impact, null);
  });
});
