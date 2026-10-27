import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { UserCommandConfigSchema } from "@a11yforge/shared";
import {
  connectSource,
  traceFindingToSource,
  writeSourceArtifacts,
  type ConnectedSource,
} from "@a11yforge/engine";
import { resolveDataDir, resolveLiveRunsDir } from "./runs.js";

/**
 * Phase 9 — source-connection API.
 *
 * - `POST /sources/connect { gitUrl, runId?, userCommands? }` clones a
 *   public Git repository into the runtime data directory, builds the
 *   deterministic inventory + execution profile, and (when `runId` and
 *   `findingId` name an exploration finding) traces it into source.
 *   Returns immediately with 202; poll `GET /sources/:sourceId`.
 * - `GET /sources/:sourceId` returns the connection state + profile.
 * - `GET /sources/:sourceId/trace` returns the deterministic trace.
 *
 * Hosted mode accepts Git URLs only. Local source paths are rejected
 * here (403 + CLI hint) — arbitrary server filesystem access is never
 * exposed through the web UI; local trees connect via the trusted CLI.
 */

interface SourceRecord {
  sourceId: string;
  state: "CONNECTING" | "CONNECTED" | "FAILED";
  error: string | null;
  connected: ConnectedSource | null;
  trace: Awaited<ReturnType<typeof traceFindingToSource>> | null;
  runId: string | null;
  findingId: string | null;
}

const records = new Map<string, SourceRecord>();

function publicRecord(record: SourceRecord): unknown {
  return {
    sourceId: record.sourceId,
    state: record.state,
    error: record.error,
    runId: record.runId,
    findingId: record.findingId,
    target:
      record.connected === null
        ? null
        : {
            sourceId: record.connected.target.sourceId,
            kind: record.connected.target.kind,
            // Never expose absolute workspace paths to the browser.
            revision: record.connected.target.revision,
            connectedAt: record.connected.target.connectedAt,
          },
    inventory:
      record.connected === null
        ? null
        : {
            fileCount: record.connected.inventory.fileCount,
            directoryCount: record.connected.inventory.directoryCount,
            totalBytes: record.connected.inventory.totalBytes,
            manifestFiles: record.connected.inventory.manifestFiles,
            lockfiles: record.connected.inventory.lockfiles,
            scripts: record.connected.inventory.scripts,
            likelySourceDirs: record.connected.inventory.likelySourceDirs,
          },
    profile: record.connected?.profile ?? null,
  };
}

export function registerSourceRoutes(app: FastifyInstance): void {
  app.post<{
    Body: {
      gitUrl?: string;
      localPath?: string;
      runId?: string;
      findingId?: string;
      userCommands?: unknown;
    };
  }>("/sources/connect", async (request, reply) => {
    const { gitUrl, localPath, runId, findingId, userCommands } =
      request.body ?? {};
    if (localPath !== undefined) {
      return reply.status(403).send({
        error:
          "Local source directories connect through the trusted CLI only: " +
          "a11yforge repair --run <run-id> --finding <finding-id> --source .",
      });
    }
    if (typeof gitUrl !== "string" || gitUrl.trim() === "") {
      return reply.status(400).send({ error: "A public Git repository URL is required." });
    }
    if (
      (runId !== undefined) !== (findingId !== undefined) ||
      (typeof runId === "string" && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId))
    ) {
      return reply.status(400).send({
        error: "runId and findingId must be supplied together.",
      });
    }
    let parsedCommands;
    if (userCommands !== undefined) {
      const parsed = UserCommandConfigSchema.safeParse(userCommands);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid verification commands." });
      }
      parsedCommands = parsed.data;
    }
    const sourceId = `src-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const record: SourceRecord = {
      sourceId,
      state: "CONNECTING",
      error: null,
      connected: null,
      trace: null,
      runId: runId ?? null,
      findingId: findingId ?? null,
    };
    records.set(sourceId, record);

    void (async () => {
      try {
        const sourcesDir = join(resolveDataDir(), ".a11yforge", "sources");
        const connected = await connectSource({
          gitUrl,
          sourcesDir,
          sourceId,
          userCommands: parsedCommands,
        });
        record.connected = connected;
        if (record.runId !== null && record.findingId !== null) {
          const runDir = join(resolveLiveRunsDir(), record.runId);
          const trace = await traceFindingToSource({
            runDir,
            findingId: record.findingId,
            target: connected.target,
            inventory: connected.inventory,
          });
          record.trace = trace;
          await writeSourceArtifacts({ runDir, connected, trace });
        }
        record.state = "CONNECTED";
      } catch (error) {
        record.state = "FAILED";
        record.error =
          error instanceof Error ? error.message.slice(0, 500) : "Source connection failed.";
      }
    })();

    return reply.status(202).send({ sourceId, status: "connecting" });
  });

  app.get<{ Params: { sourceId: string } }>(
    "/sources/:sourceId",
    async (request, reply) => {
      const record = records.get(request.params.sourceId);
      if (record === undefined) {
        // Survives restarts: read back from the run dir is out of scope;
        // report unknown honestly.
        return reply.status(404).send({ error: "Unknown source connection." });
      }
      return reply.send(publicRecord(record));
    },
  );

  app.get<{ Params: { sourceId: string } }>(
    "/sources/:sourceId/trace",
    async (request, reply) => {
      const record = records.get(request.params.sourceId);
      if (record === undefined) {
        return reply.status(404).send({ error: "Unknown source connection." });
      }
      if (record.state !== "CONNECTED" || record.trace === null) {
        return reply.status(404).send({ error: "No source trace for this connection yet." });
      }
      // Bounded trace view: candidates with reasons + snippets, no secrets.
      return reply.send({
        traceId: record.trace.traceId,
        sourceId: record.trace.sourceId,
        findingId: record.trace.findingId,
        status: record.trace.status,
        reason: record.trace.reason,
        searchTerms: record.trace.searchTerms,
        candidates: record.trace.candidates.map((c) => ({
          filePath: c.filePath,
          score: c.score,
          matchedTerms: c.matchedTerms,
          matchCount: c.matchCount,
          matchReasons: c.matchReasons,
          snippets: c.snippets,
        })),
      });
    },
  );

  app.get<{ Params: { sourceId: string } }>(
    "/sources/:sourceId/patch",
    async (request, reply) => {
      const record = records.get(request.params.sourceId);
      if (record === undefined) {
        return reply.status(404).send({ error: "Unknown source connection." });
      }
      if (record.runId === null) {
        return reply.status(404).send({ error: "No repair patch for this connection yet." });
      }
      const runDir = join(resolveLiveRunsDir(), record.runId);
      let body: Buffer;
      try {
        body = await readFile(join(runDir, "repair-diff.patch"));
      } catch {
        return reply.status(404).send({ error: "No repair patch for this connection yet." });
      }
      reply.header("content-type", "text/plain; charset=utf-8");
      reply.header(
        "content-disposition",
        `attachment; filename="a11yforge-${record.sourceId}.patch"`,
      );
      return reply.send(body);
    },
  );
}

/** Test-only access to connection state. */
export function getSourceRecordForTests(sourceId: string): SourceRecord | undefined {
  return records.get(sourceId);
}
