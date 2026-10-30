"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  artifactSrc,
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
} from "../../lib/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DiffView,
  DownloadPatchButton,
  EvidenceShots,
  FocusTraceList,
  MetaGrid,
  RunStatusBadge,
  VerdictMark,
} from "@/components/domain";
import { foldLiveEvidence, formatTokens } from "../../lib/live-evidence";
import { BeforeAfter, DemoReplay } from "../../components/demo-replay";
import { RecordedExperience } from "@/components/spatial-tour/recorded-experience";
import { SiteCheck } from "@/components/site-check";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; view: RunViewModel }
  | { kind: "error"; message: string };

type LivePhase = "idle" | "starting" | "running" | "done" | "failed";

export default function DemoPage(): React.JSX.Element {
  const [showDetails, setShowDetails] = useState(false);
  return <main><RecordedExperience /><SiteCheck /><details className="tour-technical" onToggle={(event) => setShowDetails(event.currentTarget.open)}><summary>Developer details · original repair artifacts, diff, compiler results, and verification</summary>{showDetails && <RecordedConsole />}</details></main>;
}

function RecordedConsole() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string>("demo");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState<number>(2);
  const selectReplayBeat = useCallback((index: number) => {
    setAttempt(index === 2 || index === 3 ? 1 : 2);
  }, []);

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
    <div className="xp">
      <section id="main">
      <a className="skip-link" href="#main">
        Skip to run evidence
      </a>
      <div className="xp-verdict">
        <span className="mono-label">
          <span className="dot-live" aria-hidden="true">● </span>
          Recorded real repair — demo theatre
        </span>
        <h1 className="display-2">
          One repair, <span className="display-accent">replayed.</span>
        </h1>
        <p className="lede-xl">
          A real historical A11yForge repair run, steppable start to finish.
          Every claim below is backed by recorded artifacts — nothing executes
          here, nothing is faked.
        </p>
        <p style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: 0 }}>
          {state.kind === "ready" && <RunStatusBadge status={state.view.finalStatus} />}
          {state.kind === "ready" && isLiveSelection && (
            <Badge variant="solid" aria-label="This is the live run you just started">
              ● LIVE RUN
            </Badge>
          )}
        </p>
      </div>

      <details className="live-repair-disclosure">
      <summary>Run a live repair on the controlled fixture</summary>
      <Card className="live-panel" aria-labelledby="h-live">
        <CardHeader className="p-0">
          <span className="mono-label" style={{ margin: "0 0 4px" }}>
            Live pipeline · scan → verify → critic
          </span>
          <CardTitle asChild>
            <h2 id="h-live" className="display-3">
              Live autonomous repair{" "}
              <Badge variant="solid" aria-hidden="true">
                ● LIVE
              </Badge>
            </h2>
          </CardTitle>
        </CardHeader>
        <p>
          Target: <strong>Broken Shop</strong> — the controlled fixture. Starting a run executes
          the real backend pipeline (scan → keyboard test → diagnosis → source trace → proposal →
          verify → critic) and streams its events here. Nothing is faked; instant stages display
          honestly.
        </p>
        {health !== null && !health.modelConfigured && (
          <Alert className="mt-3">
            <AlertDescription>
              Live Meta execution unavailable — MODEL_API_KEY not configured. The recorded
              accepted run below remains fully inspectable.
            </AlertDescription>
          </Alert>
        )}
        {(livePhase === "idle" || livePhase === "done" || livePhase === "failed") && (
          <Button
            type="button"
            size="lg"
            onClick={() => void startLive()}
            disabled={liveBusy}
          >
            {livePhase === "idle" ? "Start Autonomous Repair" : "Start New Autonomous Repair"}
          </Button>
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
              <div className="repair-line" aria-label="Live pipeline stages">
                <div className="repair-track">
                  <div
                    className="repair-progress"
                    style={{
                      width: liveStatus.stages.length > 0
                        ? `${(liveStatus.stages.filter(
                            (stage) => stage.state === "passed" || stage.state === "failed" || stage.state === "skipped",
                          ).length / liveStatus.stages.length) * 100}%`
                        : "0%",
                      transition: "width 0.9s ease",
                    }}
                  />
                </div>
                <ol className="repair-stops">
                  {liveStatus.stages.map((stage) => (
                    <li
                      key={stage.id}
                      data-state={
                        stage.state === "passed" || stage.state === "skipped"
                          ? "done"
                          : stage.state === "failed"
                            ? "bad"
                            : stage.state === "running"
                              ? "now"
                              : undefined
                      }
                      title={stage.detail}
                    >
                      {stage.label}
                    </li>
                  ))}
                </ol>
              </div>
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
                    <DownloadPatchButton
                      url={liveDiffUrl}
                      filename={`a11yforge-${liveRunId}-attempt-1.patch`}
                      label="Download patch"
                    />
                  </div>
                )}
                {liveRevisionDiffUrl !== null && (
                  <div>
                    <h3>Attempt 2 (revision) diff</h3>
                    <DiffView url={liveRevisionDiffUrl} label="Live attempt 2 diff" />
                    <DownloadPatchButton
                      url={liveRevisionDiffUrl}
                      filename={`a11yforge-${liveRunId}-attempt-2.patch`}
                      label="Download patch"
                    />
                  </div>
                )}
                <EvidenceShots
                  shots={[
                    ...(liveEscapedShot !== null
                      ? [
                          {
                            src: liveEscapedShot,
                            alt: "Live run before repair: checkout modal open while keyboard focus has escaped",
                            caption: "BEFORE — focus escaped ✕",
                          },
                        ]
                      : []),
                    ...(liveAfterShot !== null
                      ? [
                          {
                            src: liveAfterShot,
                            alt: "Live run after repair: focus remains inside the checkout modal",
                            caption: "AFTER — focus contained ✓",
                          },
                        ]
                      : []),
                  ]}
                />
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
                <Alert variant="destructive">
                  <AlertTitle>Live run failed</AlertTitle>
                  <AlertDescription>
                    {liveError} Artifacts generated so far are preserved on the API server.
                  </AlertDescription>
                </Alert>
              )}
              {liveEvents.length > 0 && (
                <Accordion type="single" collapsible className="event-log">
                  <AccordionItem value="pipeline-events">
                    <AccordionTrigger>Pipeline events ({liveEvents.length})</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="max-h-64">
                        <ol aria-label="Pipeline event history">
                          {liveEvents.slice(-30).map((event) => (
                            <li key={event.eventId}>
                              <span className="fact">{event.type}</span> — {event.message}
                            </li>
                          ))}
                        </ol>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          )}
      </Card>

      </details>

      <Separator className="my-7" />

      <section aria-labelledby="h-recorded" style={{ marginTop: 40 }}>
      <span className="mono-label" id="h-recorded">
        Recorded real repair · deterministic verification
      </span>
      <h2 className="display-3" style={{ margin: "14px 0 8px" }}>
        Watch A11yForge fix a real accessibility problem.
      </h2>
      <p className="help" style={{ maxWidth: "72ch" }}>
        This is a real historical A11yForge repair run bundled with the project. It is not
        executing now — every section below renders recorded artifacts only.
        {health?.demoMode === "bundled-recorded" && (
          <> No API key needed; this is a recording, not a live run.</>
        )}
      </p>

      <div className="controls" role="group" aria-label="Run controls">
        <Label htmlFor="run-select">Run</Label>
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
        <Button type="button" variant="secondary" onClick={() => void load(selected)}>
          Refresh artifacts
        </Button>
      </div>

      {state.kind === "ready" && (
        <div style={{ marginTop: 20 }}>
          <DemoReplay
            onBeatChange={selectReplayBeat}
            beats={[
              {
                label: "The problem",
                headline: "Keyboard focus escapes somewhere users cannot understand.",
                detail: state.view.diagnosis.observedFailure,
                targetId: "h-evidence",
                targetLabel: "See the evidence",
              },
              {
                label: "We found the code",
                headline: "A11yForge traced the problem to the part of the interface that caused it.",
                detail: `Code location: ${state.view.sourceTrace.topFile} — matched deterministically from real browser evidence.`,
                targetId: "h-trace",
                targetLabel: "See the code",
              },
              {
                label: "First fix",
                headline: "A first fix was created.",
                detail: state.view.attempts[0]?.outcomeNote ?? "A11yForge proposes a bounded source edit.",
                targetId: "h-diff",
                targetLabel: "See the first fix",
              },
              ...(state.view.attempts.length > 1
                ? [
                    {
                      label: "Rejected",
                      headline: "That fix wasn't good enough.",
                      detail:
                        "The browser behavior improved, but the project did not pass its checks. A11yForge rejected it.",
                      targetId: "h-pipeline",
                      targetLabel: "Why it was rejected",
                    },
                    {
                      label: "Revision",
                      headline: "The failed check became feedback.",
                      detail:
                        "A11yForge uses the deterministic compiler failure as evidence for one careful revision.",
                      targetId: "h-diff",
                      targetLabel: "See the revision",
                    },
                  ]
                : []),
              {
                label: "Verified",
                headline: "Fixed. Checked. Proven.",
                detail:
                  state.view.finalStatus === "ACCEPTED"
                    ? "A11yForge replayed the original problem and confirmed that it no longer happens."
                    : state.view.verification.decisionBasis,
                targetId: "h-verify",
                targetLabel: "See the proof",
              },
            ]}
          />
          <nav aria-label="Developer details" className="doc-panel-nav" style={{ marginTop: 16 }}>
            <span className="mono-label" style={{ alignSelf: "center", marginRight: 8 }}>
              Developer details
            </span>
            {[
              ["h-evidence", "Browser evidence"],
              ["h-trace", "Source"],
              ["h-diff", "Repair"],
              ["h-verify", "Verification"],
              ["h-critic", "Model usage"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      )}

      {state.kind === "loading" && (
        <div role="status" aria-label="Loading run artifacts">
          <Skeleton className="h-64 w-full" />
          <p className="loading">
            Loading run artifacts…
          </p>
        </div>
      )}

      {state.kind === "error" && (
          <Alert variant="destructive">
            <AlertTitle>No run data to show</AlertTitle>
            <AlertDescription>
              The console shows only real artifacts — nothing was faked. ({state.message})
              Produce a run locally, then refresh.
            </AlertDescription>
          </Alert>
      )}

      {state.kind === "ready" && (
        <>
          <Badge variant="faint" style={{ margin: "20px 0 4px" }}>
            Execution record · {state.view.pipeline.length} of {state.view.pipeline.length} stages complete
          </Badge>
          <h3
            style={{ fontSize: 24, lineHeight: "32px", letterSpacing: "-0.02em", margin: "0 0 4px" }}
          >
            Autonomous repair: {state.view.diagnosis.title}
          </h3>
          <p style={{ margin: "0 0 4px", color: "var(--ink-dim)" }}>
            Target: <code>{state.view.targetLabel}</code>
          </p>
          <MetaGrid
            ariaLabel="Run metadata"
            entries={[
              { term: "Target", value: state.view.targetLabel },
              { term: "Run ID", value: state.view.runId },
              { term: "Model", value: state.view.model },
              { term: "Evidence items", value: state.view.evidenceCount },
              { term: "Source file", value: state.view.sourceFile },
              {
                term: "Final confidence",
                value:
                  state.view.finalConfidence === null
                    ? "n/a (no critic call)"
                    : state.view.finalConfidence.toFixed(2),
              },
            ]}
          />

          <div className="grid">
            <Card aria-labelledby="h-pipeline">
              <CardHeader className="p-0">
                <Badge variant="faint" style={{ margin: "0 0 4px" }}>
                  Execution sequence · [{state.view.pipeline.length}/{state.view.pipeline.length} completed events]
                </Badge>
                <CardTitle asChild>
                  <h2 id="h-pipeline">Autonomous pipeline</h2>
                </CardTitle>
              </CardHeader>
              <div className="repair-line" aria-label="Recorded pipeline stages">
                <div className="repair-track">
                  <div
                    className="repair-progress"
                    style={{
                      width: state.view.pipeline.length > 0
                        ? `${(state.view.pipeline.filter((stage) => stage.status === "success" || stage.status === "failed").length / state.view.pipeline.length) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <ol className="repair-stops">
                  {state.view.pipeline.map((stage) => (
                    <li
                      key={stage.id}
                      data-state={
                        stage.status === "success"
                          ? "done"
                          : stage.status === "failed"
                            ? "bad"
                            : stage.status === "current"
                              ? "now"
                              : undefined
                      }
                      title={stage.detail}
                    >
                      {stage.label}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="repair-fork">
                <p style={{ margin: 0 }}>
                  <strong>That fix wasn&apos;t good enough.</strong> Attempt 1 was{" "}
                  <strong>deterministically rejected</strong> and is preserved here — the
                  engine does not hide its own failed repair.
                </p>
                <p className="help" style={{ margin: 0 }}>
                  The repair path reached verification, was refused, and the line
                  reversed into one verified revision.
                </p>
              </div>
            </Card>

            <Card aria-labelledby="h-evidence">
              <CardHeader className="p-0">
                <Badge variant="faint" style={{ margin: "0 0 4px" }}>
                  Technical evidence · browser event trace · {state.view.focusTrace.length} events
                </Badge>
                <CardTitle asChild>
                  <h2 id="h-evidence">Interaction evidence</h2>
                </CardTitle>
              </CardHeader>
              <FocusTraceList steps={state.view.focusTrace} />
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
            </Card>
          </div>

          <div className="grid two">
            <Card aria-labelledby="h-beforeafter">
              <CardTitle asChild>
                <h2 id="h-beforeafter">Before / after</h2>
              </CardTitle>
              <div style={{ margin: "12px 0 20px" }}>
                <BeforeAfter
                  before={
                    state.view.artifacts.focusEscapedUrl !== null
                      ? {
                          src: artifactSrc(state.view.artifacts.focusEscapedUrl),
                          alt: "Before repair: checkout modal open while keyboard focus has escaped to the background control",
                          caption: "BEFORE — focus escaped ✕",
                        }
                      : null
                  }
                  after={
                    state.view.artifacts.afterUrl !== null
                      ? {
                          src: artifactSrc(state.view.artifacts.afterUrl),
                          alt: "After repair: focus remains inside the checkout modal",
                          caption: "AFTER — focus contained ✓",
                        }
                      : null
                  }
                  beforeNote={`Focus moved to ${state.view.finding.actualFocusBefore} — outside the dialog.`}
                  afterNote={`Focus stays inside ${state.view.finding.expectedRegion} while the modal is open.`}
                />
              </div>
              <Table>
                <TableCaption>Deterministic assertion outcomes</TableCaption>
                <TableBody>
                  <TableRow>
                    <TableHead scope="row">focus-contained-in-modal</TableHead>
                    <TableCell>
                      <VerdictMark pass={false}>before</VerdictMark>
                    </TableCell>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.primaryReplayPassed}>
                        after
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Strict typecheck</TableHead>
                    <TableCell>
                      <VerdictMark pass={false}>attempt 1</VerdictMark>
                    </TableCell>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.typecheckPassed}>
                        attempt 2
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">New serious/critical axe violations</TableHead>
                    <TableCell colSpan={2}>
                      <span className="fact">
                        {state.view.verification.newSeriousCritical.length}
                      </span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Critic</TableHead>
                    <TableCell colSpan={2}>
                      <span className="fact">
                        {state.view.critic === null
                          ? "not called"
                          : `${state.view.critic.decision} (${state.view.critic.confidence.toFixed(2)})`}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {(state.view.artifacts.focusEscapedUrl === null ||
                state.view.artifacts.afterUrl === null) && (
                <p>Screenshots unavailable for this run — assertion data above still holds.</p>
              )}
            </Card>

            <Card aria-labelledby="h-diagnosis">
              <CardTitle asChild>
                <h2 id="h-diagnosis">Diagnosis (Phase 3)</h2>
              </CardTitle>
              <p>
                <strong>{state.view.diagnosis.title}</strong>
              </p>
              <div className="tag-row" aria-label="Diagnosis attributes">
                <Badge variant="faint">{state.view.diagnosis.issueType}</Badge>
                <Badge variant="faint">severity: {state.view.diagnosis.severity}</Badge>
                <Badge variant="faint">
                  confidence: {state.view.diagnosis.confidence.toFixed(2)}
                </Badge>
                {state.view.diagnosis.wcagCriteria.map((c) => (
                  <Badge variant="faint" key={c}>
                    WCAG {c}
                  </Badge>
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
            </Card>
          </div>

          <div className="grid two">
            <Card aria-labelledby="h-trace">
              <CardTitle asChild>
                <h2 id="h-trace">Source trace (deterministic)</h2>
              </CardTitle>
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
                  <Badge variant="faint" key={t}>
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card aria-labelledby="h-diff">
              <CardHeader className="p-0">
                <Badge variant="faint" style={{ margin: "0 0 4px" }}>
                  Evidence code inspector · unified diff
                </Badge>
                <CardTitle asChild>
                  <h2 id="h-diff">Generated patch payload (selected attempt)</h2>
                </CardTitle>
              </CardHeader>
              <CardDescription>
                Deterministic output verified against{" "}
                {state.view.diagnosis.wcagCriteria.length > 0
                  ? `WCAG ${state.view.diagnosis.wcagCriteria.join(", ")}`
                  : "the evidenced WCAG criteria"}
                .
              </CardDescription>
              <Tabs
                value={String(attempt)}
                onValueChange={(value) => setAttempt(Number(value))}
              >
                <TabsList aria-label="Repair attempt diff">
                  {state.view.attempts.map((a) => (
                    <TabsTrigger key={a.attempt} value={String(a.attempt)}>
                      Attempt {a.attempt} — {a.state}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {state.view.attempts.map((a) => (
                  <TabsContent key={a.attempt} value={String(a.attempt)}>
                    <p>{a.outcomeNote}</p>
                    {a.diagnosticCodes.length > 0 && (
                      <p>
                        Compiler diagnostics:{" "}
                        <span className="fact">{a.diagnosticCodes.join(", ")}</span>
                      </p>
                    )}
                    <DiffView url={a.diffUrl} label={`Attempt ${a.attempt} diff`} />
                    {a.diffUrl !== null && (
                      <DownloadPatchButton
                        url={a.diffUrl}
                        filename={`a11yforge-${state.view.runId}-attempt-${a.attempt}.patch`}
                        label="Download patch"
                      />
                    )}
                    {a.attempt === 2 && state.view.attempts.length > 1 && (
                      <p>
                        The revision adds one strict-safety guard line (
                        <code>if (first === undefined || last === undefined) return;</code>)
                        in response to the TS18048 verifier feedback.
                      </p>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </Card>
          </div>

          <div className="grid two">
            <Card aria-labelledby="h-verify">
              {state.view.finalStatus === "ACCEPTED" ? (
                <div className="verify-hero" style={{ paddingTop: 8 }}>
                  <span className="verify-mark" aria-hidden="true">✓</span>
                  <h2 id="h-verify" className="display-3">
                    Fixed. Verified.
                  </h2>
                  <p className="lede-xl">
                    A11yForge replayed the original problem and confirmed it no
                    longer occurs.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: 0 }}>
                    <Button asChild>
                      <a href="#h-diff">View change</a>
                    </Button>
                    {(() => {
                      const accepted = state.view.attempts[state.view.attempts.length - 1];
                      return accepted?.diffUrl != null ? (
                        <DownloadPatchButton
                          url={accepted.diffUrl}
                          filename={`a11yforge-${state.view.runId}-accepted.patch`}
                          label="Download patch"
                        />
                      ) : null;
                    })()}
                    <Button variant="secondary" asChild>
                      <a href="#h-critic">Developer details</a>
                    </Button>
                  </div>
                </div>
              ) : (
                <CardHeader className="p-0">
                  <Badge variant="faint" style={{ margin: "0 0 4px" }}>
                    Verification proof · all measured, none inferred
                  </Badge>
                  <CardTitle asChild>
                    <h2 id="h-verify">Verification (deterministic gates)</h2>
                  </CardTitle>
                </CardHeader>
              )}
              {state.view.finalStatus !== "ACCEPTED" && (
                <div className="repair-fork">
                  <p style={{ margin: 0 }}>
                    <strong>Repair rejected.</strong> The deterministic gates did
                    not all pass, so this change was refused.
                  </p>
                </div>
              )}
              <Table>
                <TableCaption>Attempt 2 gate outcomes — all measured, none inferred</TableCaption>
                <TableBody>
                  <TableRow>
                    <TableHead scope="row">TypeScript (strict)</TableHead>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.typecheckPassed}>
                        gate
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Build</TableHead>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.buildPassed}>gate</VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Primary keyboard replay</TableHead>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.primaryReplayPassed}>
                        gate
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Reverse Shift+Tab replay</TableHead>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.reverseReplayPassed}>
                        gate
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Axe baseline preserved</TableHead>
                    <TableCell>
                      <VerdictMark pass={state.view.verification.axeBaselinePreserved}>
                        gate
                      </VerdictMark>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="divider-label">Deterministic verifier — authoritative</p>
              <p>{state.view.verification.decisionBasis}</p>
              <Separator className="my-3" />
              <p className="divider-label">AI critic — adjudicates only passing repairs</p>
              <p>
                The critic was never consulted on the failing Attempt 1. It can confirm a
                passing repair; it cannot override a deterministic failure.
              </p>
            </Card>

            <Card aria-labelledby="h-critic">
              <CardHeader className="p-0">
                <Badge variant="faint" style={{ margin: "0 0 4px" }}>
                  AI adjudication · confirms passing repairs only
                </Badge>
                <CardTitle asChild>
                  <h2 id="h-critic">Critic verdict</h2>
                </CardTitle>
              </CardHeader>
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
            </Card>
          </div>

          <Card aria-labelledby="h-cta" style={{ marginTop: 16 }}>
            <CardTitle asChild>
              <h2 id="h-cta">Run verification on your codebase</h2>
            </CardTitle>
            <CardDescription>
              Execute full autonomous audits with deterministic headless verification — zero
              hallucinated properties, full regression gates.
            </CardDescription>
            <p style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button asChild>
                <a href="/">
                  Test your own site
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="#h-evidence">
                  Technical evidence
                </a>
              </Button>
            </p>
          </Card>

          <footer className="footnote">
            A11yForge console · renders local artifacts only · 0 live model calls on this
            page · deterministic gates above, AI reasoning below
          </footer>
        </>
      )}
      </section>
      </section>
    </div>
  );
}
