"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  EXPLORATION_STAGE_LABELS,
  type ExplorationEvent,
  type ExplorationFinding,
  type ExplorationRun,
  type ExplorationStage,
} from "@a11yforge/shared";
import {
  cancelExploration,
  explorationShotSrc,
  fetchExploration,
  subscribeExplorationEvents,
} from "../../../lib/api";

const STAGE_ORDER: ExplorationStage[] = [
  "opening",
  "exploring",
  "scanning",
  "interacting",
  "reviewing",
  "done",
];

function stageState(
  stage: ExplorationStage,
  events: ExplorationEvent[],
  run: ExplorationRun | null,
): "pending" | "running" | "done" {
  if (run !== null) return "done";
  const seen = events.some((event) => event.stage === stage);
  const laterSeen = events.some(
    (event) => STAGE_ORDER.indexOf(event.stage) > STAGE_ORDER.indexOf(stage),
  );
  if (laterSeen) return "done";
  if (seen) return "running";
  const firstPending = STAGE_ORDER.find(
    (candidate) => !events.some((event) => event.stage === candidate),
  );
  if (firstPending === stage && events.length > 0) return "running";
  return "pending";
}

function categoryLabel(category: ExplorationFinding["category"]): string {
  if (category === "confirmed-failure") return "Confirmed failure";
  if (category === "automated-finding") return "Automated finding";
  if (category === "observation") return "Observation";
  return "Not tested";
}

