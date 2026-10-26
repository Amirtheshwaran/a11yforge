import { RunViewModelSchema, type RunSummary, type RunViewModel } from "@a11yforge/shared";

export type { RunSummary, RunViewModel };

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

/** Short display form of a run id for selectors. */
export function shortRunId(runId: string): string {
  return runId.length > 24 ? runId.slice(0, 24) + "…" : runId;
}
