/**
 * JSON Schema for Meta constrained decoding (`response_format.json_schema`).
 *
 * Hand-written (not derived at runtime) so the exact wire shape is reviewable
 * and stable; it mirrors `AccessibilityDiagnosisSchema` in `@a11yforge/shared`
 * and the drift between them is covered by a unit test. Constrained decoding
 * is the first validation layer — local Zod validation plus A11yForge
 * evidence-reference validation run after it.
 */

export const DIAGNOSIS_JSON_SCHEMA_NAME = "accessibility-diagnosis";

export const CRITIC_DECISION_JSON_SCHEMA_NAME = "repair-critic-decision";

/**
 * Wire schema for the critic verdict. Mirrors `CriticDecisionSchema` in
 * `@a11yforge/shared`; drift is covered by a unit test.
 */
export const CRITIC_DECISION_JSON_SCHEMA: JsonSchemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    decision: { type: "string", enum: ["ACCEPT", "REJECT"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    evidenceIds: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    verificationConcerns: {
      type: "array",
      items: { type: "string" },
    },
    remainingRisks: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "decision",
    "confidence",
    "summary",
    "evidenceIds",
    "verificationConcerns",
    "remainingRisks",
  ],
  additionalProperties: false,
};

export const REPAIR_PROPOSAL_JSON_SCHEMA_NAME = "accessibility-repair-proposal";

/**
 * Wire schema for a structured repair proposal. Mirrors
 * `RepairProposalSchema` in `@a11yforge/shared`; drift is covered by a unit
 * test. Anchors are exact source text, never line numbers.
 */
export const REPAIR_PROPOSAL_JSON_SCHEMA: JsonSchemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    proposalId: { type: "string", minLength: 1 },
    diagnosisId: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1, maxLength: 2000 },
    rationale: { type: "string", minLength: 1, maxLength: 2000 },
    evidenceIds: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    targetFiles: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string", minLength: 1 },
    },
    edits: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          filePath: { type: "string", minLength: 1 },
          originalText: { type: "string", minLength: 1 },
          replacementText: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
        },
        required: ["filePath", "originalText", "replacementText", "reason"],
        additionalProperties: false,
      },
    },
    risks: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    verificationPlan: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
  },
  required: [
    "proposalId",
    "diagnosisId",
    "summary",
    "rationale",
    "evidenceIds",
    "targetFiles",
    "edits",
    "risks",
    "verificationPlan",
  ],
  additionalProperties: false,
};

export interface JsonSchemaDocument {
  $schema: string;
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: boolean;
}

/** Wire schema sent to the Meta API for structured output. */
export const ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA: JsonSchemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    diagnosisId: { type: "string", minLength: 1 },
    issueType: {
      type: "string",
      enum: [
        "focus-containment",
        "accessible-name",
        "missing-alt",
        "missing-label",
        "contrast",
        "unknown",
      ],
    },
    title: { type: "string", minLength: 1, maxLength: 160 },
    summary: { type: "string", minLength: 1, maxLength: 2000 },
    severity: {
      type: "string",
      enum: ["minor", "moderate", "serious", "critical"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    affectedStrategies: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    evidenceIds: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    observedFailure: { type: "string", minLength: 1, maxLength: 2000 },
    likelyCause: { type: "string", minLength: 1, maxLength: 2000 },
    recommendedRepairStrategy: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
    },
    relevantWcagCriteria: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    needsSourceContext: { type: "boolean" },
  },
  required: [
    "diagnosisId",
    "issueType",
    "title",
    "summary",
    "severity",
    "confidence",
    "affectedStrategies",
    "evidenceIds",
    "observedFailure",
    "likelyCause",
    "recommendedRepairStrategy",
    "relevantWcagCriteria",
    "needsSourceContext",
  ],
  additionalProperties: false,
};
