"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchArtifactText,
  fetchRun,
  fetchRuns,
  shortRunId,
  type RunSummary,
  type RunViewModel,
} from "../lib/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; view: RunViewModel }
  | { kind: "error"; message: string };

function stageMark(status: string): string {
  if (status === "success") return "✓";
  if (status === "failed") return "✕";
  if (status === "current") return "●";
  return "○";
}

function stageWord(status: string): string {
  if (status === "success") return "DONE";
  if (status === "failed") return "FAILED";
  if (status === "current") return "IN PROGRESS";
  return "PENDING";
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "ACCEPTED" ? "pass" : status === "EVIDENCE" ? "neutral" : "fail";
  return (
    <span className="status-pill" data-tone={tone} role="status" aria-label={`Run status: ${status}`}>
      {status}
    </span>
  );
}

function Verdict({ pass, children }: { pass: boolean; children: React.ReactNode }) {
  const word = pass ? "PASS" : "FAIL";
  return (
    <span className="verdict" data-tone={pass ? "pass" : "fail"}>
      {word} {children}
    </span>
  );
}

function DiffView({ url, label }: { url: string | null; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    if (url === null) return;
    fetchArtifactText(url)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError("Diff artifact unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url === null) return <p>No diff recorded for this attempt.</p>;
  if (error !== null) return <p role="alert">{error}</p>;
  if (text === null) return <p className="loading">Loading diff…</p>;

  const lines = text.split("\n");
  const shown = lines.slice(0, 120);
  return (
    <>
      <pre
        className="diff"
        aria-label={`${label}: unified diff, added lines start with plus, removed lines with minus`}
        tabIndex={0}
      >
        {shown.map((line, i) => {
          const cls =
            line.startsWith("+") && !line.startsWith("+++")
              ? "line add"
              : line.startsWith("-") && !line.startsWith("---")
                ? "line del"
                : line.startsWith("@@")
                  ? "line hunk"
                  : "line";
          return (
            <span key={i} className={cls}>
              {line === "" ? " " : line}
              {"\n"}
            </span>
          );
        })}
      </pre>
      {lines.length > shown.length && (
        <p>
          Showing {shown.length} of {lines.length} diff lines (bounded view).
        </p>
      )}
    </>
  );
}

export default function Home() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string>("demo");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState<number>(2);

  const load = useCallback(async (runId: string) => {
    setState({ kind: "loading" });
    try {
      const [summaries, view] = await Promise.all([fetchRuns(), fetchRun(runId)]);
      setRuns(summaries);
      setState({ kind: "ready", view });
      setAttempt(view.attempts.length);
    } catch (error) {
      setRuns([]);
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load run artifacts.",
      });
    }
  }, []);

  useEffect(() => {
    void load(selected);
  }, [load, selected]);

  return (
    <div className="console">
      <a className="skip-link" href="#main">
        Skip to run evidence
      </a>
      <header className="topbar">
        <div className="brand">
          <h1>A11yForge</h1>
          <p>Autonomous accessibility engineering — observable repair console</p>
        </div>
        {state.kind === "ready" && <StatusPill status={state.view.finalStatus} />}
      </header>

      <div className="controls" role="group" aria-label="Run controls">
        <label htmlFor="run-select">Run</label>
        <select
          id="run-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="demo">demo — latest accepted run</option>
          {runs.map((r) => (
            <option key={r.runId} value={r.runId}>
              {shortRunId(r.runId)} — {r.finalStatus}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void load(selected)}>
          Refresh artifacts
        </button>
      </div>

      {state.kind === "loading" && (
        <main id="main">
          <p className="loading" role="status">
            Loading run artifacts…
          </p>
        </main>
      )}

      {state.kind === "error" && (
        <main id="main">
          <div className="error-box" role="alert">
            <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>No run data to show</h2>
            <p style={{ margin: 0 }}>
              The console shows only real artifacts — nothing was faked. ({state.message})
              Produce a run locally, then refresh.
            </p>
          </div>
        </main>
      )}

      {state.kind === "ready" && (
        <main id="main">
          <dl className="meta-grid" aria-label="Run metadata">
            <div className="meta-cell">
              <dt>Target</dt>
              <dd>{state.view.targetLabel}</dd>
            </div>
            <div className="meta-cell">
              <dt>Run ID</dt>
              <dd>{state.view.runId}</dd>
            </div>
            <div className="meta-cell">
              <dt>Model</dt>
              <dd>{state.view.model}</dd>
            </div>
            <div className="meta-cell">
              <dt>Evidence items</dt>
              <dd>{state.view.evidenceCount}</dd>
            </div>
            <div className="meta-cell">
              <dt>Source file</dt>
              <dd>{state.view.sourceFile}</dd>
            </div>
            <div className="meta-cell">
              <dt>Final confidence</dt>
              <dd>
                {state.view.finalConfidence === null
                  ? "n/a (no critic call)"
                  : state.view.finalConfidence.toFixed(2)}
              </dd>
            </div>
          </dl>

          <div className="grid">
            <section className="panel" aria-labelledby="h-pipeline">
              <h2 id="h-pipeline">Autonomous pipeline</h2>
              <ol className="pipeline">
                {state.view.pipeline.map((stage) => (
                  <li key={stage.id}>
                    <span
                      className="stage-mark"
                      data-status={stage.status}
                      aria-hidden="true"
                    >
                      {stageMark(stage.status)}
                    </span>
                    <span>
                      <span className="stage-label">{stage.label}</span>
                      <span className="stage-state" data-status={stage.status}>
                        {stageWord(stage.status)}
                      </span>
                      {stage.detail !== undefined && (
                        <div className="stage-detail">{stage.detail}</div>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p>
                Attempt 1 was <strong>deterministically rejected</strong> and is preserved
                above — the engine does not hide its own failed repair.
              </p>
            </section>

            <section className="panel" aria-labelledby="h-evidence">
              <h2 id="h-evidence">Interaction evidence</h2>
              <ol className="trace" aria-label="Focus progression, Tab by Tab">
                {state.view.focusTrace.map((step) => (
                  <li key={step.seq} className={step.insideModal ? "" : "escaped"}>
                    <span className="seq">Tab {step.seq}</span>
                    <span>{step.selector}</span>
                    <span className={`where ${step.insideModal ? "in" : "out"}`}>
                      {step.insideModal ? "INSIDE ✓" : "ESCAPED ✕"}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="compare">
                <div>
                  <h3>Expected</h3>
                  <p>
                    Focus stays inside <code>{state.view.finding.expectedRegion}</code> while
                    the modal is open.
                  </p>
                </div>
                <div>
                  <h3>Actual (before repair)</h3>
                  <p>
                    Focus moved to <code>{state.view.finding.actualFocusBefore}</code> — outside
                    the dialog.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="grid two">
            <section className="panel" aria-labelledby="h-beforeafter">
              <h2 id="h-beforeafter">Before / after</h2>
              <table className="gates">
                <caption>Deterministic assertion outcomes</caption>
                <tbody>
                  <tr>
                    <th scope="row">focus-contained-in-modal</th>
                    <td>
                      <Verdict pass={false}>before</Verdict>
                    </td>
                    <td>
                      <Verdict pass={state.view.verification.primaryReplayPassed}>
                        after
                      </Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Strict typecheck</th>
                    <td>
                      <Verdict pass={false}>attempt 1</Verdict>
                    </td>
                    <td>
                      <Verdict pass={state.view.verification.typecheckPassed}>
                        attempt 2
                      </Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">New serious/critical axe violations</th>
                    <td colSpan={2}>
                      <span className="fact">
                        {state.view.verification.newSeriousCritical.length}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Critic</th>
                    <td colSpan={2}>
                      <span className="fact">
                        {state.view.critic === null
                          ? "not called"
                          : `${state.view.critic.decision} (${state.view.critic.confidence.toFixed(2)})`}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="shots" style={{ marginTop: 12 }}>
                {state.view.artifacts.focusEscapedUrl !== null && (
                  <figure>
                    <img
                      src={state.view.artifacts.focusEscapedUrl}
                      alt="Before repair: checkout modal open while keyboard focus has escaped to the background control"
                      loading="lazy"
                    />
                    <figcaption>BEFORE — focus escaped ✕</figcaption>
                  </figure>
                )}
                {state.view.artifacts.afterUrl !== null && (
                  <figure>
                    <img
                      src={state.view.artifacts.afterUrl}
                      alt="After repair: focus remains inside the checkout modal"
                      loading="lazy"
                    />
                    <figcaption>AFTER — focus contained ✓</figcaption>
                  </figure>
                )}
              </div>
              {(state.view.artifacts.focusEscapedUrl === null ||
                state.view.artifacts.afterUrl === null) && (
                <p>Screenshots unavailable for this run — assertion data above still holds.</p>
              )}
            </section>

            <section className="panel" aria-labelledby="h-diagnosis">
              <h2 id="h-diagnosis">Diagnosis (Phase 3)</h2>
              <p>
                <strong>{state.view.diagnosis.title}</strong>
              </p>
              <div className="tag-row" aria-label="Diagnosis attributes">
                <span className="tag">{state.view.diagnosis.issueType}</span>
                <span className="tag">severity: {state.view.diagnosis.severity}</span>
                <span className="tag">
                  confidence: {state.view.diagnosis.confidence.toFixed(2)}
                </span>
                {state.view.diagnosis.wcagCriteria.map((c) => (
                  <span className="tag" key={c}>
                    WCAG {c}
                  </span>
                ))}
              </div>
              <div className="callout observed">
                <h3>Observed (deterministic evidence)</h3>
                <p>{state.view.diagnosis.observedFailure}</p>
              </div>
              <div className="callout inferred">
                <h3>Inferred (model hypothesis)</h3>
                <p>{state.view.diagnosis.likelyCause}</p>
              </div>
              <h3>Repair strategy</h3>
              <p>{state.view.diagnosis.recommendedRepairStrategy}</p>
              <h3>Evidence references</h3>
              <p className="fact" style={{ fontFamily: "monospace", fontSize: 12 }}>
                {state.view.diagnosis.evidenceIds.join(", ")}
              </p>
            </section>
          </div>

          <div className="grid two">
            <section className="panel" aria-labelledby="h-trace">
              <h2 id="h-trace">Source trace (deterministic)</h2>
              <p>
                Top candidate: <strong>{state.view.sourceTrace.topFile}</strong> — score{" "}
                <span className="fact">{state.view.sourceTrace.score}</span>, context lines{" "}
                <span className="fact">
                  {state.view.sourceTrace.startLine}–{state.view.sourceTrace.endLine}
                </span>
              </p>
              <p>
                No model was asked where to look. Search terms came only from evidence
                selectors and the diagnosis text:
              </p>
              <div className="tag-row" aria-label="Matched evidence terms">
                {state.view.sourceTrace.matchedTerms.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel" aria-labelledby="h-diff">
              <h2 id="h-diff">Source diff (accepted change)</h2>
              <div className="diff-tabs" role="group" aria-label="Repair attempt diff">
                {state.view.attempts.map((a) => (
                  <button
                    key={a.attempt}
                    type="button"
                    aria-pressed={attempt === a.attempt}
                    onClick={() => setAttempt(a.attempt)}
                  >
                    Attempt {a.attempt} — {a.state}
                  </button>
                ))}
              </div>
              {state.view.attempts
                .filter((a) => a.attempt === attempt)
                .map((a) => (
                  <div key={a.attempt}>
                    <p>{a.outcomeNote}</p>
                    {a.diagnosticCodes.length > 0 && (
                      <p>
                        Compiler diagnostics:{" "}
                        <span className="fact">{a.diagnosticCodes.join(", ")}</span>
                      </p>
                    )}
                    <DiffView url={a.diffUrl} label={`Attempt ${a.attempt} diff`} />
                    {attempt === 2 && state.view.attempts.length > 1 && (
                      <p>
                        The revision adds one strict-safety guard line (
                        <code>if (first === undefined || last === undefined) return;</code>)
                        in response to the TS18048 verifier feedback.
                      </p>
                    )}
                  </div>
                ))}
            </section>
          </div>

          <div className="grid two">
            <section className="panel" aria-labelledby="h-verify">
              <h2 id="h-verify">Verification (deterministic gates)</h2>
              <table className="gates">
                <caption>Attempt 2 gate outcomes — all measured, none inferred</caption>
                <tbody>
                  <tr>
                    <th scope="row">TypeScript (strict)</th>
                    <td>
                      <Verdict pass={state.view.verification.typecheckPassed}>
                        gate
                      </Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Build</th>
                    <td>
                      <Verdict pass={state.view.verification.buildPassed}>gate</Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Primary keyboard replay</th>
                    <td>
                      <Verdict pass={state.view.verification.primaryReplayPassed}>
                        gate
                      </Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Reverse Shift+Tab replay</th>
                    <td>
                      <Verdict pass={state.view.verification.reverseReplayPassed}>
                        gate
                      </Verdict>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Axe baseline preserved</th>
                    <td>
                      <Verdict pass={state.view.verification.axeBaselinePreserved}>
                        gate
                      </Verdict>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="divider-label">Deterministic verifier — authoritative</p>
              <p>{state.view.verification.decisionBasis}</p>
              <p className="divider-label">AI critic — adjudicates only passing repairs</p>
              <p>
                The critic was never consulted on the failing Attempt 1. It can confirm a
                passing repair; it cannot override a deterministic failure.
              </p>
            </section>

            <section className="panel" aria-labelledby="h-critic">
              <h2 id="h-critic">Critic verdict</h2>
              {state.view.critic === null ? (
                <p>Critic was not called (deterministic gates did not all pass).</p>
              ) : (
                <>
                  <p>
                    Decision:{" "}
                    <span className="fact">
                      {state.view.critic.decision} ({state.view.critic.confidence.toFixed(2)})
                    </span>
                  </p>
                  <p>{state.view.critic.summary}</p>
                  <h3>Remaining risks (not hidden)</h3>
                  <ul className="risk-list">
                    {state.view.critic.remainingRisks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {state.view.critic.verificationConcerns.length > 0 && (
                    <>
                      <h3>Verification concerns</h3>
                      <ul className="risk-list">
                        {state.view.critic.verificationConcerns.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>
          </div>

          <footer className="footnote">
            A11yForge console · renders local artifacts only · 0 live model calls on this
            page · deterministic gates above, AI reasoning below
          </footer>
        </main>
      )}
    </div>
  );
}
