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
