import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AccessibilityDiagnosisSchema } from "@a11yforge/shared";
import {
  ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
  DIAGNOSIS_JSON_SCHEMA_NAME,
} from "./jsonschema.js";

describe("diagnosis JSON schema (constrained decoding shape)", () => {
  it("names the schema and forbids extra properties", () => {
    assert.equal(DIAGNOSIS_JSON_SCHEMA_NAME, "accessibility-diagnosis");
    assert.equal(ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA.type, "object");
    assert.equal(
      ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA.additionalProperties,
      false,
    );
  });

  it("requires exactly the fields the Zod schema validates", () => {
    const probe = {
      diagnosisId: "diag-1",
      issueType: "focus-containment",
      title: "t",
      summary: "s",
      severity: "serious",
      confidence: 0.9,
      affectedStrategies: ["keyboard-navigation"],
      evidenceIds: ["ev-focus-escape"],
      observedFailure: "o",
      likelyCause: "l",
      recommendedRepairStrategy: "r",
      relevantWcagCriteria: ["2.4.3"],
      needsSourceContext: true,
    };
    const parsed = AccessibilityDiagnosisSchema.parse(probe);
    assert.deepEqual(
      [...ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA.required].sort(),
      Object.keys(parsed).sort(),
    );
  });

  it("constrains the issue taxonomy and confidence bounds on the wire", () => {
    const properties = ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >;
    assert.deepEqual(properties["issueType"]?.["enum"], [
      "focus-containment",
      "accessible-name",
      "missing-alt",
      "missing-label",
      "contrast",
      "unknown",
    ]);
    assert.equal(properties["confidence"]?.["minimum"], 0);
    assert.equal(properties["confidence"]?.["maximum"], 1);
  });
});
