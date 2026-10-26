"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  artifactSrc,
  fetchArtifactText,
  fetchHealth,
  fetchRun,
  fetchRunStatus,
  fetchRuns,
  shortRunId,
  startRun,
  subscribeRunEvents,
  type ApiHealth,
  type LiveRunEvent,
  type LiveRunStatus,
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

/** Live pipeline states reuse the recorded-console marks (text + glyph). */
function liveMark(state: string): string {
  if (state === "passed") return "✓";
  if (state === "failed") return "✕";
  if (state === "running") return "●";
  if (state === "skipped") return "–";
  return "○";
}

function liveMarkStatus(state: string): string {
  if (state === "passed") return "success";
  if (state === "failed") return "failed";
  if (state === "running") return "current";
  return "pending";
}

function liveWord(state: string): string {
  if (state === "passed") return "DONE";
  if (state === "failed") return "FAILED";
  if (state === "running") return "IN PROGRESS";
  if (state === "skipped") return "SKIPPED";
  return "PENDING";
}

interface LiveEvidence {
  findings: string | null;
  escape: string | null;
  diagnosis: string | null;
  diagnosisMeta: string | null;
  source: string | null;
  proposal: string | null;
}

/** Fold the live event stream into progressive evidence summaries. */
function foldLiveEvidence(events: LiveRunEvent[]): LiveEvidence {
  const out: LiveEvidence = {
    findings: null,
    escape: null,
    diagnosis: null,
    diagnosisMeta: null,
    source: null,
    proposal: null,
  };
  for (const event of events) {
    const meta = event.metadata as Record<string, unknown>;
    if (event.type === "scanner-completed") {
      const findings = typeof meta["findings"] === "number" ? meta["findings"] : null;
      const rules = Array.isArray(meta["rules"])
        ? meta["rules"].filter((r): r is string => typeof r === "string")
        : [];
      out.findings =
        findings !== null
          ? `${findings} finding${findings === 1 ? "" : "s"} across ${rules.length} rule${rules.length === 1 ? "" : "s"}${rules.length > 0 ? `: ${rules.join(", ")}` : ""}`
          : event.message;
    } else if (event.type === "focus-escape-detected") {
      const step = typeof meta["step"] === "number" ? `step ${meta["step"]}` : "a Tab press";
      const actual = typeof meta["actualFocus"] === "string" ? meta["actualFocus"] : "outside the dialog";
      out.escape = `${step} → ${actual}`;
    } else if (event.type === "diagnosis-completed") {
      const title = /Diagnosed:\s*(.*)/.exec(event.message)?.[1] ?? event.message;
      out.diagnosis = title;
      const parts: string[] = [];
      for (const key of ["issueType", "severity", "confidence"] as const) {
        const value = meta[key];
        if (typeof value === "string" || typeof value === "number") parts.push(`${key}: ${value}`);
      }
      out.diagnosisMeta = parts.length > 0 ? parts.join(" · ") : null;
    } else if (event.type === "source-candidate-selected") {
      const file = typeof meta["file"] === "string" ? meta["file"] : null;
      const score = typeof meta["score"] === "number" ? ` · score ${meta["score"]}` : "";
      out.source = file !== null ? `${file}${score}` : event.message;
    } else if (event.type === "repair-proposal-completed") {
      const files = Array.isArray(meta["targetFiles"])
        ? meta["targetFiles"].filter((f): f is string => typeof f === "string")
        : [];
      const editCount = typeof meta["edits"] === "number" ? meta["edits"] : null;
      const edits = editCount !== null ? ` · ${editCount} edit${editCount === 1 ? "" : "s"}` : "";
      out.proposal = files.length > 0 ? `${files.join(", ")}${edits}` : event.message;
    }
  }
  return out;
}

