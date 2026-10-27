import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  ExplorationEventSchema,
  isAllowedExplorationArtifactName,
  type ExplorationEvent,
  type ExplorationRun,
} from "@a11yforge/shared";
import {
  runExploration,
  TargetRejectedError,
  validateTargetUrl,
  type RunExplorationOptions,
} from "@a11yforge/engine";
import { isPrivateTargetsAllowed } from "@a11yforge/engine";
import { resolveLiveRunsDir } from "./runs.js";

/**
 * Phase 8 — universal exploration API.
 *
 * - `POST /explorations { url, maxPages? }` validates the URL (SSRF-safe),
 *   starts a deterministic browser exploration, and returns immediately
 *   with `{ runId, status: "running" }`.
 * - `GET /explorations/:runId` returns the run (partial while running).
 * - `GET /explorations/:runId/events` streams stage events over SSE.
 * - `GET /explorations/:runId/screenshots/:name` serves allow-listed
 *   artifacts only (png/json, no traversal).
 * - `POST /explorations/:runId/cancel` stops future navigation/probes and
 *   releases the browser.
 *
 * Zero model calls on every route. Recorded repair-demo data never appears
 * here: a live failure is reported honestly, never backfilled.
 */

type ExplorationRunner = (options: RunExplorationOptions) => Promise<ExplorationRun>;

let explorationRunner: ExplorationRunner = (options) => runExploration(options);

/** Test-only override: run the route with a stubbed engine. */
export function setExplorationRunnerForTests(runner: ExplorationRunner | null): void {
  explorationRunner = runner ?? ((options) => runExploration(options));
}

interface ExplorationRecord {
  runId: string;
  entryUrl: string;
  runsDir: string;
  state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  run: ExplorationRun | null;
  error: string | null;
  events: ExplorationEvent[];
  listeners: Set<(event: ExplorationEvent) => void>;
  controller: AbortController;
  finishedAt: string | null;
}

const records = new Map<string, ExplorationRecord>();

/** Test-only reset of the in-memory exploration registry. */
export function clearExplorationsForTests(): void {
  records.clear();
}

const MAX_CONCURRENT_EXPLORATIONS = 3;

function runningCount(): number {
  let count = 0;
  for (const record of records.values()) {
    if (record.state === "RUNNING") count += 1;
  }
  return count;
}

function sanitizeMessage(message: string): string {
  // Strip control characters without a control-character regex (lint-safe).
  const cleaned = Array.from(message)
    .map((char) => {
      const code = char.codePointAt(0) ?? 32;
      return code < 32 || code === 127 ? " " : char;
    })
    .join("");
  return cleaned.slice(0, 500).trim();
}

function appendEvent(record: ExplorationRecord, incoming: {
  stage: ExplorationEvent["stage"];
  status: ExplorationEvent["status"];
  message: string;
}): void {
  const sequence = record.events.length;
  const candidate = {
    eventId: `${record.runId}-${sequence}`,
    runId: record.runId,
    sequence,
    timestamp: new Date().toISOString(),
    stage: incoming.stage,
    status: incoming.status,
    message: sanitizeMessage(incoming.message),
  };
  const parsed = ExplorationEventSchema.safeParse(candidate);
  if (!parsed.success) return;
  record.events.push(parsed.data);
  for (const listener of record.listeners) {
    listener(parsed.data);
  }
}

function publicRun(record: ExplorationRecord): ExplorationRun | { runId: string; state: string } {
  if (record.run !== null) return record.run;
  return { runId: record.runId, state: record.state };
}

