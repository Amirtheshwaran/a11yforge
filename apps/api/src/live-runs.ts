import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  collectSpendLedger as collectEngineSpendLedger,
  newRunId,
  runAutonomousRepair,
  type AutorunResult,
} from "@a11yforge/engine";
import {
  LiveRunEventSchema,
  LiveRunStatusSchema,
  containsNoSecrets,
  emptySpendSummary,
  isAllowedArtifactName,
  projectLiveStages,
  sanitizeLiveMessage,
  sanitizeLiveMetadata,
  type LiveRunEvent,
  type LiveRunState,
  type LiveRunStatus,
  type ModelSpendSummary,
} from "@a11yforge/shared";
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { resolveLiveRunsDir } from "./runs.js";

/**
 * Phase 6.5 live-run orchestration API.
 *
 * - `POST /runs` starts one controlled autonomous repair against the
 *   broken-shop fixture and returns immediately (`{ runId, status }`).
 * - `GET /runs/:runId/status` returns the live snapshot (pipeline stages,
 *   spend, present artifacts) — pollable between events.
 * - `GET /runs/:runId/events` streams the real pipeline events over
 *   Server-Sent Events (replay + live).
 *
 * No database: the artifact directory stays the durable source of truth
 * and a small in-memory registry tracks the single active run. Only one
 * autonomous run executes at a time — a second `POST /runs` is rejected
 * with the active run id so clients subscribe instead of duplicating
 * expensive inference.
 */

export type PipelineRunner = (
  runId: string,
  runsDir: string,
  emit: (event: LiveRunEvent) => void,
) => Promise<AutorunResult>;

interface LiveRunRecord {
  runId: string;
  runsDir: string;
  state: LiveRunState;
  events: LiveRunEvent[];
  listeners: Set<(event: LiveRunEvent) => void>;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  finalState: string | null;
  currentStage: string | null;
  ended: boolean;
}

const records = new Map<string, LiveRunRecord>();

let pipelineRunner: PipelineRunner = (runId, runsDir, emit) =>
  runAutonomousRepair({ runId, runsDir, emit });

/** Test-only override: run the orchestration with a mock pipeline. */
export function setPipelineRunnerForTests(runner: PipelineRunner | null): void {
  pipelineRunner =
    runner ?? ((runId, runsDir, emit) => runAutonomousRepair({ runId, runsDir, emit }));
}

/** Test-only reset of the in-memory active-run registry. */
export function clearLiveRunRegistryForTests(): void {
  records.clear();
}

/** The currently RUNNING record, if any (duplicate-start prevention). */
export function activeLiveRun(): LiveRunRecord | null {
  for (const record of records.values()) {
    if (record.state === "RUNNING") return record;
  }
  return null;
}

function recordEvent(record: LiveRunRecord, incoming: LiveRunEvent): LiveRunEvent {
  // Defense in depth: the engine already sanitizes, but the API never
  // forwards an unsanitized or unsequenced event to browsers.
  const sequence = record.events.length;
  const candidate = {
    ...incoming,
    eventId: `${record.runId}-${sequence}`,
    runId: record.runId,
    sequence,
    timestamp:
      typeof incoming.timestamp === "string" && incoming.timestamp !== ""
        ? incoming.timestamp
        : new Date().toISOString(),
    message: sanitizeLiveMessage(incoming.message),
    metadata: sanitizeLiveMetadata(incoming.metadata ?? {}),
  };
  const parsed = LiveRunEventSchema.safeParse(candidate);
  const event: LiveRunEvent = parsed.success
    ? parsed.data
    : {
        eventId: `${record.runId}-${sequence}`,
        runId: record.runId,
        sequence,
        timestamp: new Date().toISOString(),
        type: "run-failed",
        stage: "run",
        status: "failed",
        message: "Invalid pipeline event dropped (schema violation).",
        metadata: {},
      };
  record.events.push(event);
  if (event.type === "run-completed" || event.type === "run-failed") {
    record.ended = true;
  } else if (event.status === "started") {
    record.currentStage = event.stage;
  }
  for (const listener of record.listeners) {
    try {
      listener(event);
    } catch {
      /* a slow client must never break the run */
    }
  }
  return event;
}

async function readLiveSpend(runsDir: string, runId: string): Promise<ModelSpendSummary> {
  try {
    const { summary } = await collectEngineSpendLedger(join(runsDir, runId));
    return summary;
  } catch {
    return emptySpendSummary();
  }
}

async function listPresentArtifacts(runsDir: string, runId: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(join(runsDir, runId));
  } catch {
    return [];
  }
  return entries.filter((name) => isAllowedArtifactName(name)).sort();
}