function formatTokens(usage: LiveRunStatus["usage"]): string {
  const parts = [`in ${usage.inputTokens ?? "n/a"}`, `out ${usage.outputTokens ?? "n/a"}`];
  if (usage.reasoningTokens !== null && usage.reasoningTokens !== undefined) {
    parts.push(`reasoning ${usage.reasoningTokens}`);
  }
  return parts.join(" · ");
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

type LivePhase = "idle" | "starting" | "running" | "done" | "failed";

export default function Home() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string>("demo");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState<number>(2);

  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [livePhase, setLivePhase] = useState<LivePhase>("idle");
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveRunEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const streamRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef<boolean>(false);

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

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        /* health is best-effort; the recorded console works regardless */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopLiveStream = useCallback(() => {
    streamRef.current?.();
    streamRef.current = null;
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopLiveStream, [stopLiveStream]);

  const refreshStatus = useCallback(async (runId: string) => {
    try {
      setLiveStatus(await fetchRunStatus(runId));
    } catch {
      /* the next event or poll retry converges */
    }
  }, []);

  const settleLiveRun = useCallback(
    async (runId: string, terminal: "done" | "failed") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopLiveStream();
      await refreshStatus(runId);
      setLivePhase(terminal);
      try {
        const summaries = await fetchRuns();
        setRuns(summaries);
      } catch {
        /* run list refresh is best-effort */
      }
      if (terminal === "done") {
        // Render the finished live run through the full recorded console.
        setSelected(runId);
        await load(runId);
      }
    },
    [load, refreshStatus, stopLiveStream],
  );

  const startLivePollFallback = useCallback(
    (runId: string) => {
      if (pollRef.current !== null || finishedRef.current) return;
      pollRef.current = setInterval(() => {
        void (async () => {
          try {
            const status = await fetchRunStatus(runId);
            setLiveStatus(status);
            if (status.state === "COMPLETED") {
              void settleLiveRun(runId, "done");
            } else if (status.state === "FAILED") {
              setLiveError(status.error ?? "The run failed.");
              void settleLiveRun(runId, "failed");
            }
          } catch {
            /* keep polling until the stream recovers or the run ends */
          }
        })();
      }, 2000);
    },
    [settleLiveRun],
  );

  const startLive = useCallback(async () => {
    if (livePhase === "starting" || livePhase === "running") return;
    stopLiveStream();
    finishedRef.current = false;
    setLiveError(null);
    setLiveEvents([]);
    setLiveStatus(null);
    setLivePhase("starting");
    let runId: string;
    try {
      const started = await startRun();
      runId = started.runId;
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Could not start run.");
      setLivePhase("failed");
      return;
    }
    setLiveRunId(runId);
    setLivePhase("running");
    void refreshStatus(runId);
    streamRef.current = subscribeRunEvents(
      runId,
      (event) => {
        setLiveEvents((prev) => [...prev.slice(-99), event]);
        void refreshStatus(runId);
        if (event.type === "run-completed") {
          void settleLiveRun(runId, "done");
        } else if (event.type === "run-failed") {
          setLiveError(event.message);
          void settleLiveRun(runId, "failed");
        }
      },
      () => {
        // Event stream interrupted — fall back to status polling.
        startLivePollFallback(runId);
      },
    );
  }, [livePhase, refreshStatus, settleLiveRun, startLivePollFallback, stopLiveStream]);

  const liveEvidence = foldLiveEvidence(liveEvents);
  const liveRunningStage =
    liveStatus?.stages.find((s) => s.state === "running") ?? null;
  const liveBusy = livePhase === "starting" || livePhase === "running";
  const isLiveSelection = liveRunId !== null && selected === liveRunId;
  const liveDiffUrl =
    liveRunId !== null && (liveStatus?.artifacts.includes("repair-diff.patch") ?? false)
      ? `/runs/${encodeURIComponent(liveRunId)}/artifacts/repair-diff.patch`
      : null;
  const liveRevisionDiffUrl =
    liveRunId !== null &&
    (liveStatus?.artifacts.includes("repair-revision-diff.patch") ?? false)
      ? `/runs/${encodeURIComponent(liveRunId)}/artifacts/repair-revision-diff.patch`
      : null;
  const liveEscapedShot =
    liveRunId !== null && (liveStatus?.artifacts.includes("focus-escaped.png") ?? false)
      ? artifactSrc(`/runs/${encodeURIComponent(liveRunId)}/artifacts/focus-escaped.png`)
      : null;
  const liveAfterShot =
    liveRunId !== null &&
    (liveStatus?.artifacts.includes("focus-contained-after-revision.png") ?? false)
      ? artifactSrc(
          `/runs/${encodeURIComponent(liveRunId)}/artifacts/focus-contained-after-revision.png`,
        )
      : liveRunId !== null &&
          (liveStatus?.artifacts.includes("focus-contained-after.png") ?? false)
        ? artifactSrc(`/runs/${encodeURIComponent(liveRunId)}/artifacts/focus-contained-after.png`)
        : null;

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
        {state.kind === "ready" && isLiveSelection && (
          <span className="live-badge" aria-label="This is the live run you just started">
            LIVE RUN
          </span>
        )}
      </header>

      <section className="panel live-panel" aria-labelledby="h-live">
        <h2 id="h-live">
          Live autonomous repair{" "}
          <span className="live-badge" aria-hidden="true">
            LIVE
          </span>
        </h2>
        <p>
          Target: <strong>Broken Shop</strong> — the controlled fixture. Starting a run executes
          the real backend pipeline (scan → keyboard test → diagnosis → source trace → proposal →
          verify → critic) and streams its events here. Nothing is faked; instant stages display
          honestly.
        </p>
        {health !== null && !health.modelConfigured && (
          <p className="notice" role="note">
            Live Meta execution unavailable — MODEL_API_KEY not configured. The recorded
            accepted run below remains fully inspectable.
          </p>
        )}
        {(livePhase === "idle" || livePhase === "done" || livePhase === "failed") && (
          <button type="button" onClick={() => void startLive()} disabled={liveBusy}>
            {livePhase === "idle" ? "Start Autonomous Repair" : "Start New Autonomous Repair"}
          </button>
        )}
        {livePhase === "starting" && (
          <p className="loading" role="status">
            Starting autonomous run…
          </p>
        )}
        {(livePhase === "running" || livePhase === "done" || livePhase === "failed") &&
          liveStatus !== null && (
            <>
              <p role="status" className="live-status">
                {liveStatus.state === "RUNNING" && liveRunningStage !== null && (
                  <>
                    <span aria-hidden="true">● </span>Running: {liveRunningStage.label}
                    {liveRunningStage.detail !== undefined && ` — ${liveRunningStage.detail}`}
                  </>
                )}
                {liveStatus.state === "RUNNING" &&
                  liveRunningStage === null &&
                  "Running: preparing stages…"}
                {liveStatus.state === "COMPLETED" && (
                  <>Finished: {liveStatus.finalState ?? "completed"}</>
                )}
                {liveStatus.state === "FAILED" && "Run failed — see error below."}
              </p>
              <ol className="pipeline" aria-label="Live pipeline stages">
                {liveStatus.stages.map((stage) => (
                  <li key={stage.id}>
                    <span
                      className="stage-mark"
                      data-status={liveMarkStatus(stage.state)}
                      aria-hidden="true"
                    >
                      {liveMark(stage.state)}
                    </span>
                    <span>
                      <span className="stage-label">{stage.label}</span>{" "}
                      <span className="stage-state" data-status={liveMarkStatus(stage.state)}>
                        {liveWord(stage.state)}
                      </span>
                      {stage.detail !== undefined && (
                        <div className="stage-detail">{stage.detail}</div>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="live-evidence" aria-label="Progressive run evidence">
                {liveEvidence.findings !== null && (
                  <p>
                    <strong>Scanning evidence:</strong> {liveEvidence.findings}
                  </p>
                )}
                {liveEvidence.escape !== null && (
                  <p>
                    <strong>Keyboard evidence:</strong> focus escaped {liveEvidence.escape}
                  </p>
                )}
                {liveEvidence.diagnosis !== null && (
                  <p>
                    <strong>Diagnosis:</strong> {liveEvidence.diagnosis}
                    {liveEvidence.diagnosisMeta !== null && ` (${liveEvidence.diagnosisMeta})`}
                  </p>
                )}
                {liveEvidence.source !== null && (
                  <p>
                    <strong>Source candidate:</strong> {liveEvidence.source}
                  </p>
                )}
                {liveEvidence.proposal !== null && (
                  <p>
                    <strong>Repair proposal:</strong> {liveEvidence.proposal}
                  </p>
                )}
                {liveDiffUrl !== null && (
                  <div>
                    <h3>Attempt 1 diff</h3>
                    <DiffView url={liveDiffUrl} label="Live attempt 1 diff" />
                  </div>
                )}
                {liveRevisionDiffUrl !== null && (
                  <div>
                    <h3>Attempt 2 (revision) diff</h3>
                    <DiffView url={liveRevisionDiffUrl} label="Live attempt 2 diff" />
                  </div>
                )}
                {(liveEscapedShot !== null || liveAfterShot !== null) && (
                  <div className="shots">
                    {liveEscapedShot !== null && (
                      <figure>
                        <img
                          src={liveEscapedShot}
                          alt="Live run before repair: checkout modal open while keyboard focus has escaped"
                          loading="lazy"
                        />
                        <figcaption>BEFORE — focus escaped ✕</figcaption>
                      </figure>
                    )}
                    {liveAfterShot !== null && (
                      <figure>
                        <img
                          src={liveAfterShot}
                          alt="Live run after repair: focus remains inside the checkout modal"
                          loading="lazy"
                        />
                        <figcaption>AFTER — focus contained ✓</figcaption>
                      </figure>
                    )}
                  </div>
                )}
              </div>
              <div className="usage-line" aria-label="Model inference usage">
                <p>
                  Meta inference calls: <span className="fact">{liveStatus.usage.calls}</span>
                  {" · "}Tokens:{" "}
                  <span className="fact">{formatTokens(liveStatus.usage)}</span>
                </p>
                <p className="usage-note">
                  Usage only — no cost is computed (no pricing configured). The run is hard-capped
                  at 4 live calls (diagnosis, proposal, at most one bounded revision, critic if
                  eligible).
                </p>
              </div>
              {livePhase === "failed" && liveError !== null && (
                <div className="error-box" role="alert">
                  <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>Live run failed</h2>
                  <p style={{ margin: 0 }}>
                    {liveError} Artifacts generated so far are preserved on the API server.
                  </p>
                </div>
              )}
              {liveEvents.length > 0 && (
                <details className="event-log">
                  <summary>Pipeline events ({liveEvents.length})</summary>
                  <ol aria-label="Pipeline event history">
                    {liveEvents.slice(-30).map((event) => (
                      <li key={event.eventId}>
                        <span className="fact">{event.type}</span> — {event.message}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
      </section>

      <main id="main">
      <section aria-labelledby="h-recorded">
      <h2 className="section-heading" id="h-recorded">
        Completed demo run <span className="demo-badge">RECORDED</span>
      </h2>
      {health?.demoMode === "bundled-recorded" && (
        <p className="notice" role="note">
          Recorded accepted run — a real historical A11yForge run bundled with this checkout.
          No API key needed; this is a recording, not a live run.
        </p>
      )}

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
          <p className="loading" role="status">
            Loading run artifacts…
          </p>
      )}

      {state.kind === "error" && (
          <div className="error-box" role="alert">
            <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>No run data to show</h2>
            <p style={{ margin: 0 }}>
              The console shows only real artifacts — nothing was faked. ({state.message})
              Produce a run locally, then refresh.
            </p>
          </div>
      )}

      {state.kind === "ready" && (
        <>
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
                      src={artifactSrc(state.view.artifacts.focusEscapedUrl)}
                      alt="Before repair: checkout modal open while keyboard focus has escaped to the background control"
                      loading="lazy"
                    />
                    <figcaption>BEFORE — focus escaped ✕</figcaption>
                  </figure>
                )}
                {state.view.artifacts.afterUrl !== null && (
                  <figure>
                    <img
                      src={artifactSrc(state.view.artifacts.afterUrl)}
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
        </>
      )}
      </section>
      </main>
    </div>
  );
}
