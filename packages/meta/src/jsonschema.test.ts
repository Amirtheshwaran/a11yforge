import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AccessibilityDiagnosisSchema,
  CriticDecisionSchema,
  RepairProposalSchema,
} from "@a11yforge/shared";
import {
  ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
  CRITIC_DECISION_JSON_SCHEMA,
  CRITIC_DECISION_JSON_SCHEMA_NAME,
  DIAGNOSIS_JSON_SCHEMA_NAME,
  REPAIR_PROPOSAL_JSON_SCHEMA,
  REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
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

describe("repair proposal JSON schema (constrained decoding shape)", () => {
  it("names the schema and forbids extra properties", () => {
    assert.equal(
      REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
      "accessibility-repair-proposal",
    );
    assert.equal(REPAIR_PROPOSAL_JSON_SCHEMA.type, "object");
    assert.equal(REPAIR_PROPOSAL_JSON_SCHEMA.additionalProperties, false);
  });

  it("requires exactly the fields the Zod schema validates", () => {
    const probe = {
      proposalId: "prop-1",
      diagnosisId: "diag-1",
      summary: "s",
      rationale: "r",
      evidenceIds: ["ev-focus-escape"],
      targetFiles: ["src/App.tsx"],
      edits: [
        {
          filePath: "src/App.tsx",
          originalText: "a",
          replacementText: "b",
          reason: "why",
        },
      ],
      risks: [],
      verificationPlan: ["rebuild project"],
    };
    const parsed = RepairProposalSchema.parse(probe);
    assert.deepEqual(
      [...REPAIR_PROPOSAL_JSON_SCHEMA.required].sort(),
      Object.keys(parsed).sort(),
    );
  });

  it("bounds edits and target files on the wire", () => {
    const properties = REPAIR_PROPOSAL_JSON_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >;
    assert.equal(properties["edits"]?.["maxItems"], 4);
    assert.equal(properties["targetFiles"]?.["maxItems"], 2);
    assert.equal(properties["verificationPlan"]?.["minItems"], 1);
  });
});

describe("critic decision JSON schema (constrained decoding shape)", () => {
  it("names the schema and forbids extra properties", () => {
    assert.equal(CRITIC_DECISION_JSON_SCHEMA_NAME, "repair-critic-decision");
    assert.equal(CRITIC_DECISION_JSON_SCHEMA.type, "object");
    assert.equal(CRITIC_DECISION_JSON_SCHEMA.additionalProperties, false);
  });

  it("requires exactly the fields the Zod schema validates", () => {
    const probe = {
      decision: "ACCEPT",
      confidence: 0.9,
      summary: "s",
      evidenceIds: ["ev-focus-escape"],
      verificationConcerns: [],
      remainingRisks: [],
    };
    const parsed = CriticDecisionSchema.parse(probe);
    assert.deepEqual(
      [...CRITIC_DECISION_JSON_SCHEMA.required].sort(),
      Object.keys(parsed).sort(),
    );
  });

  it("constrains the verdict and confidence bounds on the wire", () => {
    const properties = CRITIC_DECISION_JSON_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >;
    assert.deepEqual(properties["decision"]?.["enum"], ["ACCEPT", "REJECT"]);
    assert.equal(properties["confidence"]?.["minimum"], 0);
    assert.equal(properties["confidence"]?.["maximum"], 1);
  });
});
