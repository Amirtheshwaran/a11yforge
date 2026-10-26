import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import { dirname, join } from "node:path";
import { findWorkspaceRoot } from "./workspace.js";

/**
 * Boots the broken-shop fixture dev server for scans and smoke tests.
 * The caller owns the returned `stop()` — always call it (the scan-fixture
 * script does so in a `finally`).
 */

export const FIXTURE_PORT = 3002;
// 127.0.0.1 (not "localhost") on purpose: it binds deterministically to IPv4
// and stays clear of gateway proxies that some sandboxes install for
// bare "localhost" hostnames.
export const FIXTURE_HOST = "127.0.0.1";
export const FIXTURE_URL = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`;

export interface FixtureServer {
  url: string;
  stop: () => Promise<void>;
}

export function fixtureDir(): string {
  // The scanner stays independent from the apps it scans: no dependency on
  // the fixture package, just a path derived from the workspace root.
  return join(findWorkspaceRoot(), "fixtures", "broken-shop");
}

function viteBin(fixture: string): string {
  // Resolve via the package root: vite's exports map does not expose
  // ./bin/vite.js as an importable subpath.
  const fixtureRequire = createRequire(join(fixture, "package.json"));
  const vitePkgPath = fixtureRequire.resolve("vite/package.json");
  return join(dirname(vitePkgPath), "bin", "vite.js");
}

interface PollResult {
  ok: boolean;
  detail: string;
}

function pollOnce(host: string, port: number): Promise<PollResult> {
  // Raw TCP on purpose: this sandbox's Node HTTP stack routes even
  // loopback requests through the gateway proxy (ignoring NO_PROXY),
  // which answers 502. A bare socket stays direct.
  return new Promise((resolve) => {
    const socket = new Socket();
    let response = "";
    const done = (result: PollResult): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2000);
    socket.on("timeout", () => done({ ok: false, detail: "timeout" }));
    socket.on("error", (error) =>
      done({ ok: false, detail: error.message }),
    );
    socket.on("data", (chunk) => {
      response += chunk.toString("latin1");
    });
    socket.on("close", () => {
      const match = /^HTTP\/\d(?:\.\d)?\s+(\d+)/.exec(response);
      const status = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      if (status >= 200 && status < 300) {
        done({ ok: true, detail: `HTTP ${status}` });
      } else {
        done({
          ok: false,
          detail: status ? `HTTP ${status}` : "no HTTP response",
        });
      }
    });
    socket.connect(port, host, () => {
      socket.write(
        `GET / HTTP/1.0\r\nHost: ${host}\r\nConnection: close\r\n\r\n`,
      );
    });
  });
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const target = new URL(url);
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown error";
  while (Date.now() < deadline) {
    const attempt = await pollOnce(
      target.hostname,
      Number.parseInt(target.port || "80", 10),
    );
    if (attempt.ok) {
      return;
    }
    lastError = attempt.detail;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Fixture server did not become ready at ${url} in time (${lastError})`,
  );
}

export async function startFixtureServer(
  timeoutMs = 60_000,
): Promise<FixtureServer> {
  const dir = fixtureDir();
  const child: ChildProcess = spawn(
    process.execPath,
    [
      viteBin(dir),
      "--port",
      String(FIXTURE_PORT),
      "--strictPort",
      "--host",
      FIXTURE_HOST,
    ],
    { cwd: dir, stdio: "pipe", env: process.env },
  );

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const earlyExit = new Promise<never>((_resolve, reject) => {
    child.on("exit", (code) => {
      reject(
        new Error(
          `Fixture server exited early with code ${String(code)}. Output:\n${output.slice(-2000)}`,
        ),
      );
    });
  });

  try {
    await Promise.race([
      waitForHttpOk(FIXTURE_URL, timeoutMs),
      earlyExit,
    ]);
  } catch (error) {
    await kill(child);
    throw error;
  }

  return {
    url: FIXTURE_URL,
    stop: () => kill(child),
  };
}

async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.on("exit", () => resolve(true));
    }),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 5000);
    }),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
  }
}
