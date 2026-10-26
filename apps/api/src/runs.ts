import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  containsNoSecrets,
  isAllowedArtifactName,
} from "@a11yforge/shared";
import {
  buildRunViewModel,
  findDemoRunId,
  listRunSummaries,
  RunArtifactError,
} from "@a11yforge/engine";

/**
 * Phase 6 read-model API.
 *
 * Serves ONLY typed projections of existing local run artifacts
 * (`.a11yforge/runs/<run-id>/`). No repair intelligence, no model calls,
 * no filesystem writes, no arbitrary file access:
 *
 * - run ids and artifact names are allow-list validated (no traversal),
 * - absolute paths are never exposed (view model carries display forms),
 * - secrets are never included (fail-closed guard before every send),
 * - missing artifacts produce a useful 404 empty-state, never fake data.
 */

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
  ".patch": "text/plain; charset=utf-8",
};

/** Local runs root: explicit env override, else nearest `.a11yforge/runs`. */
export function resolveRunsDir(): string {
  const override = process.env["A11YFORGE_RUNS_DIR"];
  if (override !== undefined && override !== "") return resolve(override);
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(dir, ".a11yforge", "runs");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), ".a11yforge", "runs");
}

function artifactUrlFor(runId: string, fileName: string): string {
  return `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(fileName)}`;
}

function errorBody(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof RunArtifactError) {
    if (error.code === "RUN_NOT_FOUND") {
      return { status: 404, body: { error: "unknown run" } };
    }
    if (error.code === "ARTIFACT_MISSING") {
      return {
        status: 404,
        body: { error: "run is incomplete: required artifacts are missing" },
      };
    }
    return {
      status: 500,
      body: { error: "run artifacts are invalid" },
    };
  }
  return { status: 500, body: { error: "unexpected read-model error" } };
}

export function registerRunRoutes(app: FastifyInstance): void {
  app.get("/runs", async (_request, reply) => {
    const runsDir = resolveRunsDir();
    const runs = await listRunSummaries(runsDir);
    return reply.send({ runs });
  });

  app.get("/runs/demo", async (_request, reply) => {
    const runsDir = resolveRunsDir();
    const demoId = await findDemoRunId(runsDir);
    if (demoId === null) {
      return reply.status(404).send({
        error:
          "no completed repair run available locally: run pnpm scenario:fixture (plus the Phase 3–5 pipeline) to produce artifacts",
      });
    }
    try {
      const view = await buildRunViewModel(runsDir, demoId, artifactUrlFor);
      if (!containsNoSecrets(view)) {
        return reply.status(500).send({ error: "run artifacts failed safety screening" });
      }
      return reply.send(view);
    } catch (error) {
      const { status, body } = errorBody(error);
      return reply.status(status).send(body);
    }
  });

  app.get<{ Params: { runId: string } }>(
    "/runs/:runId",
    async (request, reply) => {
      if (!RUN_ID_PATTERN.test(request.params.runId)) {
        return reply.status(404).send({ error: "unknown run" });
      }
      const runsDir = resolveRunsDir();
      try {
        const view = await buildRunViewModel(runsDir, request.params.runId, artifactUrlFor);
        if (!containsNoSecrets(view)) {
          return reply.status(500).send({ error: "run artifacts failed safety screening" });
        }
        return reply.send(view);
      } catch (error) {
        const { status, body } = errorBody(error);
        return reply.status(status).send(body);
      }
    },
  );

  app.get<{ Params: { runId: string; name: string } }>(
    "/runs/:runId/artifacts/:name",
    async (request, reply) => {
      const { runId, name } = request.params;
      if (!RUN_ID_PATTERN.test(runId) || !isAllowedArtifactName(name)) {
        return reply.status(404).send({ error: "unknown artifact" });
      }
      const runsDir = resolveRunsDir();
      const runDir = resolve(runsDir, runId);
      if (!runDir.startsWith(resolve(runsDir) + sep)) {
        return reply.status(404).send({ error: "unknown artifact" });
      }
      const filePath = resolve(runDir, name);
      if (!filePath.startsWith(runDir + sep)) {
        return reply.status(404).send({ error: "unknown artifact" });
      }
      let data: Buffer;
      try {
        data = await readFile(filePath);
      } catch {
        return reply.status(404).send({ error: "unknown artifact" });
      }
      const ext = name.slice(name.lastIndexOf("."));
      const contentType = ARTIFACT_CONTENT_TYPES[ext] ?? "application/octet-stream";
      return reply
        .header("content-type", contentType)
        .header("cache-control", "public, max-age=3600")
        .send(data);
    },
  );
}
