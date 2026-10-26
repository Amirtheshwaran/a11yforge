import { existsSync, readdirSync } from "node:fs";
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

/**
 * Runtime data directory: `A11YFORGE_DATA_DIR` when set (production), else
 * the repository working tree (local development). Repair workspaces and
 * live-run artifacts are always written under this root — never into
 * immutable application source.
 */
export function resolveDataDir(): string {
  const override = process.env["A11YFORGE_DATA_DIR"];
  if (override !== undefined && override !== "") return resolve(override);
  return process.cwd();
}

/** Writable runs root for LIVE runs (created on demand by the pipeline). */
export function resolveLiveRunsDir(): string {
  const override = process.env["A11YFORGE_RUNS_DIR"];
  if (override !== undefined && override !== "") return resolve(override);
  return join(resolveDataDir(), ".a11yforge", "runs");
}

/**
 * Committed recorded-demo bundle (`demo/accepted-run/`): the versioned,
 * sanitized ACCEPTED run that ships with the repository. Found by walking
 * up from the working directory; null when absent (e.g. partial checkout).
 */
export function findBundledDemoDir(): string | null {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, "demo", "accepted-run");
    if (
      existsSync(candidate) &&
      existsSync(join(candidate, "manifest.json"))
    ) {
      return candidate;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export type RunsSource = "local" | "bundled-recorded";

/**
 * Effective read root for run views: local artifacts when a run exists,
 * else the committed recorded-demo bundle so the console stays useful
 * without `.a11yforge/`, without credentials, and without a browser.
 * Recorded views are always labeled RECORDED by the UI — never live.
 */
export function resolveRunsDirWithSource(): { dir: string; source: RunsSource } {
  const local = resolveLiveRunsDir();
  try {
    if (existsSync(local) && readdirSync(local).length > 0) {
      return { dir: local, source: "local" };
    }
  } catch {
    /* fall through to the bundled demo */
  }
  const bundled = findBundledDemoDir();
  if (bundled !== null) return { dir: bundled, source: "bundled-recorded" };
  return { dir: local, source: "local" };
}

/** Local runs root: live artifacts, else the bundled recorded demo. */
export function resolveRunsDir(): string {
  return resolveRunsDirWithSource().dir;
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
