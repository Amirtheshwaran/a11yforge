import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Phase 8 — SSRF-safe target validation.
 *
 * Arbitrary user-supplied URLs are dangerous to fetch server-side: a "safe"
 * public URL can resolve to (or redirect into) loopback, private networks,
 * link-local cloud metadata endpoints, or other non-routable ranges. This
 * module validates every navigation target — entry URLs and every redirect
 * hop — before the browser is allowed to fetch it.
 *
 * Default hosted behavior rejects anything that is not a publicly routable
 * address over http/https. Local developers who intentionally test
 * loopback/private targets opt in with:
 *
 *   A11YFORGE_ALLOW_PRIVATE_TARGETS=true
 *
 * That flag must never be enabled on an untrusted public deployment.
 *
 * Fail-closed: unresolvable hostnames, unsupported schemes, credentials in
 * the URL, and any classification failure all reject.
 */

export const ALLOW_PRIVATE_TARGETS_ENV = "A11YFORGE_ALLOW_PRIVATE_TARGETS";

export function isPrivateTargetsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ALLOW_PRIVATE_TARGETS_ENV] === "true";
}

export type TargetRejectionCode =
  | "unsupported-scheme"
  | "invalid-url"
  | "credentials-present"
  | "unresolvable-host"
  | "blocked-address"
  | "private-targets-disabled";

export class TargetRejectedError extends Error {
  readonly code: TargetRejectionCode;
  constructor(code: TargetRejectionCode, message: string) {
    super(message);
    this.name = "TargetRejectedError";
    this.code = code;
  }
}

/** Parse an IPv4 dotted quad into 4 octets, or null when not IPv4. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (part === "" || !/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d) to its inner IPv4 string. */
function unwrapIpv6(ip: string): string {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1] !== undefined) return mapped[1];
  return ip;
}

/**
 * True when a literal IP address must never be fetched by default:
 * loopback, private networks, link-local (covers cloud metadata
 * endpoints such as 169.254.169.254), carrier-grade NAT, multicast,
 * reserved, documentation, unspecified, and broadcast ranges.
 */
export function ipIsBlocked(ip: string): boolean {
  const unwrapped = unwrapIpv6(ip);
  const v4 = parseIpv4(unwrapped);
  if (v4 !== null) {
    const [a, b] = v4;
    if (a === 127) return true; // loopback 127.0.0.0/8
    if (a === 10) return true; // private 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
    if (a === 192 && b === 168) return true; // private 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local (metadata endpoints)
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 0) return true; // "this network" 0.0.0.0/8
    if (a === 192 && b === 0 && v4[2] === 2) return true; // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark testing
    if (a === 198 && b === 51 && v4[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && v4[2] === 113) return true; // TEST-NET-3
    if (a === 192 && b === 88 && v4[2] === 99) return true; // 6to4 relay
    if (a >= 224 && a <= 239) return true; // multicast
    if (a >= 240) return true; // reserved + broadcast
    return false;
  }
  // IPv6 literals (bracket-stripped by callers via URL.hostname).
  const lower = unwrapped.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("2001:db8")) return true; // documentation
  return false;
}

export interface ValidatedTarget {
  /** Canonical fetchable URL (credentials stripped — none are allowed). */
  normalizedUrl: string;
  origin: string;
  hostname: string;
}

export interface ValidateTargetOptions {
  allowPrivate?: boolean | undefined;
  /** Resolve and classify hostnames (DNS). Disable only in unit tests. */
  resolveDns?: boolean | undefined;
}

/**
 * Validate one navigation target: scheme, shape, DNS resolution, and
 * address classification. Returns the canonical URL to fetch.
 */
export async function validateTargetUrl(
  raw: string,
  options: ValidateTargetOptions = {},
): Promise<ValidatedTarget> {
  const allowPrivate = options.allowPrivate ?? isPrivateTargetsAllowed();
  const resolveDns = options.resolveDns ?? true;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new TargetRejectedError("invalid-url", `That address could not be understood: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TargetRejectedError(
      "unsupported-scheme",
      `Only http and https addresses can be tested (received "${parsed.protocol}").`,
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new TargetRejectedError(
      "credentials-present",
      "Addresses containing login credentials cannot be tested.",
    );
  }

  // Canonical form: lowercase host, resolved dot segments, dropped fragment.
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  const normalizedUrl = parsed.toString();
  const hostname = parsed.hostname;
  const origin = parsed.origin;

  const family = isIP(hostname);
  if (family !== 0) {
    // IP literal: classify directly, no DNS involved.
    const literal = family === 6 && hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    if (ipIsBlocked(literal) && !allowPrivate) {
      throw new TargetRejectedError(
        "blocked-address",
        "That address points to a private or non-routable network, which cannot be tested on this server.",
      );
    }
    return { normalizedUrl, origin, hostname };
  }

  if (!resolveDns) {
    return { normalizedUrl, origin, hostname };
  }

  let addresses: string[];
  try {
    const resolved = await lookup(hostname, { all: true });
    addresses = resolved.map((entry) => entry.address);
  } catch {
    throw new TargetRejectedError(
      "unresolvable-host",
      `That website could not be reached (DNS did not resolve "${hostname}").`,
    );
  }
  if (addresses.length === 0) {
    throw new TargetRejectedError(
      "unresolvable-host",
      `That website could not be reached (DNS did not resolve "${hostname}").`,
    );
  }
  // Every resolved address must be publicly routable — one private record
  // in the set is enough to reject (DNS rebinding protection).
  if (!allowPrivate && addresses.some((address) => ipIsBlocked(unwrapIpv6(address)))) {
    throw new TargetRejectedError(
      "private-targets-disabled",
      "That address resolves to a private or internal network, which cannot be tested on this server.",
    );
  }
  return { normalizedUrl, origin, hostname };
}

/**
 * Per-run request guard for the live browser context: caches the safety
 * verdict per hostname so redirect hops and sub-resource navigations are
 * revalidated without a DNS lookup per request.
 */
export function createTargetGuard(options: ValidateTargetOptions = {}): {
  checkUrl: (url: string) => Promise<boolean>;
  rejectionReason: (url: string) => Promise<string | null>;
} {
  const verdicts = new Map<string, { ok: boolean; reason: string | null }>();

  async function verdictFor(url: string): Promise<{ ok: boolean; reason: string | null }> {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return { ok: false, reason: `That address could not be understood: ${url}` };
    }
    const cached = verdicts.get(host);
    if (cached !== undefined) return cached;
    try {
      await validateTargetUrl(url, options);
      const verdict = { ok: true, reason: null as string | null };
      verdicts.set(host, verdict);
      return verdict;
    } catch (error) {
      const reason =
        error instanceof TargetRejectedError ? error.message : "That address cannot be tested.";
      const verdict = { ok: false, reason };
      verdicts.set(host, verdict);
      return verdict;
    }
  }

  return {
    checkUrl: async (url: string) => (await verdictFor(url)).ok,
    rejectionReason: async (url: string) => (await verdictFor(url)).reason,
  };
}
