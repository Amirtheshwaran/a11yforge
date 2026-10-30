import { spawn } from "node:child_process";

/**
 * Phase 9 — isolated execution of untrusted repository code.
 *
 * Connected repositories are hostile: package scripts, Makefiles, and
 * setup hooks may be malicious. Build/run/install therefore execute in
 * an isolated environment with bounded runtime, bounded processes,
 * bounded output, no host secrets, and disposable workspaces.
 *
 * Isolation levels (reported honestly in every result):
 * - `docker` — target commands run in a throwaway container: the
 *   workspace bind-mounted read-write, no host env passthrough, no
 *   docker-socket mount, explicit network policy.
 * - `process-disposable` — fallback when Docker is unavailable: the
 *   command runs in a disposable copy with a stripped environment.
 *   Hosted mode refuses this level unless explicitly allowed.
 */

/** Secret names that must never enter the sandbox environment. */
export const SANDBOX_BLOCKED_ENV_PATTERNS: RegExp[] = [
  /^MODEL_API_KEY$/i,
  /^GIT_/i,
  /^GITHUB_/i,
  /^GH_/i,
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE_KEY/i,
  /^AWS_/i,
  /^GOOGLE_/i,
  /^OPENAI/i,
  /^ANTHROPIC/i,
  /^A11YFORGE_/i,
];

/** Small safe allow-list of process variables for the sandbox. */
const SANDBOX_SAFE_ENV_KEYS: ReadonlySet<string> = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_ENV",
  "CI",
  "TERM",
  "SYSTEMROOT",
  "TMPDIR",
]);

export type SandboxIsolation = "docker" | "process-disposable";

export interface SandboxResult {
  isolation: SandboxIsolation;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  /** Bounded combined output (truncated, never huge). */
  output: string;
  truncated: boolean;
  durationMs: number;
}

export interface SandboxRunOptions {
  /** Shell command split into argv (never a raw string — no shell). */
  argv: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  /** Extra safe env (values only; keys still screened). */
  extraEnv?: Record<string, string>;
  network?: "none" | "registry";
  dockerImage?: string;
}

/**
 * Build the sandbox environment: allow-listed keys only, blocked
 * patterns removed even from `extraEnv`. MODEL_API_KEY can never pass.
 */
