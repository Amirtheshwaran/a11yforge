import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Abuse protection for the public API: per-client fixed-window rate limits,
 * a global daily cap on paid model runs, and an optional run passcode.
 *
 * Everything is in memory, matching the rest of the API (one server
 * process, no database). A restart resets the counters, so the daily cap
 * is a spend guard, not an accounting ledger.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may try again (0 when allowed). */
  retryAfterSeconds: number;
}

/** Fixed-window counter keyed by client (normally the client IP). */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`limit must be a non-negative integer, got: ${limit}`);
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error(`windowMs must be positive, got: ${windowMs}`);
    }
  }

  /** Count one attempt for `key`; refuses once the window's limit is reached. */
  hit(key: string): RateLimitDecision {
    const now = this.now();
    this.prune(now);
    const current = this.windows.get(key);
    const window =
      current !== undefined && now - current.start < this.windowMs
        ? current
        : { start: now, count: 0 };
    if (window.count >= this.limit) {
      this.windows.set(key, window);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000)),
      };
    }
    window.count += 1;
    this.windows.set(key, window);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drop expired windows so memory stays bounded by active clients. */
  private prune(now: number): void {
    if (this.windows.size < 1024) return;
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

/** Global cap on paid runs per UTC day, across all clients. */
export class DailyCap {
  private day = "";
  private used = 0;

  constructor(
    readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`limit must be a non-negative integer, got: ${limit}`);
    }
  }

  private roll(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }

  /** Reserve one unit for today; false once the cap is spent. */
  take(): boolean {
    this.roll();
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }

  /** Return a unit reserved by `take()` when the run never started. */
  release(): void {
    this.roll();
    if (this.used > 0) this.used -= 1;
  }

  get remaining(): number {
    this.roll();
    return this.limit - this.used;
  }

  /** Seconds until the next UTC midnight, when the cap resets. */
  secondsUntilReset(): number {
    const now = this.now();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
  }
}

/** Constant-time passcode comparison (hashing equalizes the lengths). */
export function passcodeMatches(supplied: string, expected: string): boolean {
  const a = createHash("sha256").update(supplied, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const RUN_PASSCODE_ENV = "A11YFORGE_RUN_PASSCODE";
export const RUN_PASSCODE_HEADER = "x-a11yforge-passcode";
export const MAX_RUNS_PER_DAY_ENV = "A11YFORGE_MAX_RUNS_PER_DAY";
export const RUNS_PER_HOUR_PER_CLIENT_ENV = "A11YFORGE_RUNS_PER_HOUR_PER_CLIENT";
export const SCANS_PER_HOUR_PER_CLIENT_ENV = "A11YFORGE_SCANS_PER_HOUR_PER_CLIENT";
export const SOURCES_PER_HOUR_PER_CLIENT_ENV = "A11YFORGE_SOURCES_PER_HOUR_PER_CLIENT";
export const TRUST_PROXY_HOPS_ENV = "A11YFORGE_TRUST_PROXY_HOPS";

export const DEFAULT_MAX_RUNS_PER_DAY = 20;
export const DEFAULT_RUNS_PER_HOUR_PER_CLIENT = 2;
export const DEFAULT_SCANS_PER_HOUR_PER_CLIENT = 10;
export const DEFAULT_SOURCES_PER_HOUR_PER_CLIENT = 10;
export const DEFAULT_TRUST_PROXY_HOPS = 1;

const HOUR_MS = 60 * 60 * 1000;

/** Read a non-negative integer setting; invalid values fall back to the default. */
export function readLimit(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** The configured run passcode, or null when runs need none. */
export function runPasscode(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[RUN_PASSCODE_ENV];
  return value !== undefined && value !== "" ? value : null;
}

export interface ApiLimits {
  runsPerClient: FixedWindowLimiter;
  runsPerDay: DailyCap;
  scansPerClient: FixedWindowLimiter;
  sourcesPerClient: FixedWindowLimiter;
}

export function createApiLimits(
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): ApiLimits {
  return {
    runsPerClient: new FixedWindowLimiter(
      readLimit(env, RUNS_PER_HOUR_PER_CLIENT_ENV, DEFAULT_RUNS_PER_HOUR_PER_CLIENT),
      HOUR_MS,
      now,
    ),
    runsPerDay: new DailyCap(readLimit(env, MAX_RUNS_PER_DAY_ENV, DEFAULT_MAX_RUNS_PER_DAY), now),
    scansPerClient: new FixedWindowLimiter(
      readLimit(env, SCANS_PER_HOUR_PER_CLIENT_ENV, DEFAULT_SCANS_PER_HOUR_PER_CLIENT),
      HOUR_MS,
      now,
    ),
    sourcesPerClient: new FixedWindowLimiter(
      readLimit(env, SOURCES_PER_HOUR_PER_CLIENT_ENV, DEFAULT_SOURCES_PER_HOUR_PER_CLIENT),
      HOUR_MS,
      now,
    ),
  };
}
