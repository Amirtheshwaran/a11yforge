"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchExamples, type ExampleScanList } from "../lib/api";

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function dateOf(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Saved home-page scans of well-known sites. Renders nothing when the host has none. */
export function ExampleScans(): React.JSX.Element | null {
  const [list, setList] = useState<ExampleScanList | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { let live = true; void fetchExamples().then((result) => { if (live) setList(result); }); return () => { live = false; }; }, []);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const examples = list?.examples ?? [];
    return needle === "" ? examples : examples.filter((example) => `${example.name} ${hostOf(example.url)}`.toLowerCase().includes(needle));
  }, [list, query]);
  if (list === null || list.examples.length === 0) return null;
  const scannedOn = dateOf(list.examples[0]?.scannedAt ?? list.generatedAt);
  return <section className="example-scans" aria-labelledby="example-scans-title">
    <p className="mono-label">EXAMPLE SCANS</p>
    <h2 id="example-scans-title">See real results first.</h2>
    <p className="example-scans-note">
      Automated checks of {list.examples.length} well-known home pages{scannedOn !== "" ? `, run on ${scannedOn}` : ""}. Each covers one page as the test browser saw it, signed out and sometimes in a regional version, and is not a full audit. Sites change, and sites that blocked the test browser are left out.
    </p>
    <div className="example-scans-filter">
      <label htmlFor="example-filter">Find a site</label>
      <input id="example-filter" type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" aria-describedby="example-count" />
      <p id="example-count" role="status">Showing {shown.length} of {list.examples.length}</p>
    </div>
    <ul className="example-scans-list">
      {shown.map((example) => <li key={example.runId}>
        <Link href={`/explore/${encodeURIComponent(example.runId)}?url=${encodeURIComponent(example.url)}`}>
          <span className="example-name">{example.name}</span>
          <span className="example-host">{hostOf(example.url)}</span>
          <span className="example-count">
            {example.problems === 0 ? "No problems found by these checks" : `${example.problems} ${example.problems === 1 ? "problem" : "problems"}`}
            {example.attentionFirst > 0 ? ` · ${example.attentionFirst} need attention first` : ""}
          </span>
        </Link>
      </li>)}
    </ul>
    {shown.length === 0 && <p className="example-scans-empty">No example matches “{query.trim()}”. You can still check that site above.</p>}
  </section>;
}