export function registerExplorationRoutes(app: FastifyInstance): void {
  app.post<{ Body: { url?: unknown; maxPages?: unknown } }>("/explorations", async (request, reply) => {
    const { url, maxPages } = request.body ?? {};
    if (typeof url !== "string" || url.trim() === "") {
      return reply.status(400).send({ error: "A website URL is required." });
    }
    let pages = 3;
    if (maxPages !== undefined) {
      if (!Number.isInteger(maxPages) || (maxPages as number) < 1 || (maxPages as number) > 25) {
        return reply.status(400).send({ error: "maxPages must be an integer between 1 and 25." });
      }
      pages = maxPages as number;
    }
    if (runningCount() >= MAX_CONCURRENT_EXPLORATIONS) {
      return reply.status(429).send({ error: "Too many accessibility tests are running. Try again shortly." });
    }
    const allowPrivate = isPrivateTargetsAllowed();
    try {
      await validateTargetUrl(url, { allowPrivate });
    } catch (error) {
      const message =
        error instanceof TargetRejectedError ? error.message : "That website address could not be tested.";
      return reply.status(400).send({ error: message });
    }

    const runId = `exp-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const record: ExplorationRecord = {
      runId,
      entryUrl: url,
      runsDir: resolveLiveRunsDir(),
      state: "RUNNING",
      run: null,
      error: null,
      events: [],
      listeners: new Set(),
      controller: new AbortController(),
      finishedAt: null,
    };
    records.set(runId, record);

    void explorationRunner({
      runId,
      entryUrl: url,
      policy: { maxPages: pages },
      runsDir: record.runsDir,
      allowPrivate,
      signal: record.controller.signal,
      emit: (event) => {
        appendEvent(record, event);
      },
    })
      .then((run) => {
        record.run = run;
        record.state = run.state === "RUNNING" ? "COMPLETED" : run.state;
        record.finishedAt = run.finishedAt;
      })
      .catch((error: unknown) => {
        record.state = "FAILED";
        record.error = error instanceof Error ? error.message : "Exploration failed.";
        record.finishedAt = new Date().toISOString();
        appendEvent(record, { stage: "done", status: "failed", message: record.error });
      });

    return reply.status(202).send({ runId, status: "running" });
  });

  app.get<{ Params: { runId: string } }>("/explorations/:runId", async (request, reply) => {
    const record = records.get(request.params.runId);
    if (record === undefined) {
      return reply.status(404).send({ error: "Unknown exploration run." });
    }
    return reply.send(publicRun(record));
  });

  app.get<{ Params: { runId: string } }>("/explorations/:runId/events", async (request, reply) => {
    const record = records.get(request.params.runId);
    if (record === undefined) {
      return reply.status(404).send({ error: "Unknown exploration run." });
    }
    reply.header("content-type", "text/event-stream");
    reply.header("cache-control", "no-cache");
    reply.header("connection", "keep-alive");
    for (const event of record.events) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (record.state !== "RUNNING") {
      reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      reply.raw.end();
      return;
    }
    const listener = (event: ExplorationEvent): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  app.get<{ Params: { runId: string; name: string } }>(
    "/explorations/:runId/screenshots/:name",
    async (request, reply) => {
      const record = records.get(request.params.runId);
      if (record === undefined) {
        return reply.status(404).send({ error: "Unknown exploration run." });
      }
      const { name } = request.params;
      if (!isAllowedExplorationArtifactName(name)) {
        return reply.status(404).send({ error: "Artifact not found." });
      }
      const filePath = join(record.runsDir, record.runId, name);
      let body: Buffer;
      try {
        body = await readFile(filePath);
      } catch {
        return reply.status(404).send({ error: "Artifact not found." });
      }
      const contentType = name.endsWith(".png") ? "image/png" : "application/json";
      return reply.header("content-type", contentType).send(body);
    },
  );

  app.post<{ Params: { runId: string } }>("/explorations/:runId/cancel", async (request, reply) => {
    const record = records.get(request.params.runId);
    if (record === undefined) {
      return reply.status(404).send({ error: "Unknown exploration run." });
    }
    if (record.state === "RUNNING" && !record.controller.signal.aborted) {
      record.controller.abort();
      if (record.run === null) {
        // The engine converts aborts into a CANCELLED run; this immediate
        // marker keeps polling honest until the browser is released.
        record.state = "CANCELLED";
      }
      appendEvent(record, { stage: "done", status: "skipped", message: "Test cancelled." });
    }
    return reply.send({ runId: record.runId, status: record.state.toLowerCase() });
  });
}
