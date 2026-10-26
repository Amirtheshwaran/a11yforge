import { z } from "zod";

/**
 * Phase 2 deterministic keyboard-interaction evidence.
 *
 * Objective facts only (focus location, pressed keys, assertion outcomes,
 * artifact references) — no interpretation or diagnosis. Later phases
 * consume this evidence; models never replace it.
 */

/** Unified evidence categories across Phase 1 (axe) and Phase 2 (keyboard). */
export const EvidenceTypeSchema = z.enum([
  "axe-finding",
  "focus-observation",
  "interaction-assertion",
  "screenshot",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/** One deterministic focus state captured after a scenario action. */
export const FocusObservationSchema = z.object({
  /** 0-based step index within the run. */
  seq: z.number().int().nonnegative(),
  /** What produced this state (e.g. `click`, `press`, `modal-open`). */
  action: z.string().min(1),
  /** Key pressed for this step, or null for non-keyboard actions. */
  key: z.string().nullable(),
  /** ISO-8601 timestamp of the observation. */
  timestamp: z.string().min(1),
  /** Page URL the focus was observed on. */
  pageUrl: z.string().min(1),
  /** Stable locator for the focused element (`#id` preferred). */
  selector: z.string().min(1),
  /** Lower-case tag name of the focused element. */
  tagName: z.string().min(1),
  /** Explicit `role` attribute, or a cheap implicit mapping, else null. */
  role: z.string().nullable(),
  /** Deterministically derived accessible name (may be empty). */
  accessibleName: z.string().max(200),
  /** Bounded text content of the focused element. */
  text: z.string().max(200),
  /** The element's `tabIndex` property value. */
  tabIndex: z.number().int(),
  /** Whether the focused element is disabled. */
  disabled: z.boolean(),
  /** Effective `aria-hidden` state (self or an ancestor). */
  ariaHidden: z.boolean(),
  /** Whether the focused element is inside the expected modal region. */
  insideModal: z.boolean(),
});
export type FocusObservation = z.infer<typeof FocusObservationSchema>;

/** Objective focus-containment verdict for one modal scenario. */
export const InteractionAssertionSchema = z.object({
  assertion: z.literal("focus-contained-in-modal"),
  passed: z.boolean(),
  /** Observation `seq` where the verdict was decided. */
  step: z.number().int().nonnegative(),
  /** Key pressed on the deciding step (null when not key-driven). */
  pressedKey: z.string().nullable(),
  /** Selector of the modal region focus was expected to stay inside. */
  expectedRegion: z.string().min(1),
  /** Selector of the element that actually held focus. */
  actualFocus: z.string().min(1),
  /** Bounded outer-HTML of the focused element (evidence, not a snapshot). */
  actualHtml: z.string().max(500),
});
export type InteractionAssertion = z.infer<typeof InteractionAssertionSchema>;

/** Reference to a screenshot stored under the run directory. */
export const ScreenshotRefSchema = z.object({
  /** File name within the run directory (e.g. `modal-open.png`). */
  name: z.string().min(1),
  /** Evidence category marker (always `screenshot`). */
  type: z.literal("screenshot"),
  /** ISO-8601 timestamp of capture. */
  capturedAt: z.string().min(1),
});
export type ScreenshotRef = z.infer<typeof ScreenshotRefSchema>;

/** Deterministic run lifecycle events (stored, not streamed — no SSE yet). */
export const RunEventTypeSchema = z.enum([
  "scenario-started",
  "page-loaded",
  "modal-opened",
  "key-pressed",
  "focus-changed",
  "assertion-failed",
  "screenshot-captured",
  "scenario-completed",
]);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;

export const RunEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  type: RunEventTypeSchema,
  timestamp: z.string().min(1),
  detail: z.string().max(500),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

/** Top-level result of one keyboard scenario run. */
export const KeyboardScenarioResultSchema = z.object({
  runId: z.string().min(1),
  scenarioId: z.string().min(1),
  targetUrl: z.string().min(1),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  observations: z.array(FocusObservationSchema),
  assertions: z.array(InteractionAssertionSchema),
  screenshots: z.array(ScreenshotRefSchema),
  events: z.array(RunEventSchema),
});
export type KeyboardScenarioResult = z.infer<
  typeof KeyboardScenarioResultSchema
>;

/** Minimal data-driven scenario step (click, key press, or readiness wait). */
export const ScenarioStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click"), selector: z.string().min(1) }),
  z.object({ kind: z.literal("press"), key: z.string().min(1) }),
  z.object({
    kind: z.literal("wait-for"),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().max(60_000).default(15_000),
  }),
  z.object({
    kind: z.literal("screenshot"),
    name: z.string().min(1).max(64),
  }),
]);
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

/** Minimal scenario definition: later phases select these without rewriting. */
export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** Modal region focus must stay inside while open. */
  modalSelector: z.string().min(1),
  /** Ordered actions the runner executes. */
  steps: z.array(ScenarioStepSchema).min(1),
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;
