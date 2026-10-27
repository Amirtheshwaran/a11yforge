"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  connectSourceRepo,
  fetchSourceConnection,
  fetchSourceTrace,
  type SourceConnectionState,
  type SourceTraceView,
} from "../../lib/api";

/**
 * Phase 9 source-connection screen.
 *
 * One URL field, one action. After connection: commit SHA, deterministic
 * inventory + execution profile, then the source trace for the selected
 * finding with a Repair CTA. Local trees connect via the trusted CLI
 * (named, never browsable from the hosted UI).
 */
export default function ConnectSource() {
  return (
    <Suspense fallback={<main className="product"><p>Loading…</p></main>}>
      <ConnectSourceContent />
    </Suspense>
  );
}

const STEPS = [
  "Connecting source",
  "Finding responsible code",
  "Creating repair",
  "Building repaired app",
  "Replaying failure",
  "Checking regressions",
  "Done",
];

function ConnectSourceContent() {
  const search = useSearchParams();
  const runId = search.get("run") ?? "";
  const findingId = search.get("finding") ?? "";
  const [gitUrl, setGitUrl] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [state, setState] = useState<SourceConnectionState | null>(null);
  const [trace, setTrace] = useState<SourceTraceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    },
    [],
  );

  async function poll(id: string): Promise<void> {
    try {
      const next = await fetchSourceConnection(id);
      setState(next);
      if (next.state === "CONNECTED") {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        const view = await fetchSourceTrace(id);
        setTrace(view);
      } else if (next.state === "FAILED") {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        setError(next.error ?? "Source connection failed.");
      }
    } catch (err) {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "Source connection failed.");
    }
  }

  async function onConnect(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setTrace(null);
    setConnecting(true);
    try {
      const id = await connectSourceRepo({
        gitUrl,
        ...(runId !== "" && findingId !== "" ? { runId, findingId } : {}),
      });
      setSourceId(id);
      setState(null);
      await poll(id);
      pollRef.current = setInterval(() => void poll(id), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect source.");
      setConnecting(false);
      return;
    }
    setConnecting(false);
  }

  const stageIndex =
    state === null
      ? 0
      : state.state === "FAILED"
        ? 0
        : trace !== null
          ? 2
          : 1;

  return (
    <main className="product">
      <header className="product-top">
        <Link href="/" className="wordmark">
          A11yForge
        </Link>
        <nav aria-label="Primary">
          <Link href="/console">Repair demo</Link>
        </nav>
      </header>

      <section aria-labelledby="connect-title" className="narrow">
        <h1 id="connect-title">Connect source</h1>
        {findingId !== "" && (
          <p className="lede">
            Tracing finding <code>{findingId}</code>
            {runId !== "" && (
              <>
                {" "}from test <code>{runId}</code>
              </>
            )}{" "}
            into your codebase.
          </p>
        )}

        {sourceId === null && (
          <form onSubmit={(event) => void onConnect(event)}>
            <label htmlFor="git-url">Public Git repository</label>
            <input
              id="git-url"
              name="git-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://github.com/owner/repository"
              value={gitUrl}
              onChange={(event) => setGitUrl(event.target.value)}
              required
              aria-describedby={error !== null ? "connect-error" : undefined}
              aria-invalid={error !== null}
            />
            <button type="submit" className="btn-primary" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </button>
            {error !== null && (
              <p id="connect-error" role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        )}

        {sourceId === null && (
          <section aria-labelledby="local-title" className="secondary">
            <h2 id="local-title">Testing a local project?</h2>
            <p>
              Run A11yForge where your code already is — the local path never
              leaves your machine:
            </p>
            <pre>
              <code>
                a11yforge repair --run {runId !== "" ? runId : "<run-id>"}{" "}
                --finding {findingId !== "" ? findingId : "<finding-id>"} --source .
              </code>
            </pre>
          </section>
        )}

        {sourceId !== null && (
          <ol className="progress-steps" aria-label="Repair progress">
            {STEPS.map((step, index) => (
              <li
                key={step}
                aria-current={index === stageIndex ? "step" : undefined}
                className={
                  index < stageIndex
                    ? "step-done"
                    : index === stageIndex
                      ? "step-current"
                      : "step-pending"
                }
              >
                {step}
              </li>
            ))}
          </ol>
        )}

        {state !== null && state.state === "CONNECTED" && state.target !== null && (
          <section aria-labelledby="connected-title" aria-live="polite">
            <h2 id="connected-title">Source connected</h2>
            <p>
              Commit: <code>{state.target.revision.slice(0, 7)}</code>
            </p>
            {state.inventory !== null && (
              <p>
                {state.inventory.fileCount} files indexed
                {state.inventory.manifestFiles.length > 0 &&
                  ` · ${state.inventory.manifestFiles.join(", ")}`}
              </p>
            )}
            {state.profile !== null && (
              <p>
                {state.profile.confidence === "unknown"
                  ? "Source connected, but A11yForge needs launch instructions to verify repairs."
                  : state.profile.explanation}
              </p>
            )}
          </section>
        )}

        {trace !== null && (
          <section aria-labelledby="trace-title" aria-live="polite">
            {trace.status === "FOUND" && trace.candidates[0] !== undefined ? (
              <>
                <h2 id="trace-title">Responsible code located</h2>
                <p>
                  <code>{trace.candidates[0].filePath}</code>
                </p>
                <p>
                  These source lines contain identifiers and accessibility
                  attributes observed in the failing browser interaction.
                </p>
                <ul>
                  {trace.candidates[0].matchReasons.slice(0, 5).map((reason) => (
                    <li key={reason}>Matched: {reason}</li>
                  ))}
                </ul>
                {trace.candidates[0].snippets[0] !== undefined && (
                  <pre>
                    <code>{trace.candidates[0].snippets[0].content.slice(0, 1200)}</code>
                  </pre>
                )}
                <p>
                  <button type="button" className="btn-primary">
                    Repair this issue
                  </button>
                </p>
                <details>
                  <summary>View source-trace evidence</summary>
                  <p>{trace.reason}</p>
                  <p>Search terms: {trace.searchTerms.join(", ")}</p>
                </details>
              </>
            ) : trace.status === "AMBIGUOUS" ? (
              <>
                <h2 id="trace-title">Several files matched</h2>
                <p>{trace.reason}</p>
                <ul>
                  {trace.candidates.slice(0, 5).map((candidate) => (
                    <li key={candidate.filePath}>
                      <code>{candidate.filePath}</code> — {candidate.matchReasons[0] ?? "weak match"}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 id="trace-title">No matching source found</h2>
                <p>{trace.reason}</p>
              </>
            )}
          </section>
        )}

        {state !== null && state.state === "FAILED" && (
          <p role="alert" className="form-error">
            {state.error ?? "Source connection failed."}{" "}
            <button type="button" className="btn-text" onClick={() => setSourceId(null)}>
              Try another repository
            </button>
          </p>
        )}

        <p>
          <Link href="/console" className="btn-text">
            See a full verified repair
          </Link>
        </p>
      </section>
    </main>
  );
}
