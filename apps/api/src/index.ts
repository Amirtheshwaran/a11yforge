import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import type { ApiHealth } from "@a11yforge/shared";
import { MODEL_API_KEY_ENV } from "@a11yforge/meta";
import { registerRunRoutes, resolveDataDir, resolveRunsDirWithSource } from "./runs.js";
import { registerExplorationRoutes } from "./explorations.js";
import { registerLiveRunRoutes, type PipelineRunner } from "./live-runs.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "127.0.0.1";
const VERSION = process.env["A11YFORGE_VERSION"] ?? "0.7.0";
const CORS_ORIGIN = process.env["A11YFORGE_CORS_ORIGIN"] ?? "*";

export function isModelConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[MODEL_API_KEY_ENV] !== undefined && env[MODEL_API_KEY_ENV] !== "";
}

/** True when the runtime data directory exists and is writable. */
export async function isDataDirWritable(): Promise<boolean> {
  const dir = resolveDataDir();
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildServer(deps: { runner?: PipelineRunner } = {}) {
  const app = Fastify({ logger: true });

  // CORS for the console (web on :3000, API on :3001 by default).
  // Configurable via A11YFORGE_CORS_ORIGIN; the permissive default is safe
  // because the API serves only run artifacts and never accepts secrets
  // from browsers.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("access-control-allow-origin", CORS_ORIGIN);
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("access-control-allow-headers", "content-type, accept");
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.get<{ Reply: ApiHealth }>("/health", async (_request, reply) => {
    const { source } = resolveRunsDirWithSource();
    const body: ApiHealth = {
      status: "ok",
      service: "a11yforge-api",
      version: VERSION,
      modelConfigured: isModelConfigured(),
      demoMode: source,
      dataDirWritable: await isDataDirWritable(),
    };
    return reply.send(body);
  });

  registerRunRoutes(app);
  registerLiveRunRoutes(app, deps.runner !== undefined ? { runner: deps.runner } : {});
  registerExplorationRoutes(app);

  return app;
}

/**
 * Production startup validation: warn loudly about degraded modes, but
 * never crash — the recorded demo stays usable without credentials,
 * a browser, or a writable volume.
 */
export async function validateStartup(): Promise<{
  modelConfigured: boolean;
  demoSource: string;
  dataDirWritable: boolean;
}> {
  const modelConfigured = isModelConfigured();
  const { source } = resolveRunsDirWithSource();
  const dataDirWritable = await isDataDirWritable();
  return { modelConfigured, demoSource: source, dataDirWritable };
}

async function main(): Promise<void> {
  const app = buildServer();
  const { modelConfigured, demoSource, dataDirWritable } = await validateStartup();
  if (!modelConfigured) {
    app.log.warn(
      "MODEL_API_KEY is not configured: live runs return 503; recorded demo mode remains available.",
    );
  }
  app.log.info(`recorded demo source: ${demoSource}`);
  if (!dataDirWritable) {
    app.log.warn(
      `runtime data directory is not writable (${resolveDataDir()}): live runs will fail; recorded demo mode remains available.`,
    );
  }
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  void main();
}
