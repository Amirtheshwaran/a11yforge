import {
  LiveRunEventSchema,
  LiveRunStatusSchema,
  RunViewModelSchema,
  type ApiHealth,
  type LiveRunEvent,
  type LiveRunStatus,
  type RunSummary,
  type RunViewModel,
} from "@a11yforge/shared";

export type { ApiHealth, LiveRunEvent, LiveRunStatus, RunSummary, RunViewModel };

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
