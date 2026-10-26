import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import type { ApiHealth } from "@a11yforge/shared";
import { registerRunRoutes } from "./runs.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "127.0.0.1";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get<{ Reply: ApiHealth }>("/health", async (_request, reply) => {
    const body: ApiHealth = { status: "ok", service: "a11yforge-api" };
    return reply.send(body);
  });

  registerRunRoutes(app);

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
