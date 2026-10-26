import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import type { ApiHealth } from "@a11yforge/shared";
import { registerRunRoutes } from "./runs.js";
import { registerLiveRunRoutes, type PipelineRunner } from "./live-runs.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "127.0.0.1";

export function buildServer(deps: { runner?: PipelineRunner } = {}) {
  const app = Fastify({ logger: true });

  // Minimal CORS for the local console (web on :3000, API on :3001):
  // permissive origin is safe here — the API serves only local run
  // artifacts and never accepts secrets from browsers.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("access-control-allow-headers", "content-type, accept");
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.get<{ Reply: ApiHealth }>("/health", async (_request, reply) => {
    const body: ApiHealth = { status: "ok", service: "a11yforge-api" };
    return reply.send(body);
  });

  registerRunRoutes(app);
  registerLiveRunRoutes(app, deps.runner !== undefined ? { runner: deps.runner } : {});

  return app;
}

async function main(): Promise<void> {
  const app = buildServer();
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
