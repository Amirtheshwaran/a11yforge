import {
  ExplorationEventSchema,
  ExplorationRunSchema,
  LiveRunEventSchema,
  LiveRunStatusSchema,
  RunViewModelSchema,
  type ApiHealth,
  type ExplorationEvent,
  type ExplorationRun,
  type LiveRunEvent,
  type LiveRunStatus,
  type RunSummary,
  type RunViewModel,
} from "@a11yforge/shared";

export type { ApiHealth, ExplorationEvent, ExplorationRun, LiveRunEvent, LiveRunStatus, RunSummary, RunViewModel };

export function apiBase(): string {
  const fromEnv = process.env["NEXT_PUBLIC_API_URL"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:3001";
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${apiBase()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string" && body.error !== "") detail = body.error;
    } catch {
      /* keep status text */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return (await res.json()) as unknown;
}

/** Deployment health: safe booleans only (never keys, paths, or env values). */
export async function fetchHealth(): Promise<ApiHealth | null> {
  try {
    const body = (await getJson("/health")) as ApiHealth;
    if (
      typeof body !== "object" ||
      body === null ||
      (body as ApiHealth).status !== "ok" ||
      typeof (body as ApiHealth).modelConfigured !== "boolean"
    ) {
      return null;
    }
    return body as ApiHealth;
  } catch {
    return null;
  }
}

export async function fetchRuns(): Promise<RunSummary[]> {
  const body = (await getJson("/runs")) as { runs: RunSummary[] };
  if (!Array.isArray(body.runs)) throw new Error("malformed /runs response");
  return body.runs;
}

export async function fetchRun(runId: string): Promise<RunViewModel> {
  if (runId === "demo") {
    return RunViewModelSchema.parse(await getJson("/runs/demo"));
  }
  return RunViewModelSchema.parse(
    await getJson(`/runs/${encodeURIComponent(runId)}`),
  );
}

export async function fetchArtifactText(url: string): Promise<string> {
  const res = await fetch(`${apiBase()}${url}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`artifact unavailable (${res.status})`);
  return res.text();
}

/** Absolute API URL for an opaque artifact path (img tags need this). */
export function artifactSrc(url: string): string {
  return `${apiBase()}${url}`;
}

export interface StartRunResult {
  runId: string;
  alreadyRunning: boolean;
}

/** Start one autonomous repair run. 409 means a run is already active. */
export async function startRun(): Promise<StartRunResult> {
  const res = await fetch(`${apiBase()}/runs`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    runId?: string;
    error?: string;
  };
  if (res.status === 202 && typeof body.runId === "string") {
    return { runId: body.runId, alreadyRunning: false };
  }
  if (res.status === 409 && typeof body.runId === "string") {
    return { runId: body.runId, alreadyRunning: true };
  }
  throw new Error(
    typeof body.error === "string" && body.error !== ""
      ? `${res.status} ${body.error}`
      : `Could not start run (${res.status}).`,
  );
}

export async function fetchRunStatus(runId: string): Promise<LiveRunStatus> {
  return LiveRunStatusSchema.parse(await getJson(`/runs/${encodeURIComponent(runId)}/status`));
}

/** Subscribe to a run's Server-Sent Event stream. Returns an unsubscribe fn. */
export function subscribeRunEvents(
  runId: string,
  onEvent: (event: LiveRunEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`${apiBase()}/runs/${encodeURIComponent(runId)}/events`);
  source.onmessage = (message) => {
    try {
      onEvent(LiveRunEventSchema.parse(JSON.parse(message.data as string) as unknown));
    } catch {
      /* ignore one malformed frame; the status poll still converges */
    }
  };
  source.onerror = () => {
    onError();
  };
  return () => {
    source.close();
  };
}

/** Short display form of a run id for selectors. */
export function shortRunId(runId: string): string {
  return runId.length > 24 ? runId.slice(0, 24) + "…" : runId;
}

// ---------------------------------------------------------------------------
// Universal exploration client (Phase 8 product experience)
// ---------------------------------------------------------------------------

export async function startExploration(url: string): Promise<string> {
  const res = await fetch(`${apiBase()}/explorations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
  if (res.status === 202 && typeof body.runId === "string") return body.runId;
  throw new Error(
    typeof body.error === "string" && body.error !== ""
      ? body.error
      : `Could not start the test (${res.status}).`,
  );
}

export async function fetchExploration(runId: string): Promise<ExplorationRun | null> {
  const body = (await getJson(`/explorations/${encodeURIComponent(runId)}`)) as {
    target?: unknown;
  };
  // While the run is still going the API returns a bare status stub; the
  // finished run carries the full target + findings payload.
  if (typeof body !== "object" || body === null || body.target === undefined) return null;
  return ExplorationRunSchema.parse(body);
}

/** Subscribe to an exploration's event stream. Returns an unsubscribe fn. */
export function subscribeExplorationEvents(
  runId: string,
  onEvent: (event: ExplorationEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`${apiBase()}/explorations/${encodeURIComponent(runId)}/events`);
  source.onmessage = (message) => {
    try {
      const raw = JSON.parse(message.data as string) as unknown;
      if (typeof raw === "object" && raw !== null && (raw as { done?: boolean }).done === true) {
        return;
      }
      onEvent(ExplorationEventSchema.parse(raw));
    } catch {
      /* ignore one malformed frame; the run poll still converges */
    }
  };
  source.onerror = () => {
    onError();
  };
  return () => {
    source.close();
  };
}

export async function cancelExploration(runId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/explorations/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Could not cancel (${res.status}).`);
}

/** Absolute API URL for an exploration screenshot artifact. */
export function explorationShotSrc(runId: string, name: string): string {
  return `${apiBase()}/explorations/${encodeURIComponent(runId)}/screenshots/${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// Source connection client (Phase 9 product experience)
// ---------------------------------------------------------------------------

export interface SourceConnectionState {
  sourceId: string;
  state: "CONNECTING" | "CONNECTED" | "FAILED";
  error: string | null;
  runId: string | null;
  findingId: string | null;
  target: {
    sourceId: string;
    kind: string;
    revision: string;
    connectedAt: string;
  } | null;
  inventory: {
    fileCount: number;
    directoryCount: number;
    totalBytes: number;
    manifestFiles: string[];
    lockfiles: string[];
    scripts: { name: string; command: string; source: string }[];
    likelySourceDirs: string[];
  } | null;
  profile: {
    adapter: string;
    installCommand: { command: string; source: string } | null;
    buildCommand: { command: string; source: string } | null;
    startCommand: { command: string; source: string } | null;
    testCommands: { command: string; source: string }[];
    packageManager: string;
    workingDirectory: string;
    confidence: string;
    explanation: string;
  } | null;
}

export interface SourceTraceView {
  traceId: string;
  sourceId: string;
  findingId: string;
  status: "FOUND" | "AMBIGUOUS" | "NOT_FOUND";
  reason: string;
  searchTerms: string[];
  candidates: {
    filePath: string;
    score: number;
    matchedTerms: string[];
    matchCount: number;
    matchReasons: string[];
    snippets: {
      filePath: string;
      startLine: number;
      endLine: number;
      content: string;
      matchedTerms: string[];
    }[];
  }[];
}

/** Connect a public Git repository. 403 means a local path was supplied. */
export async function connectSourceRepo(args: {
  gitUrl: string;
  runId?: string;
  findingId?: string;
}): Promise<string> {
  const res = await fetch(`${apiBase()}/sources/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = (await res.json().catch(() => ({}))) as {
    sourceId?: string;
    error?: string;
  };
  if (res.status === 202 && typeof body.sourceId === "string") return body.sourceId;
  throw new Error(
    typeof body.error === "string" && body.error !== ""
      ? body.error
      : `Could not connect source (${res.status}).`,
  );
}

export async function fetchSourceConnection(
  sourceId: string,
): Promise<SourceConnectionState> {
  return (await getJson(`/sources/${encodeURIComponent(sourceId)}`)) as SourceConnectionState;
}

export async function fetchSourceTrace(sourceId: string): Promise<SourceTraceView | null> {
  try {
    return (await getJson(
      `/sources/${encodeURIComponent(sourceId)}/trace`,
    )) as SourceTraceView;
  } catch {
    return null;
  }
}
