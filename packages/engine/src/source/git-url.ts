/**
 * Phase 9 — safe Git URL validation.
 *
 * Only public `https://` Git URLs are accepted. Rejected: local paths,
 * `file://` transports, `ssh://` / scp-like (`git@host:…`) transports that
 * need credentials, non-Git schemes, embedded credentials, and private
 * network hosts (unless explicitly allowed for local development).
 * Displayed errors never echo credentials.
 */

export interface ParsedGitSource {
  /** Normalized clone URL (credentials stripped — there must be none). */
  cloneUrl: string;
  /** Hostname, e.g. `github.com`. */
  host: string;
  /** Path without leading/trailing slashes or a `.git` suffix. */
  repoPath: string;
}

export class GitUrlRejectedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GitUrlRejectedError";
    this.code = code;
  }
}

/** Hostnames that are never valid remote Git targets. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
]);

function isPrivateHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true;
  return false;
}

/**
 * Validate a user-supplied public Git repository URL.
 *
 * @param allowPrivate allow loopback/private hosts (local CLI development
 * only — never enabled by the hosted web product).
 */
export function parseGitSource(
  rawUrl: string,
  options: { allowPrivate?: boolean | undefined } = {},
): ParsedGitSource {
  const input = rawUrl.trim();
  if (input.length === 0 || input.length > 2048) {
    throw new GitUrlRejectedError(
      "invalid-url",
      "That repository address is not a valid public Git URL.",
    );
  }
  // scp-like SSH syntax (`git@host:owner/repo`) carries credentials by design.
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/.test(input)) {
    throw new GitUrlRejectedError(
      "ssh-transport",
      "SSH repository addresses are not supported — use a public https:// Git URL.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new GitUrlRejectedError(
      "invalid-url",
      "That repository address is not a valid public Git URL.",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new GitUrlRejectedError(
      "unsafe-scheme",
      "Only public https:// Git repository URLs can be connected.",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new GitUrlRejectedError(
      "credentials-in-url",
      "Repository URLs must not contain credentials.",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) {
    throw new GitUrlRejectedError(
      "invalid-url",
      "That repository address is not a valid public Git URL.",
    );
  }
  if (!options.allowPrivate && isPrivateHostname(host)) {
    throw new GitUrlRejectedError(
      "private-host",
      "That address looks like a private host. Connect a public repository instead.",
    );
  }
  const repoPath = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/^\/+/, "");
  if (repoPath.length === 0 || repoPath.includes("..")) {
    throw new GitUrlRejectedError(
      "invalid-url",
      "That repository address is not a valid public Git URL.",
    );
  }
  return { cloneUrl: `https://${parsed.host}/${repoPath}.git`, host, repoPath };
}

/**
 * Strip anything credential-like from a git error before display or logs.
 * Never echoes the URL's userinfo, tokens, or absolute host paths.
 */
export function sanitizeGitError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const stripped = raw
    .replace(/https?:\/\/[^/\s@]*@/g, "https://")
    .replace(/token\s*[:=]\s*\S+/gi, "token:[redacted]")
    .replace(/\/home\/[^\s]*/g, "[home]")
    .slice(0, 500);
  return stripped.length > 0
    ? stripped
    : "The repository could not be connected.";
}