async function buildStatus(record: LiveRunRecord): Promise<LiveRunStatus> {
  const stages = projectLiveStages(record.events);
  const running = stages.find((s) => s.state === "running") ?? null;
  const status = LiveRunStatusSchema.parse({
    runId: record.runId,
    state: record.state,
    currentStage: record.state === "RUNNING" ? (running?.id ?? record.currentStage) : null,
    stages,
    usage: await readLiveSpend(record.runsDir, record.runId),
    error: record.error,
    eventCount: record.events.length,
    finalState: record.finalState,
    artifacts: await listPresentArtifacts(record.runsDir, record.runId),
    updatedAt: new Date().toISOString(),
  });
  if (!containsNoSecrets(status)) {
    throw new Error("live status failed safety screening");
  }
  return status;
}

function sseLine(event: LiveRunEvent): string {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function writeSseStream(
  request: FastifyRequest<{ Params: { runId: string } }>,
  reply: FastifyReply,
  record: LiveRunRecord,
): Promise<void> {
  const raw = reply.raw;
  raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  // Replay everything the run already emitted, in order.
  for (const event of record.events) {
    if (!raw.write(sseLine(event))) {
      await new Promise((resolve) => raw.once("drain", resolve));
    }
  }
  if (record.state !== "RUNNING") {
    raw.end();
    return;
  }
  const heartbeat = setInterval(() => {
    try {
      raw.write(": ping\n\n");
    } catch {
      /* client gone */
    }
  }, 25_000);
  if (typeof (heartbeat as unknown as { unref?: () => void }).unref === "function") {
    (heartbeat as unknown as { unref: () => void }).unref();
  }
  const onEvent = (event: LiveRunEvent): void => {
    try {
      raw.write(sseLine(event));
    } catch {
      /* client gone */
    }
    if (event.type === "run-completed" || event.type === "run-failed") {
      setTimeout(() => {
        clearInterval(heartbeat);
        try {
          raw.end();
        } catch {
          /* already closed */
        }
      }, 500);
      record.listeners.delete(onEvent);
    }
  };
  record.listeners.add(onEvent);
  request.raw.on("close", () => {
    clearInterval(heartbeat);
    record.listeners.delete(onEvent);
  });
}

async function launchRun(record: LiveRunRecord): Promise<void> {
  const emit = (event: LiveRunEvent): void => {
    recordEvent(record, event);
  };
  try {
    const result = await pipelineRunner(record.runId, record.runsDir, emit);
    record.finalState = result.finalState;
    record.state = "COMPLETED";
    record.finishedAt = new Date().toISOString();
  } catch (error) {
    // The pipeline already emitted run-failed with the preserved
    // artifacts in place; the registry just records the terminal state.
    const last = record.events[record.events.length - 1];
    if (last?.type !== "run-failed") {
      recordEvent(record, {
        eventId: "",
        runId: record.runId,
        sequence: -1,
        timestamp: new Date().toISOString(),
        type: "run-failed",
        stage: "run",
        status: "failed",
        message: sanitizeLiveMessage(
          error instanceof Error ? error.message : String(error),
        ),
        metadata: {},
      });
    }
    record.error = sanitizeLiveMessage(
      error instanceof Error ? error.message : String(error),
    );
    record.state = "FAILED";
    record.finishedAt = new Date().toISOString();
  }
}

export function registerLiveRunRoutes(
  app: FastifyInstance,
  deps: { runner?: PipelineRunner } = {},
): void {
  if (deps.runner !== undefined) {
    setPipelineRunnerForTests(deps.runner);
  }

  app.post("/runs", async (_request, reply) => {
    const active = activeLiveRun();
    if (active !== null) {
      return reply.status(409).send({
        error: "an autonomous repair run is already in progress",
        runId: active.runId,
        status: "RUNNING",
      });
    }
    if (
      process.env[MODEL_API_KEY_ENV] === undefined ||
      process.env[MODEL_API_KEY_ENV] === ""
    ) {
      return reply.status(503).send({
        error:
          "Meta Model API key is not configured. Export MODEL_API_KEY on the API server, then start a run.",
      });
    }
    // Live runs always write to the writable runtime directory — never
    // into the committed recorded-demo bundle.
    const runsDir = resolveLiveRunsDir();
    const runId = newRunId();
    const record: LiveRunRecord = {
      runId,
      runsDir,
      state: "RUNNING",
      events: [],
      listeners: new Set(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      finalState: null,
      currentStage: null,
      ended: false,
    };
    records.set(runId, record);
    // Return immediately — the pipeline runs detached and streams events.
    void launchRun(record);
    return reply.status(202).send({ runId, status: "RUNNING" });
  });

  app.get<{ Params: { runId: string } }>(
    "/runs/:runId/status",
    async (request, reply) => {
      const record = records.get(request.params.runId);
      if (record === undefined) {
        return reply.status(404).send({ error: "unknown run" });
      }
      try {
        return reply.send(await buildStatus(record));
      } catch {
        return reply.status(500).send({ error: "live status unavailable" });
      }
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/runs/:runId/events",
    async (request, reply) => {
      const record = records.get(request.params.runId);
      if (record === undefined) {
        return reply.status(404).send({ error: "unknown run" });
      }
      // Hijack the raw response for the SSE stream.
      reply.hijack();
      await writeSseStream(request, reply, record);
    },
  );
}