export function buildSandboxEnv(
  extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (!SANDBOX_SAFE_ENV_KEYS.has(key)) continue;
    if (SANDBOX_BLOCKED_ENV_PATTERNS.some((re) => re.test(key))) continue;
    env[key] = value;
  }
  for (const [key, value] of Object.entries(extraEnv)) {
    if (SANDBOX_BLOCKED_ENV_PATTERNS.some((re) => re.test(key))) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

export const SANDBOX_DEFAULT_MAX_OUTPUT = 256 * 1024;

function truncateOutput(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n[…truncated…]`, truncated: true };
}

async function runProcessSandboxed(
  options: SandboxRunOptions,
): Promise<SandboxResult> {
  const maxOutput = options.maxOutputBytes ?? SANDBOX_DEFAULT_MAX_OUTPUT;
  const started = Date.now();
  return new Promise((resolve) => {
    const [cmd, ...rest] = options.argv;
    if (cmd === undefined || cmd === "") {
      resolve({
        isolation: "process-disposable",
        command: options.argv.join(" "),
        exitCode: null,
        timedOut: false,
        output: "Empty command refused.",
        truncated: false,
        durationMs: Date.now() - started,
      });
      return;
    }
    const child = spawn(cmd, rest, {
      cwd: options.cwd,
      env: buildSandboxEnv(options.extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: true,
    });
    let output = "";
    let truncated = false;
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > maxOutput) {
        const t = truncateOutput(output, maxOutput);
        output = t.text;
        truncated = true;
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    let settled = false;
    const finish = (result: Omit<SandboxResult, "durationMs" | "command" | "isolation">): void => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) {
          if (process.platform === "win32") {
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
            try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]); } catch { /* ignore */ }
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        }
      } catch {
        // Already exited.
      }
      try { child.stdout?.destroy(); } catch { /* ignore */ }
      try { child.stderr?.destroy(); } catch { /* ignore */ }
      try { child.unref(); } catch { /* ignore */ }
      resolve({
        ...result,
        isolation: "process-disposable",
        command: options.argv.join(" "),
        durationMs: Date.now() - started,
      });
    };
    const timer = setTimeout(() => {
      finish({ exitCode: null, timedOut: true, output, truncated });
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        timedOut: false,
        output: `Could not start command: ${error.message}`.slice(0, maxOutput),
        truncated,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ exitCode: code, timedOut: false, output, truncated });
    });
  });
}

/**
 * Check Docker availability without running untrusted code.
 * Times out quickly; never throws.
 */
export async function isDockerAvailable(timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore.
      }
      resolve(false);
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && out.trim().length > 0);
    });
  });
}

async function runDockerSandboxed(
  options: SandboxRunOptions,
): Promise<SandboxResult> {
  const maxOutput = options.maxOutputBytes ?? SANDBOX_DEFAULT_MAX_OUTPUT;
  const started = Date.now();
  const image = options.dockerImage ?? "node:20-slim";
  const networkFlag =
    options.network === "registry" ? "bridge" : "none";
  // Never mount the docker socket; cloud metadata blocked via host mapping.
  const argv = [
    "docker",
    "run",
    "--rm",
    `--network=${networkFlag}`,
    "--add-host=169.254.169.254:127.0.0.1",
    "--memory=2g",
    "--cpus=2",
    "--pids-limit=256",
    "--user=nobody",
    "-v",
    `${options.cwd}:/work:rw`,
    "-w",
    "/work",
    ...Object.entries(buildSandboxEnv(options.extraEnv)).map(
      ([k, v]) => `--env=${k}=${v ?? ""}`,
    ),
    image,
    ...options.argv,
  ];
  return new Promise((resolve) => {
    const [cmd, ...rest] = argv;
    const child = spawn(cmd as string, rest, {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: true,
    });
    let output = "";
    let truncated = false;
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > maxOutput) {
        const t = truncateOutput(output, maxOutput);
        output = t.text;
        truncated = true;
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    let settled = false;
    const finish = (result: Omit<SandboxResult, "durationMs" | "command" | "isolation">): void => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already exited.
      }
      resolve({
        ...result,
        isolation: "docker",
        command: options.argv.join(" "),
        durationMs: Date.now() - started,
      });
    };
    const timer = setTimeout(() => {
      finish({ exitCode: null, timedOut: true, output, truncated });
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        timedOut: false,
        output: `Could not start container: ${error.message}`.slice(0, maxOutput),
        truncated,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ exitCode: code, timedOut: false, output, truncated });
    });
  });
}

/**
 * Run an untrusted repository command in isolation.
 *
 * Uses Docker when available; otherwise a disposable-dir process run
 * with a stripped environment. Hosted deployments set
 * `A11YFORGE_REQUIRE_DOCKER=true` to refuse the fallback honestly
 * instead of executing untrusted code on the host.
 */
export async function runIsolated(
  options: SandboxRunOptions & { requireDocker?: boolean },
): Promise<SandboxResult> {
  const requireDocker =
    options.requireDocker ?? process.env.A11YFORGE_REQUIRE_DOCKER === "true";
  if (await isDockerAvailable()) {
    return runDockerSandboxed(options);
  }
  if (requireDocker) {
    return {
      isolation: "process-disposable",
      command: options.argv.join(" "),
      exitCode: null,
      timedOut: false,
      output:
        "Refused: Docker is required for untrusted execution here but is unavailable.",
      truncated: false,
      durationMs: 0,
    };
  }
  return runProcessSandboxed(options);
}
