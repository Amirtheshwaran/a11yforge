import Fastify from "fastify";
import type { ApiHealth } from "@a11yforge/shared";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "127.0.0.1";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get<{ Reply: ApiHealth }>("/health", async (_request, reply) => {
    const body: ApiHealth = { status: "ok", service: "a11yforge-api" };
    return reply.send(body);
  });

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

void main();
