"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  EXPLORATION_STAGE_LABELS,
  type ExplorationEvent,
  type ExplorationFinding,
  type ExplorationRun,
} from "@a11yforge/shared";
import { STAGE_ORDER, stageState } from "../../../lib/exploration-stages";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StageSteps, type StageStep } from "@/components/domain";
import {
  cancelExploration,
  explorationShotSrc,
  fetchExploration,
  subscribeExplorationEvents,
} from "../../../lib/api";

function categoryLabel(category: ExplorationFinding["category"]): string {
  if (category === "confirmed-failure") return "Confirmed failure";
  if (category === "automated-finding") return "Automated finding";
  if (category === "observation") return "Observation";
  return "Not tested";
}

function categoryGlyph(category: ExplorationFinding["category"]): string {
  if (category === "confirmed-failure") return "[✕]";
  if (category === "automated-finding") return "[!]";
  if (category === "observation") return "[i]";
  return "[—]";
}

function categoryHelp(category: ExplorationFinding["category"]): string {
  if (category === "confirmed-failure")
    return "Reproduced live in the browser: the failure was observed, not inferred.";
  if (category === "automated-finding")
    return "Flagged by an automated WCAG rule check during the crawl.";
  if (category === "observation") return "Noted during exploration; not a confirmed failure.";
  return "Skipped: the interaction could not be tested safely.";
}

function severityGlyph(severity: ExplorationFinding["severity"]): string {
  if (severity === "critical" || severity === "serious") return "[✕]";
  if (severity === "moderate") return "[!]";
  if (severity === "minor") return "[i]";
  return "[—]";
}

function probeStatusGlyph(status: string): string {
  if (status === "failed") return "[✕]";
  if (status === "passed") return "[✓]";
  if (status === "not-tested") return "[—]";
  return "[!]";
}