function FindingCard({ finding, runId }: { finding: ExplorationFinding; runId: string }) {
  const [open, setOpen] = useState(false);
  const evidenceId = `evidence-${finding.findingId}`;
  return (
    <article className="finding-card">
      <h3>{finding.title}</h3>
      <p className="finding-meta">
        <span>{categoryLabel(finding.category)}</span>
        {" · "}
        <span>Severity: {finding.severity}</span>
        {" · "}
        <span>{finding.pageUrl}</span>
      </p>
      <p>{finding.whatHappened}</p>
      <div className="finding-actions">
        <button
          type="button"
          className="btn-text"
          aria-expanded={open}
          aria-controls={evidenceId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide evidence" : "See evidence"}
        </button>
        <Link href={`/connect?run=${encodeURIComponent(runId)}&finding=${encodeURIComponent(finding.findingId)}`}>Connect source to repair</Link>
      </div>
      {open && (
        <div id={evidenceId} className="finding-evidence">
          <h4>Why this matters</h4>
          <p>{finding.whyItMatters}</p>
          <h4>How we reproduced it</h4>
          <ol>
            {finding.howReproduced.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {finding.screenshots.length > 0 && finding.screenshots[0] !== undefined && (
            <img
              src={explorationShotSrc(runId, finding.screenshots[0])}
              alt={`Screenshot of the page where: ${finding.title}`}
            />
          )}
          {finding.standardReferences.length > 0 && (
            <p className="std-refs">
              Standards:{" "}
              {finding.standardReferences.map((ref, index) => (
                <span key={index}>
                  {index > 0 && ", "}
                  <a href={ref} target="_blank" rel="noreferrer">
                    {ref}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function ExploreRunPage() {
  return (
    <Suspense fallback={<main className="product"><p>Loading test…</p></main>}>
      <ExploreRunContent />
    </Suspense>
  );
}

function ExploreRunContent() {
  const params = useParams<{ runId: string }>();
  const search = useSearchParams();
  const runId = params.runId;
  const entryUrl = search.get("url") ?? "";

  const [events, setEvents] = useState<ExplorationEvent[]>([]);
  const [run, setRun] = useState<ExplorationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const finished = await fetchExploration(runId);
      if (finished !== null) {
        setRun(finished);
        if (pollRef.current !== null) clearInterval(pollRef.current);
      }
    } catch {
      /* keep polling; SSE errors surface separately */
    }
  }, [runId]);

  useEffect(() => {
    const unsubscribe = subscribeExplorationEvents(
      runId,
      (event) => {
        setEvents((previous) => [...previous, event]);
        if (event.stage === "done") void poll();
      },
      () => {
        /* stream hiccup — the poll still converges */
      },
    );
    void poll();
    pollRef.current = setInterval(() => void poll(), 2000);
    return () => {
      unsubscribe();
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [runId, poll]);

  async function onCancel(): Promise<void> {
    setCancelling(true);
    try {
      await cancelExploration(runId);
      await poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setCancelling(false);
    }
  }

  const latest = events.length > 0 ? events[events.length - 1] ?? null : null;
  const confirmed = run?.findings.filter((finding) => finding.category === "confirmed-failure") ?? [];
  const automated = run?.findings.filter((finding) => finding.category === "automated-finding") ?? [];
  const notTestedFindings = run?.findings.filter((finding) => finding.category === "not-tested") ?? [];
  const shots = run?.screenshots ?? [];
  const newestShot = shots.length > 0 ? shots[shots.length - 1] : null;
  const issueCount = confirmed.length + automated.length;

  return (
    <main className="product">
      <a className="skip-link" href="#result">
        Skip to result
      </a>
      <header className="product-top">
        <Link href="/" className="wordmark">
          A11yForge
        </Link>
        <nav aria-label="Primary">
          <Link href="/console">Repair demo</Link>
        </nav>
      </header>

      <section aria-labelledby="run-title" id="result">
        <p className="run-url">{entryUrl !== "" ? entryUrl : run?.target.entryUrl ?? "…"}</p>
        <h1 id="run-title">
          {run === null
            ? "Testing accessibility…"
            : run.state === "COMPLETED"
              ? "Accessibility test complete"
              : run.state === "CANCELLED"
                ? "Test cancelled"
                : "Test could not finish"}
        </h1>

        {run === null && (
          <div className="progress" role="status" aria-label="Test progress">
            <ol>
              {STAGE_ORDER.map((stage) => {
                const state = stageState(stage, events, run);
                return (
                  <li key={stage} data-state={state}>
                    <span aria-hidden="true">{state === "done" ? "✓" : state === "running" ? "●" : "○"}</span>{" "}
                    {EXPLORATION_STAGE_LABELS[stage]}
                    {state === "done" ? " — done" : state === "running" ? " — in progress" : ""}
                  </li>
                );
              })}
            </ol>
            {latest !== null && <p className="latest">{latest.message}</p>}
            <button type="button" className="btn-text" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel test"}
            </button>
            {error !== null && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {run !== null && run.state === "COMPLETED" && (
          <>
            {issueCount > 0 ? (
              <p className="lede">
                {issueCount} {issueCount === 1 ? "issue" : "issues"} found
                {confirmed.length > 0 && ` — ${confirmed.length} confirmed interaction ${confirmed.length === 1 ? "failure" : "failures"}`}
                {automated.length > 0 && `, ${automated.length} automated ${automated.length === 1 ? "finding" : "findings"}`}
              </p>
            ) : (
              <div className="clean">
                <p className="lede">No accessibility failures were reproduced in the interactions A11yForge tested.</p>
                <p>
                  Pages tested: {run.pagesVisited.length} · Interaction probes run: {run.probeResults.length} ·
                  Interactions not tested: {notTestedFindings.length}
                </p>
              </div>
            )}

            {newestShot !== undefined && newestShot !== null && (
              <figure className="run-shot">
                <img src={explorationShotSrc(runId, newestShot)} alt="Screenshot captured by the test browser on the tested page" />
                <figcaption>Captured by the real browser during this test.</figcaption>
              </figure>
            )}

            {run.findings.filter((finding) => finding.category !== "not-tested").length > 0 && (
              <div className="findings">
                {run.findings
                  .filter((finding) => finding.category !== "not-tested")
                  .map((finding) => (
                    <FindingCard key={finding.findingId} finding={finding} runId={runId} />
                  ))}
              </div>
            )}

            {(notTestedFindings.length > 0 || run.limitations.length > 0) && (
              <section aria-labelledby="coverage-title" className="coverage">
                <h2 id="coverage-title">What we couldn&apos;t test</h2>
                <ul>
                  {notTestedFindings.map((finding) => (
                    <li key={finding.findingId}>
                      <strong>{finding.title}</strong> — {finding.whatHappened}
                    </li>
                  ))}
                  {run.limitations.map((limitation, index) => (
                    <li key={`limit-${index}`}>{limitation.message}</li>
                  ))}
                </ul>
              </section>
            )}

            <details className="tech-evidence">
              <summary>View technical evidence</summary>
              <p>
                Raw probe results, interaction traces, and page surfaces for advanced users.{" "}
                <Link href="/console">Open the full repair-evidence console</Link>
              </p>
              <pre>{JSON.stringify({ pages: run.pagesVisited, probes: run.probeResults.map((probe) => ({ id: probe.probeId, status: probe.status, page: probe.pageUrl })) }, null, 2)}</pre>
            </details>
          </>
        )}

        {run !== null && run.state !== "COMPLETED" && (
          <div className="run-problem">
            <p className="lede">
              {run.state === "CANCELLED"
                ? "The test was cancelled. Partial results are shown honestly — nothing was backfilled."
                : (run.error ?? "The test could not finish.")}
            </p>
            {run.limitations.map((limitation, index) => (
              <p key={index}>{limitation.message}</p>
            ))}
            <p>
              <Link href="/">Test another website</Link>
              {" · "}
              <Link href="/console">See the recorded repair demo instead</Link>
            </p>
          </div>
        )}
      </section>

      <footer className="product-foot">
        <p>
          <Link href="/">Test another website</Link>
          {" · "}
          <Link href="/console">Technical evidence console</Link>
        </p>
      </footer>
    </main>
  );
}
