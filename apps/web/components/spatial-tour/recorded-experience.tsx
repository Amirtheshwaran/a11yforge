"use client";

import { useEffect, useMemo, useState } from "react";
import type { RunViewModel } from "@a11yforge/shared";
import { artifactSrc, fetchArtifactText, fetchRun } from "../../lib/api";
import { recordedTourModel, type RecordedSpatialReplay } from "../../lib/tour-model";
import { parseRecordedSpatialReplay } from "../../lib/recorded-spatial-replay";
import { SpatialTour } from "./spatial-tour";

export function RecordedExperience({ home = false }: { home?: boolean }): React.JSX.Element {
  const [data, setData] = useState<{ run: RunViewModel; diffs: Record<number, string>; replay: RecordedSpatialReplay | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetchRun("demo").then(async (run) => {
      const [entries, candidateReplay] = await Promise.all([
        Promise.all(run.attempts.map(async (attempt) => [attempt.attempt, attempt.diffUrl === null ? "" : await fetchArtifactText(attempt.diffUrl).catch(() => "Recorded patch unavailable.")] as const)),
        fetch("/demo/spatial-replay/evidence.json").then(async (response) => response.ok ? parseRecordedSpatialReplay(await response.json() as unknown) : null).catch(() => null),
      ]);
      let replay = candidateReplay;
      if (replay !== null) {
        const acceptedPatch = entries.at(-1)?.[1] ?? "";
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(acceptedPatch.replace(/\r\n/g, "\n")));
        const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hex !== replay.patchSha256) replay = null;
      }
      if (live) setData({ run, diffs: Object.fromEntries(entries), replay });
    }).catch((err: unknown) => { if (live) setError(err instanceof Error ? err.message : "Recorded evidence could not be loaded."); });
    return () => { live = false; };
  }, []);
  const model = useMemo(() => data === null ? null : recordedTourModel(data.run, artifactSrc, data.diffs, home, data.replay), [data, home]);
  if (model === null) return <section className="tour-awaiting" role="status"><p className="mono-label">RECORDED REAL REPAIR</p><h1>{home ? "See where your website is hard to use." : "Watch a real repair, from failure to proof."}</h1><p>{error ?? "Loading the recorded browser evidence…"}</p>{error !== null && <button type="button" onClick={() => window.location.reload()}>Retry recorded evidence</button>}</section>;
  return <SpatialTour model={model} />;
}
