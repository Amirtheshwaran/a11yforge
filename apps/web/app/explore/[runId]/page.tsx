"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type {
  ExplorationEvent,
  ExplorationFinding,
  ExplorationRun,
} from "@a11yforge/shared";
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
import { StageSteps } from "@/components/domain";
import { EvidenceViewer } from "@/components/evidence-viewer";
import { STAGE_ORDER, stageState } from "../../../lib/exploration-stages";
import {
  affectedCountOf,
  fixGuidanceOf,
  GROUP_ORDER,
  groupOf,
  humanFindingOf,
  humanLimitationOf,
  humanProgressOf,
  LIMITATION_SUPPORTING,
  pluralize,
  PROBLEM_GROUPS,
  ruleSlugOf,
  severityWordOf,
  shortPageOf,
  storyboardOf,
  tierOfSeverity,
  verdictOf,
  VERDICT_COPY,
  type GroupId,
} from "../../../lib/human-copy";
import { drawableHighlights } from "../../../lib/overlay";
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

function probeStatusGlyph(status: string): string {
  if (status === "failed") return "[✕]";
  if (status === "passed") return "[✓]";
  if (status === "not-tested") return "[—]";
  return "[!]";
}

function FindingTechnicalDetails({ finding }: { finding: ExplorationFinding }) {
  const slug = ruleSlugOf(finding);
  return (
    <div className="finding-evidence">
      {slug !== null && (
        <p className="badge-mono" style={{ margin: "0 0 8px" }}>
          Check: {slug}
        </p>
      )}
      <h4>How it was checked</h4>
      <ol>
        {finding.howReproduced.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
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
      <p className="std-refs">
        Probe: {finding.probeId} · Finding: {finding.findingId}
      </p>
    </div>
  );
}

function ConnectCta({ runId, findingId }: { runId: string; findingId: string }) {
  return (
    <div>
      <div className="finding-actions">
        <Button size="sm" asChild>
          <Link
            href={`/connect?run=${encodeURIComponent(runId)}&finding=${encodeURIComponent(findingId)}`}
          >
            Connect source
          </Link>
        </Button>
      </div>
      <p className="help mt-2" style={{ color: "var(--ink-dim)" }}>
        Connect source to check repair support. A11yForge can try to locate
        and repair supported issues once your code is connected.
      </p>
    </div>
  );
}

/** Compact card for observations (not confirmed problems). */
function ObservationCard({
  finding,
  runId,
  developer,
}: {
  finding: ExplorationFinding;
  runId: string;
  developer: boolean;
}) {
  const human = humanFindingOf(finding);
  const drawable = drawableHighlights(finding.highlights);
  const shot = finding.screenshots[0] ?? null;
  return (
    <article aria-labelledby={`finding-title-${finding.findingId}`}>
      <Card className="p-5">
        <CardHeader className="p-0">
          {developer && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {finding.severity.toUpperCase()}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge>
                    {categoryGlyph(finding.category)} {categoryLabel(finding.category)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{categoryHelp(finding.category)}</TooltipContent>
              </Tooltip>
            </div>
          )}
          <CardTitle asChild className="text-lg">
            <h3 id={`finding-title-${finding.findingId}`}>{human.title}</h3>
          </CardTitle>
          <CardDescription>{human.why}</CardDescription>
          <p className="font-mono text-[11px] text-inkdim">
            Where: <code>{developer ? finding.pageUrl : shortPageOf(finding.pageUrl)}</code>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ConnectCta runId={runId} findingId={finding.findingId} />
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value={`show-me-${finding.findingId}`}>
              <AccordionTrigger>Show me</AccordionTrigger>
              <AccordionContent>
                {shot !== null && drawable.length > 0 ? (
                  <EvidenceViewer
                    src={explorationShotSrc(runId, shot)}
                    alt={`Screenshot from the test showing where: ${human.title}`}
                    highlights={drawable}
                    selectedIndex={0}
                    onSelect={() => undefined}
                  />
                ) : (
                  <p className="help" style={{ color: "var(--ink-dim)" }}>
                    We found this problem but could not visually locate it in
                    the captured screenshot.
                  </p>
                )}
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value={`technical-${finding.findingId}`}>
                    <AccordionTrigger>Developer details</AccordionTrigger>
                    <AccordionContent>
                      <FindingTechnicalDetails finding={finding} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </article>
  );
}

/**
 * Guided walkthrough detail for one problem: visual evidence, plain
 * explanation, fix guidance, and navigation. Evidence-first, jargon-last.
 */
function WalkthroughItem({
  finding,
  runId,
  position,
  total,
  developer,
  elementIndex,
  onElementSelect,
  viewerRef,
  headingRef,
}: {
  finding: ExplorationFinding;
  runId: string;
  position: number;
  total: number;
  developer: boolean;
  elementIndex: number;
  onElementSelect: (index: number) => void;
  viewerRef: React.RefObject<HTMLDivElement | null>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const human = humanFindingOf(finding);
  const count = affectedCountOf(finding);
  const drawable = drawableHighlights(finding.highlights);
  const shot = finding.screenshots[0] ?? null;
  const selected = drawable.length === 0 ? 0 : Math.min(elementIndex, drawable.length - 1);
  const isKeyboard = finding.probeId === "keyboard-traversal";
  return (
    <div>
      <p className="badge-mono" aria-live="polite">
        Issue {position} of {total}
      </p>
      <h3 ref={headingRef} tabIndex={-1} className="outline-none" style={{ fontSize: 24, lineHeight: "32px", margin: "8px 0 4px" }}>
        {human.title}
      </h3>
      <p className="help" style={{ color: "var(--ink-dim)" }}>
        {severityWordOf(finding.severity)}
      </p>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6">
        <div className="lg:col-start-2 lg:row-start-2">
          <h4>What&apos;s wrong?</h4>
          <p>{human.title}.</p>
          <h4>Why it matters</h4>
          <p style={{ color: "var(--ink-dim)" }}>{human.why}</p>
          <h4>Where it happens</h4>
          <p className="font-mono text-[11px] text-inkdim">
            <code>{developer ? finding.pageUrl : shortPageOf(finding.pageUrl)}</code>
          </p>
          {count !== null && (
            <p className="font-mono text-[11px] text-inkdim">
              Affected: {pluralize(count, human.noun)}
            </p>
          )}
          {isKeyboard && (
            <>
              <h4>What happened</h4>
              <ol className="finding-steps">
                {storyboardOf(finding).map((step, index) => (
                  <li key={index}>
                    {step.marker !== "start" && <span aria-hidden="true">↓ Tab </span>}
                    {step.text}
                    {step.marker === "problem" && " ✕"}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div ref={viewerRef} className="lg:col-start-1 lg:row-start-2 lg:row-span-3 scroll-mt-4">
          {shot !== null && drawable.length > 0 ? (
            <EvidenceViewer
              src={explorationShotSrc(runId, shot)}
              alt={`Screenshot from the test showing where: ${human.title}`}
              highlights={drawable}
              selectedIndex={selected}
              onSelect={onElementSelect}
              caption="This is the exact element to look at."
            />
          ) : (
            <Card>
              <p className="help" style={{ color: "var(--ink-dim)" }}>
                We found this problem but could not visually locate it in the
                captured screenshot.
              </p>
              {shot !== null && (
                <img
                  src={explorationShotSrc(runId, shot)}
                  alt="Screenshot from the test showing the checked page"
                  loading="lazy"
                  style={{ display: "block", width: "100%", height: "auto", marginTop: 8 }}
                />
              )}
            </Card>
          )}
        </div>
        <div className="lg:col-start-2 lg:row-start-3">
          <h4>How do I fix this?</h4>
          <p>{fixGuidanceOf(finding)}</p>
          <ConnectCta runId={runId} findingId={finding.findingId} />
          <p style={{ marginTop: 12 }}>
            <Button size="sm" variant="secondary" asChild>
              <a href={finding.pageUrl} target="_blank" rel="noreferrer">
                Open affected page
              </a>
            </Button>
          </p>
        </div>
      </div>
      {developer && (
        <Card className="mt-4">
          <p className="badge-mono">
            {finding.severity.toUpperCase()} · {categoryGlyph(finding.category)} {categoryLabel(finding.category)}
          </p>
          <FindingTechnicalDetails finding={finding} />
        </Card>
      )}
      {!developer && (
        <Accordion type="single" collapsible className="mt-4">
          <AccordionItem value={`walk-technical-${finding.findingId}`}>
            <AccordionTrigger>Developer details</AccordionTrigger>
            <AccordionContent>
              <FindingTechnicalDetails finding={finding} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
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
  const [developer, setDeveloper] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failuresRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const finished = await fetchExploration(runId);
      failuresRef.current = 0;
      if (finished !== null) {
        setRun(finished);
        if (pollRef.current !== null) clearInterval(pollRef.current);
      }
    } catch {
      // The run record is unreachable (unknown id, server restarted).
      // After several consecutive failures, say so instead of waiting forever.
      failuresRef.current += 1;
      if (failuresRef.current >= 5) {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        setUnreachable(true);
      }
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
  const previous = events.length > 1 ? events[events.length - 2] ?? null : null;
  // Live-region restraint: announce only when the stage actually changes.
  const announceLatest = latest !== null && (previous === null || previous.stage !== latest.stage);
  const confirmed = run?.findings.filter((finding) => finding.category === "confirmed-failure") ?? [];
  const automated = run?.findings.filter((finding) => finding.category === "automated-finding") ?? [];
  const observations = run?.findings.filter((finding) => finding.category === "observation") ?? [];
  const notTestedFindings = run?.findings.filter((finding) => finding.category === "not-tested") ?? [];
  const shots = run?.screenshots ?? [];
  const newestShot = shots.length > 0 ? shots[shots.length - 1] : null;
  const problems = [...confirmed, ...automated];
  const issueCount = problems.length;
  const targetUrl = entryUrl !== "" ? entryUrl : (run?.target.entryUrl ?? "…");

  const backendStates = Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, stageState(stage, events, run)]),
  ) as Record<(typeof STAGE_ORDER)[number], "pending" | "running" | "done">;
  const progress = humanProgressOf(backendStates);
  const doneSteps = progress.filter((step) => step.state === "done").length;

  const tier0 = problems.filter((finding) => tierOfSeverity(finding.severity) === 0);
  const tier1 = problems.filter((finding) => tierOfSeverity(finding.severity) === 1);
  const tier2 = problems.filter((finding) => tierOfSeverity(finding.severity) === 2);
  const verdict = verdictOf(problems.map((finding) => finding.severity));
  const grouped = new Map<string, ExplorationFinding[]>();
  for (const finding of problems) {
    const group = groupOf(finding);
    const list = grouped.get(group) ?? [];
    list.push(finding);
    grouped.set(group, list);
  }
  const severityRank = (severity: ExplorationFinding["severity"]): number =>
    severity === "critical" ? 0 : severity === "serious" ? 1 : severity === "moderate" ? 2 : 3;
  for (const list of grouped.values()) {
    list.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }

  // Guided walkthrough: issue-by-issue review over the grouped problems.
  const [walk, setWalk] = useState<{ scope: "all" | GroupId; fi: number; ei: number } | null>(null);
  const walkHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const walkViewerRef = useRef<HTMLDivElement | null>(null);
  const walkSectionRef = useRef<HTMLElement | null>(null);

  const walkProblems: ExplorationFinding[] = [];
  for (const id of GROUP_ORDER) {
    const list = grouped.get(id);
    if (list !== undefined) walkProblems.push(...list);
  }

  function enterWalkthrough(scope: "all" | GroupId, fi = 0): void {
    setWalk({ scope, fi, ei: 0 });
  }

  const scopedWalk =
    walk === null
      ? []
      : walk.scope === "all"
        ? walkProblems
        : walkProblems.filter((finding) => groupOf(finding) === walk.scope);
  const walkFinding = walk === null ? null : (scopedWalk[Math.min(walk.fi, Math.max(scopedWalk.length - 1, 0))] ?? null);

  useEffect(() => {
    if (walk === null) return;
    walkSectionRef.current?.scrollIntoView({ block: "start" });
    walkHeadingRef.current?.focus({ preventScroll: true });
  }, [walk?.scope, walk?.fi]);

  return (
    <main className="landing-wide">
      <a className="skip-link" href="#result">
        Skip to result
      </a>

      {run === null && !unreachable && (
        <section aria-labelledby="run-title" id="result">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <Badge>
              Checking: <span className="normal-case text-ink">{shortPageOf(targetUrl)}</span>
            </Badge>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel check"}
            </Button>
          </Card>

          <div className="steps-grid" style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <Card className="overflow-hidden p-0" aria-label="Live browser view">
              {newestShot !== undefined && newestShot !== null ? (
                <img
                  src={explorationShotSrc(runId, newestShot)}
                  alt="Screenshot from the test browser showing the page being checked"
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
              ) : (
                <div className="p-8 text-center" role="status" aria-label="Live browser view">
                  <Skeleton className="mx-auto h-48 w-full" />
                  <p className="help mt-3">
                    Waiting for browser evidence…
                  </p>
                </div>
              )}
              <p className="help px-4 py-2">
                This is what the test browser sees right now.
              </p>
            </Card>

            <div style={{ display: "grid", gap: 16 }}>
              <Card aria-labelledby="run-title">
                <CardTitle asChild>
                  <h1 id="run-title">Checking your website…</h1>
                </CardTitle>
                <Progress
                  value={(doneSteps / progress.length) * 100}
                  aria-label={`${doneSteps} of ${progress.length} check steps complete`}
                />
                <StageSteps steps={progress} ariaLabel="Check steps" />
                <p className="help mt-3" style={{ color: "var(--ink-dim)" }}>
                  This usually checks things like text readability, missing
                  labels, keyboard navigation, and page structure.
                </p>
                {announceLatest && latest !== null && (
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

              <Accordion type="single" collapsible>
                <AccordionItem value="testing-technical">
                  <AccordionTrigger>Developer details</AccordionTrigger>
                  <AccordionContent>
                    <Badge variant="faint">Steps observed: {events.length} · Run: {runId}</Badge>
                    {latest !== null && (
                      <p className="help mt-2" style={{ color: "var(--ink-dim)" }}>
                        Current action: {latest.message}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </section>
      )}

      {run === null && unreachable && (
        <section aria-labelledby="missing-title" id="result">
          <h1 id="missing-title" style={{ fontSize: 36, lineHeight: "44px", letterSpacing: "-0.03em" }}>
            We couldn&apos;t find this check
          </h1>
          <Card style={{ marginTop: 16 }}>
            <p className="lede mt-2">
              This check may have run on a server that has since restarted, so
              its progress is no longer available.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <Button asChild>
                <Link href="/">Check a website</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/console">See the recorded example instead</Link>
              </Button>
            </div>
          </Card>
        </section>
      )}

      {run !== null && run.state === "COMPLETED" && (
        <section aria-labelledby="run-title" id="result">
          <header style={{ padding: "24px 0" }}>
            <h1 id="run-title" style={{ fontSize: 36, lineHeight: "44px", letterSpacing: "-0.03em", margin: "8px 0" }}>
              {issueCount > 0 ? `We found ${issueCount} accessibility ${issueCount === 1 ? "problem" : "problems"}` : "We didn’t find any major accessibility problems"}
            </h1>
            <p className="help" style={{ color: "var(--ink-dim)" }}>
              {issueCount > 0
                ? `On this page: ${shortPageOf(run.target.entryUrl)}`
                : "in the parts of the site we tested."}
            </p>
          </header>
          <Separator />

          {issueCount > 0 ? (
            <>
              <section aria-label="Summary" style={{ padding: "24px 0" }}>
                <p style={{ fontSize: 24, lineHeight: "32px", fontWeight: 600, margin: "0 0 4px" }}>
                  {VERDICT_COPY[verdict]}
                </p>
                {tier0.length > 0 && (
                  <p className="lede">
                    Start here: {tier0.length === 1 ? "1 problem needs attention first." : `${tier0.length} problems need attention first.`}{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-base"
                      onClick={() =>
                        enterWalkthrough(
                          "all",
                          Math.max(
                            walkProblems.findIndex((finding) => tierOfSeverity(finding.severity) === 0),
                            0,
                          ),
                        )
                      }
                    >
                      View important problems
                    </Button>
                  </p>
                )}
                <p className="help" style={{ color: "var(--ink-dim)" }}>
                  Also found:{" "}
                  {[
                    tier1.length > 0 ? `${tier1.length} may make the site harder to use` : null,
                    tier2.length > 0 ? `${tier2.length} are smaller improvements` : null,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ") || "nothing else"}
                  {observations.length > 0 && ` · ${observations.length} ${observations.length === 1 ? "observation" : "observations"}`}
                </p>
                <div role="group" aria-label="Detail level" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button
                    size="sm"
                    variant={developer ? "secondary" : "default"}
                    aria-pressed={!developer}
                    onClick={() => setDeveloper(false)}
                  >
                    Simple view
                  </Button>
                  <Button
                    size="sm"
                    variant={developer ? "default" : "secondary"}
                    aria-pressed={developer}
                    onClick={() => setDeveloper(true)}
                  >
                    Developer view
                  </Button>
                </div>
                {developer && (
                  <Card className="mt-4">
                    <Badge variant="faint">
                      Run: {run.runId} · {run.pagesVisited.length} pages checked · {run.probeResults.length} interaction checks ·{" "}
                      {notTestedFindings.length} could not be tested
                    </Badge>
                  </Card>
                )}
                <p style={{ marginTop: 16 }}>
                  <Button size="lg" onClick={() => enterWalkthrough("all")}>
                    Review {issueCount} {issueCount === 1 ? "problem" : "problems"}
                  </Button>
                </p>
              </section>

              {walk !== null && walkFinding !== null && (
                <section ref={walkSectionRef} aria-labelledby="walkthrough-title" className="scroll-mt-4" style={{ padding: "24px 0" }}>
                  <h2 id="walkthrough-title" style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 4px" }}>
                    {walk.scope === "all" ? "Review problems" : `Review: ${PROBLEM_GROUPS[walk.scope].heading}`}
                  </h2>
                  <ol className="walk-mini-nav" aria-label="All problems in this review">
                    {scopedWalk.map((item, index) => {
                      const itemHuman = humanFindingOf(item);
                      const shortTitle =
                        itemHuman.title.length > 48 ? `${itemHuman.title.slice(0, 45)}…` : itemHuman.title;
                      const active = walk !== null && index === Math.min(walk.fi, scopedWalk.length - 1);
                      return (
                        <li key={item.findingId}>
                          <Button
                            size="sm"
                            variant={active ? "default" : "secondary"}
                            aria-current={active ? "true" : undefined}
                            aria-label={`Issue ${index + 1} of ${scopedWalk.length}: ${itemHuman.title}`}
                            onClick={() => setWalk({ scope: walk.scope, fi: index, ei: 0 })}
                          >
                            {index + 1} · {shortTitle}
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                  <WalkthroughItem
                    finding={walkFinding}
                    runId={runId}
                    position={Math.min(walk.fi, scopedWalk.length - 1) + 1}
                    total={scopedWalk.length}
                    developer={developer}
                    elementIndex={walk.ei}
                    onElementSelect={(index) => setWalk({ scope: walk.scope, fi: walk.fi, ei: index })}
                    viewerRef={walkViewerRef}
                    headingRef={walkHeadingRef}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                    <Button
                      variant="secondary"
                      disabled={walk.fi <= 0}
                      onClick={() => setWalk({ scope: walk.scope, fi: walk.fi - 1, ei: 0 })}
                      aria-label="Previous issue"
                    >
                      ← Previous issue
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={walk.fi >= scopedWalk.length - 1}
                      onClick={() => setWalk({ scope: walk.scope, fi: walk.fi + 1, ei: 0 })}
                      aria-label="Next issue"
                    >
                      Next issue →
                    </Button>
                    <Button variant="link" onClick={() => setWalk(null)}>
                      Back to summary
                    </Button>
                  </div>
                </section>
              )}

              {GROUP_ORDER.filter((id) => (grouped.get(id) ?? []).length > 0).map((id) => {
                const group = PROBLEM_GROUPS[id];
                const list = grouped.get(id) ?? [];
                const urgent = list.filter((finding) => tierOfSeverity(finding.severity) === 0).length;
                return (
                  <section key={id} aria-labelledby={`group-title-${id}`} style={{ padding: "24px 0" }}>
                    <h2 id={`group-title-${id}`} style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 4px" }}>
                      {group.heading}
                    </h2>
                    <p className="help">{group.description}</p>
                    <p className="help" style={{ color: "var(--ink-dim)" }}>
                      {list.length} {list.length === 1 ? "problem" : "problems"}
                      {urgent > 0 && ` · ${urgent} ${urgent === 1 ? "needs" : "need"} attention first`}
                    </p>
                    <p style={{ marginTop: 8 }}>
                      <Button variant="secondary" onClick={() => enterWalkthrough(id)}>
                        Review {list.length} {list.length === 1 ? "problem" : "problems"}
                      </Button>
                    </p>
                  </section>
                );
              })}

              {observations.length > 0 && (
                <section aria-labelledby="observations-title" style={{ padding: "24px 0" }}>
                  <h2 id="observations-title" style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 4px" }}>
                    Also noticed
                  </h2>
                  <p className="help">Things worth knowing that are not confirmed problems.</p>
                  <div className="findings">
                    {observations.map((finding) => (
                      <ObservationCard key={finding.findingId} finding={finding} runId={runId} developer={developer} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <Card style={{ margin: "24px 0" }}>
              <Badge>[✓] Check complete</Badge>
              <p className="lede mt-2">We didn’t find any major accessibility problems in the parts of the site we tested.</p>
              <p className="help" style={{ color: "var(--ink-dim)" }}>
                This does not guarantee the entire website is accessible.
              </p>
              <Card className="bg-sunken">
                <Badge variant="faint">
                  Pages checked: {run.pagesVisited.length} · Interactions checked: {run.probeResults.length} ·{" "}
                  Could not be tested safely: {notTestedFindings.length}
                </Badge>
              </Card>
              {developer && run.probeResults.length > 0 && (
                <>
                  <h2 className="mt-4 text-base font-semibold">Verified checks</h2>
                  <Table>
                    <TableCaption>Interaction checks run in this test</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Check</TableHead>
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

          {(notTestedFindings.length > 0 || run.limitations.length > 0) && (
            <Card style={{ margin: "24px 0" }} aria-labelledby="coverage-title">
              <Badge>[—] What we couldn&apos;t check</Badge>
              <CardTitle asChild className="mt-2">
                <h2 id="coverage-title">What we couldn&apos;t check</h2>
              </CardTitle>
              <CardDescription>
                {(() => {
                  const unavailable = run.limitations.filter((item) => item.code === "page-unavailable").length;
                  if (unavailable > 0) {
                    return (
                      <>
                        {humanLimitationOf("page-unavailable", unavailable)}.{" "}
                        {LIMITATION_SUPPORTING["page-unavailable"]}
                      </>
                    );
                  }
                  return "Some parts of the site could not be checked safely in this run.";
                })()}
              </CardDescription>
              {notTestedFindings.length > 0 && (
                <p className="help" style={{ color: "var(--ink-dim)" }}>
                  {notTestedFindings.length} {notTestedFindings.length === 1 ? "interaction was" : "interactions were"} skipped because A11yForge could not establish that trying {notTestedFindings.length === 1 ? "it was" : "them was"} safe.
                </p>
              )}
              <Accordion type="single" collapsible>
                <AccordionItem value="coverage-technical">
                  <AccordionTrigger>Developer details</AccordionTrigger>
                  <AccordionContent>
                    <ul>
                      {notTestedFindings.map((finding) => (
                        <li key={finding.findingId}>
                          <strong>{humanFindingOf(finding).title}</strong>{" "}
                          <span className="std-refs">[{finding.category}] {finding.findingId}</span>
                        </li>
                      ))}
                      {run.limitations.map((limitation, index) => (
                        <li key={`limit-${index}`}>
                          <span className="std-refs">[{limitation.code}]</span> {limitation.message}
                          {limitation.pageUrl !== "" && <span className="std-refs"> — {limitation.pageUrl}</span>}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>
          )}

          <Accordion type="single" collapsible className="tech-evidence">
            <AccordionItem value="tech-evidence">
              <AccordionTrigger>Developer details</AccordionTrigger>
              <AccordionContent>
                <p>
                  Raw check results and page information for advanced users.{" "}
                  <Link href="/console">Open the full developer console</Link>
                </p>
                <p>No model calls were used for this check — findings come from deterministic browser checks only.</p>
                <pre aria-label="Technical evidence JSON" tabIndex={0}>{JSON.stringify({ pages: run.pagesVisited, probes: run.probeResults.map((probe) => ({ id: probe.probeId, status: probe.status, page: probe.pageUrl })) }, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {developer && (
            <Card className="mt-4">
              <CardTitle asChild>
                <h2>Developer information</h2>
              </CardTitle>
              <Table>
                <TableCaption>Severity and category per problem (developer view)</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Problem</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problems.map((finding) => (
                    <TableRow key={finding.findingId}>
                      <TableCell className="std-refs">{finding.findingId}</TableCell>
                      <TableCell>{finding.severity}</TableCell>
                      <TableCell>{finding.category}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <section aria-label="Next steps" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "24px 0" }}>
            <Button asChild>
              <Link href="/">Check another website</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/console">Developer details</Link>
            </Button>
          </section>
        </section>
      )}

      {run !== null && run.state !== "COMPLETED" && (
        <section aria-labelledby="run-title" id="result">
          <Badge>
            {run.state === "CANCELLED" ? "Check cancelled" : "We couldn't open this website"}
          </Badge>
          <h1 id="run-title" style={{ fontSize: 36, lineHeight: "44px", letterSpacing: "-0.03em" }}>
            {run.state === "CANCELLED" ? "Check cancelled" : "We couldn't open this website"}
          </h1>
          <Card>
            <p className="lede mt-2">
              {run.state === "CANCELLED"
                ? "The check was cancelled. Partial results are shown honestly — nothing was backfilled."
                : (run.error ?? "The check could not finish.")}
            </p>
            {run.limitations.map((limitation, index) => (
              <p key={index} className="help">
                {limitation.message}
              </p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <Button asChild>
                <Link href="/">Check another website</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/console">See the recorded example instead</Link>
              </Button>
            </div>
          </Card>
        </section>
      )}

      <footer className="product-foot">
        <p>
          <Link href="/">Check another website</Link>
          {" · "}
          <Link href="/console">Developer console</Link>
        </p>
      </footer>
    </main>
  );
}
