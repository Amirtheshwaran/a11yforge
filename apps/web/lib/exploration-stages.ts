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
 * observed. A finished run does not turn skipped or failed checks into passes.
 */
export const STAGE_ORDER: ExplorationStage[] = [
  "opening",
  "exploring",
  "scanning",
  "interacting",
  "reviewing",
  "done",
];

export type ProgressState = "pending" | "running" | "done" | "failed" | "skipped";

export function stageState(
  stage: ExplorationStage,
  events: ExplorationEvent[],
  run: ExplorationRun | null,
): ProgressState {
  const latest = events.filter((event) => event.stage === stage).at(-1);
  if (run !== null && run.state !== "RUNNING") {
    const recorded = run.stages.find((item) => item.stage === stage)?.state;
    if (recorded === "passed") return "done";
    if (recorded === "failed" || recorded === "skipped") return recorded;
    if (latest?.status === "failed") return "failed";
    return "skipped";
  }
  if (latest?.status === "failed" || latest?.status === "skipped") return latest.status;
  if (latest?.status === "passed") return "done";
  const laterSeen = events.some(
    (event) => STAGE_ORDER.indexOf(event.stage) > STAGE_ORDER.indexOf(stage),
  );
  if (laterSeen) return latest === undefined ? "skipped" : "done";
  if (latest !== undefined) return "running";
  return "pending";
}