function FindingCard({ finding, runId, run }: { finding: ExplorationFinding; runId: string; run: ExplorationRun }) {
  const evidenceId = `evidence-${finding.findingId}`;
  const probe = run.probeResults.find((candidate) => candidate.probeId === finding.probeId) ?? null;
  const criterion = finding.standardReferences.length > 0 ? finding.standardReferences[0] : null;
  return (
    <article aria-labelledby={`finding-title-${finding.findingId}`}>
      <Card className="p-5">
        <CardHeader className="p-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {severityGlyph(finding.severity)} {finding.severity.toUpperCase()}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge>
                  {categoryGlyph(finding.category)} {categoryLabel(finding.category)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{categoryHelp(finding.category)}</TooltipContent>
            </Tooltip>
            {criterion !== null && criterion !== undefined && (
              <Badge variant="faint">Criterion: {criterion}</Badge>
            )}
          </div>
          <CardTitle asChild className="text-lg">
            <h3 id={`finding-title-${finding.findingId}`}>{finding.title}</h3>
          </CardTitle>
          <CardDescription>{finding.whatHappened}</CardDescription>
          <p className="font-mono text-[11px] text-inkdim">
            Location: <code>{finding.pageUrl}</code>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="finding-actions">
            <Button size="sm" asChild>
              <Link
                href={`/connect?run=${encodeURIComponent(runId)}&finding=${encodeURIComponent(finding.findingId)}`}
              >
                Connect source to repair
              </Link>
            </Button>
          </div>
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value={evidenceId}>
              <AccordionTrigger>See evidence</AccordionTrigger>
              <AccordionContent>
                <div className="finding-evidence">
                  <h4>Why this matters</h4>
                  <p style={{ color: "var(--ink-dim)" }}>{finding.whyItMatters}</p>
                  <h4>How we reproduced it</h4>
                  <ol>
                    {finding.howReproduced.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                  {probe !== null && probe.actionTrace.length > 0 && (
                    <>
                      <h4>Interaction trace</h4>
                      <ol>
                        {probe.actionTrace.map((step) => (
                          <li key={step.seq}>
                            <span className="kbd">{step.action}</span> {step.detail !== "" ? `— ${step.detail}` : ""}{" "}
                            <span className="std-refs">{step.pageUrl}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {finding.screenshots.map((shot) => (
                    <img
                      key={shot}
                      src={explorationShotSrc(runId, shot)}
                      alt={`Screenshot of the page where: ${finding.title}`}
                      loading="lazy"
                    />
                  ))}
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </article>
  );
}

export default function ExploreRunPage(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="landing"><p className="loading">Loading test…</p></main>}>
      <ExploreRunContent />
    </Suspense>
  );
}

function ExploreRunContent(): React.JSX.Element {
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
  const observations = run?.findings.filter((finding) => finding.category === "observation") ?? [];
  const notTestedFindings = run?.findings.filter((finding) => finding.category === "not-tested") ?? [];
  const shots = run?.screenshots ?? [];
  const newestShot = shots.length > 0 ? shots[shots.length - 1] : null;
  const issueCount = confirmed.length + automated.length;
  const targetUrl = entryUrl !== "" ? entryUrl : (run?.target.entryUrl ?? "…");
  const steps: StageStep[] = STAGE_ORDER.map((stage) => ({
    id: stage,
    label: EXPLORATION_STAGE_LABELS[stage],
    state: stageState(stage, events, run),
  }));
  const doneSteps = steps.filter((step) => step.state === "done").length;

  return (
    <main className="landing-wide">
      <a className="skip-link" href="#result">
        Skip to result
      </a>

      {run === null && (
        <section aria-labelledby="run-title" id="result">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <Badge>
              <span aria-hidden="true">●</span> Testing: <span className="normal-case text-ink">{targetUrl}</span>
            </Badge>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel test"}
            </Button>
          </Card>

          <div className="steps-grid" style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <Card className="overflow-hidden p-0" aria-label="Live browser viewport">
              {newestShot !== undefined && newestShot !== null ? (
                <img
                  src={explorationShotSrc(runId, newestShot)}
                  alt="Screenshot captured by the test browser on the tested page"
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
              ) : (
                <div className="p-8 text-center" role="status" aria-label="Live browser viewport">
                  <Skeleton className="mx-auto h-48 w-full" />
                  <p className="help mt-3">
                    Live browser viewport — screenshot appears here once captured.
                  </p>
                </div>
              )}
              <p className="help px-4 py-2">
                Headless Chromium viewport · real deterministic test in an isolated environment.
              </p>
            </Card>

            <div style={{ display: "grid", gap: 16 }}>
              <Card aria-labelledby="run-title">
                <CardTitle asChild>
                  <h1 id="run-title">Testing accessibility…</h1>
                </CardTitle>
                <Progress
                  value={(doneSteps / STAGE_ORDER.length) * 100}
                  aria-label={`${doneSteps} of ${STAGE_ORDER.length} testing stages complete`}
                />
                <StageSteps steps={steps} ariaLabel="Testing steps" />
                {latest !== null && (
                  <p className="latest" role="status" aria-live="polite">
                    {latest.message}
                  </p>
                )}
                {error !== null && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </Card>

              <Card aria-labelledby="diag-title">
                <CardTitle asChild className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">
                  <h2 id="diag-title">Diagnostics feed</h2>
                </CardTitle>
                <Badge variant="faint">Steps observed: {events.length} · Run: {runId}</Badge>
                {latest !== null && (
                  <p className="help mt-2" style={{ color: "var(--ink-dim)" }}>
                    Current action: {latest.message}
                  </p>
                )}
              </Card>
            </div>
          </div>
        </section>
      )}

      {run !== null && run.state === "COMPLETED" && (
        <section aria-labelledby="run-title" id="result">
          <header style={{ padding: "24px 0" }}>
            <Badge>
              <span aria-hidden="true">●</span> Run ID: {run.runId} / Execution status: Complete
            </Badge>
            <h1 id="run-title" style={{ fontSize: 36, lineHeight: "44px", letterSpacing: "-0.03em", margin: "8px 0" }}>
              {issueCount > 0 ? "Accessibility test complete" : "No accessibility failures were reproduced"}
            </h1>
            <p className="help" style={{ color: "var(--ink-dim)" }}>
              Target: <span style={{ color: "var(--ink)" }}>{run.target.entryUrl}</span>
            </p>
          </header>
          <Separator />

          {issueCount > 0 ? (
            <section aria-label="Diagnostic run summary" style={{ padding: "24px 0" }}>
              <p style={{ fontSize: 36, lineHeight: "44px", fontWeight: 600, margin: 0 }}>
                {issueCount} {issueCount === 1 ? "issue" : "issues"} found
              </p>
              <p className="lede">
                {confirmed.length} confirmed interaction {confirmed.length === 1 ? "failure" : "failures"} · {automated.length} automated{" "}
                {automated.length === 1 ? "finding" : "findings"}
                {observations.length > 0 && ` · ${observations.length} ${observations.length === 1 ? "observation" : "observations"}`}
              </p>
              <Card>
                <Badge variant="faint">
                  {run.pagesVisited.length} pages tested · {run.probeResults.length} interaction probes executed ·{" "}
                  {notTestedFindings.length} interactions could not be safely tested
                </Badge>
              </Card>
            </section>
          ) : (
            <Card style={{ margin: "24px 0" }}>
              <Badge>[✓] Run completed · WCAG 2.2 strict</Badge>
              <p className="lede mt-2">No accessibility failures were reproduced in the interactions A11yForge tested.</p>
              <Card className="bg-sunken">
                <Badge variant="faint">
                  {run.pagesVisited.length} pages tested · {run.probeResults.length} accessibility probes executed ·{" "}
                  {notTestedFindings.length} interactions not tested
                </Badge>
              </Card>
              {run.probeResults.length > 0 && (
                <>
                  <h2 className="mt-4 text-base font-semibold">Verified test vectors</h2>
                  <Table>
                    <TableCaption>Interaction probes executed in this run</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Probe</TableHead>
                        <TableHead>Page</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {run.probeResults.map((probe) => (
                        <TableRow key={probe.probeId}>
                          <TableCell>
                            <strong>{probe.title}</strong>
                            <br />
                            <span className="std-refs">{probe.probeId}</span>
                          </TableCell>
                          <TableCell className="std-refs">{probe.pageUrl}</TableCell>
                          <TableCell>
                            <span className={probe.status === "failed" ? "status-fail" : probe.status === "passed" ? "status-pass" : "status-untested"}>
                              {probeStatusGlyph(probe.status)} {probe.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Card>
          )}

          {newestShot !== undefined && newestShot !== null && (
            <Card className="overflow-hidden p-0">
              <img
                src={explorationShotSrc(runId, newestShot)}
                alt="Screenshot captured by the test browser on the tested page"
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              <p className="help px-4 py-2">
                Captured by the real browser during this test.
              </p>
            </Card>
          )}

          {run.findings.filter((finding) => finding.category !== "not-tested").length > 0 && (
            <section aria-labelledby="findings-heading" style={{ padding: "24px 0" }}>
              <h2 id="findings-heading" style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 4px" }}>
                Identified failures
              </h2>
              <p className="help">Failures verified against WCAG 2.2 Level AA and AAA behavioral criteria. Ordered by severity.</p>
              <div className="findings">
                {run.findings
                  .filter((finding) => finding.category !== "not-tested")
                  .map((finding) => (
                    <FindingCard key={finding.findingId} finding={finding} runId={runId} run={run} />
                  ))}
              </div>
            </section>
          )}

          {(notTestedFindings.length > 0 || run.limitations.length > 0) && (
            <Card style={{ margin: "24px 0" }} aria-labelledby="coverage-title">
              <Badge>[—] Neutral safety exclusion</Badge>
              <CardTitle asChild className="mt-2">
                <h2 id="coverage-title">What we couldn&apos;t test</h2>
              </CardTitle>
              <CardDescription>
                {notTestedFindings.length > 0
                  ? `${notTestedFindings.length} ${notTestedFindings.length === 1 ? "interaction was" : "interactions were"} skipped because A11yForge could not establish that activating ${notTestedFindings.length === 1 ? "it was" : "them was"} reversible.`
                  : "Some interactions could not be safely tested in this run."}
              </CardDescription>
              <ul>
                {notTestedFindings.map((finding) => (
                  <li key={finding.findingId}>
                    <strong>{finding.title}</strong> <Badge variant="faint">[—] Untested</Badge>
                    <br />
                    <span className="std-refs">{finding.whatHappened}</span>
                  </li>
                ))}
                {run.limitations.map((limitation, index) => (
                  <li key={`limit-${index}`}>
                    <Badge variant="faint">{limitation.code}</Badge> {limitation.message}
                    {limitation.pageUrl !== "" && <span className="std-refs"> — {limitation.pageUrl}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Accordion type="single" collapsible className="tech-evidence">
            <AccordionItem value="tech-evidence">
              <AccordionTrigger>View technical evidence</AccordionTrigger>
              <AccordionContent>
                <p>
                  Raw probe results, interaction traces, and page surfaces for advanced users.{" "}
                  <Link href="/console">Open the full repair-evidence console</Link>
                </p>
                <p>No model calls were used for this exploration — findings come from deterministic browser checks only.</p>
                <pre aria-label="Technical evidence JSON" tabIndex={0}>{JSON.stringify({ pages: run.pagesVisited, probes: run.probeResults.map((probe) => ({ id: probe.probeId, status: probe.status, page: probe.pageUrl })) }, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <section aria-label="Next steps" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "24px 0" }}>
            <Button asChild>
              <Link href="/">Test another site</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/console">Technical evidence</Link>
            </Button>
          </section>
        </section>
      )}

      {run !== null && run.state !== "COMPLETED" && (
        <section aria-labelledby="run-title" id="result">
          <Badge>
            <span aria-hidden="true">{run.state === "CANCELLED" ? "[—]" : "[✕]"}</span> Run ID: {run.runId} / Execution status:{" "}
            {run.state === "CANCELLED" ? "Cancelled" : run.state}
          </Badge>
          <h1 id="run-title" style={{ fontSize: 36, lineHeight: "44px", letterSpacing: "-0.03em" }}>
            {run.state === "CANCELLED" ? "Test cancelled" : "We couldn't open this website"}
          </h1>
          <Card>
            <Badge variant={run.state === "CANCELLED" ? "faint" : "outline"}>
              {run.state === "CANCELLED" ? "[—] Cancelled" : "[✕] Failure status: could not finish"}
            </Badge>
            <p className="lede mt-2">
              {run.state === "CANCELLED"
                ? "The test was cancelled. Partial results are shown honestly — nothing was backfilled."
                : (run.error ?? "The test could not finish.")}
            </p>
            <Card className="bg-sunken">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ marginBottom: 4 }}>Target specification</p>
              <Badge variant="faint">
                Request URI: {run.target.entryUrl}
              </Badge>
            </Card>
            {run.limitations.map((limitation, index) => (
              <p key={index} className="help">
                <Badge variant="faint">{limitation.code}</Badge> {limitation.message}
              </p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <Button asChild>
                <Link href="/">Test another website</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/console">See the recorded repair demo instead</Link>
              </Button>
            </div>
          </Card>
        </section>
      )}

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
