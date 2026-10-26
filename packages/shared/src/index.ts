/**
 * Shared schemas and types for A11yForge.
 *
 * Phase 0: establishes the package boundary only. Future phases will add
 * evidence envelopes, diagnosis results, patch proposals, and verdicts here
 * so the web app, API, engine, and Meta provider all speak the same shapes.
 */

/** Response body for `GET /health`. */
export interface ApiHealth {
  status: "ok";
  service: "a11yforge-api";
}

export {
  AccessibilityFindingSchema,
  AccessibilityScanResultSchema,
  ImpactSchema,
} from "./evidence.js";
export type {
  AccessibilityFinding,
  AccessibilityScanResult,
  Impact,
} from "./evidence.js";
export {
  EvidenceTypeSchema,
  FocusObservationSchema,
  InteractionAssertionSchema,
  KeyboardScenarioResultSchema,
  RunEventSchema,
  RunEventTypeSchema,
  ScenarioDefinitionSchema,
  ScenarioStepSchema,
  ScreenshotRefSchema,
} from "./interaction.js";
export type {
  EvidenceType,
  FocusObservation,
  InteractionAssertion,
  KeyboardScenarioResult,
  RunEvent,
  RunEventType,
  ScenarioDefinition,
  ScenarioStep,
  ScreenshotRef,
} from "./interaction.js";
