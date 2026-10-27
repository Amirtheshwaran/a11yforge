import type {
  ExplorationEvent,
  ExplorationRun,
  ExplorationStage,
} from "@a11yforge/shared";

/**
 * Centralized exploration stage mapping (single owner).
 *
 * Derives each human stage (Opening website … Done) from the real backend
 * event stream plus the authoritative finished run. Stages never advance
 * on timers: a stage is running only while its events are the latest
 * observed, and every stage is done once the persisted run exists.
 */
export const STAGE_ORDER: ExplorationStage[] = [
  "opening",
  "exploring",
  "scanning",
  "interacting",
  "reviewing",
  "done",
];

export function stageState(
  stage: ExplorationStage,
  events: ExplorationEvent[],
  run: ExplorationRun | null,
): "pending" | "running" | "done" {
  if (run !== null) return "done";
  const seen = events.some((event) => event.stage === stage);
  const laterSeen = events.some(
    (event) => STAGE_ORDER.indexOf(event.stage) > STAGE_ORDER.indexOf(stage),
  );
  if (laterSeen) return "done";
  if (seen) return "running";
  const firstPending = STAGE_ORDER.find(
    (candidate) => !events.some((event) => event.stage === candidate),
  );
  if (firstPending === stage && events.length > 0) return "running";
  return "pending";
}
