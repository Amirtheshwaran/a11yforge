"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EvidenceViewer } from "@/components/evidence-viewer";
import { IssueWalkthrough } from "@/components/issue-walkthrough";
import { SpatialTour } from "@/components/spatial-tour/spatial-tour";
import { liveTourModel } from "../../../lib/tour-model";
import {
  EvidenceFallback,
  FindingListFallback,
} from "@/components/finding-list-fallback";
import { STAGE_ORDER, stageState } from "../../../lib/exploration-stages";
import {
  GROUP_ORDER,
  groupOf,
  humanFindingOf,
  humanLimitationOf,
  humanProgressOf,
  LIMITATION_SUPPORTING,
  PROBLEM_GROUPS,
  shortPageOf,
  storyboardOf,
  tierOfSeverity,
  verdictOf,
  VERDICT_COPY,
  type GroupId,
} from "../../../lib/human-copy";
import { drawableHighlights } from "../../../lib/overlay";
import {
  buildSceneNodes,
  fitDistanceFor,
  focusPathOf,
  highlightToPlane,
  planeSizeFor,
  repairStateFromStages,
  type CameraRequest,
  type FindingSceneNode,
  type RepairState,
} from "../../../lib/scene-model";
import {
  cancelExploration,
  explorationShotSrc,
  fetchExploration,
  fetchSourceTrace,
  subscribeExplorationEvents,
  subscribeRunEvents,
} from "../../../lib/api";
import { prefersReducedMotion, revealIn } from "../../../lib/motion";

const SpatialScene = dynamic(
  () =>
    import("../../../components/scene/AccessibilityScene").then((m) => ({
      default: m.AccessibilityScene,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="scene-loading" role="status">
        <p className="help">Loading 3D map…</p>
      </div>
    ),
  },
);

function probeStatusGlyph(status: string): string {
  if (status === "failed") return "[✕]";
  if (status === "passed") return "[✓]";
  if (status === "not-tested") return "[—]";
  return "[!]";
}

export default function ExploreRunPage(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="landing"><p className="loading">Loading test…</p></main>}>
      <ExploreRunContent />
    </Suspense>
  );
}

/** Plane-space center of one affected element (camera + outline target). */
function elementCenterOf(
  finding: ExplorationFinding,
  elementIndex: number,
  screenshot: string,
): { x: number; y: number; w: number; h: number } | null {
  const drawable = drawableHighlights(finding.highlights).filter(
    (highlight) => highlight.screenshot === screenshot,
  );
  const box = drawable[Math.min(Math.max(elementIndex, 0), Math.max(drawable.length - 1, 0))] ?? null;
  if (box === null || box.viewportWidth <= 0 || box.viewportHeight <= 0) return null;
  const plane = planeSizeFor(box.viewportWidth, box.viewportHeight);
  const { center, rect } = highlightToPlane(box, plane);
  return { x: center.x, y: center.y, w: rect.width, h: rect.height };
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
          <CardTitle asChild className="text-lg">
            <h3 id={`finding-title-${finding.findingId}`}>{human.title}</h3>
          </CardTitle>
          <CardDescription>{human.why}</CardDescription>
          <p className="font-mono text-[11px] text-inkdim">
            Where: <code>{developer ? finding.pageUrl : shortPageOf(finding.pageUrl)}</code>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="finding-actions">
            <Button size="sm" asChild>
              <Link
                href={`/connect?run=${encodeURIComponent(runId)}&finding=${encodeURIComponent(finding.findingId)}`}
              >
                Connect source
              </Link>
            </Button>
          </div>
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </article>
  );
}

function ExploreRunContent(): React.JSX.Element {
  const params = useParams<{ runId: string }>();
  const search = useSearchParams();
  const runId = params.runId;
  const entryUrl = search.get("url") ?? "";
  const sourceIdParam = search.get("source") ?? "";
  const repairRunParam = search.get("repair") ?? "";

  const [events, setEvents] = useState<ExplorationEvent[]>([]);
  const [run, setRun] = useState<ExplorationRun | null>(null);
  const [showDetailedEvidence, setShowDetailedEvidence] = useState(false);
  const tourModel = useMemo(() => run === null ? null : liveTourModel(run, (name) => explorationShotSrc(runId, name), humanFindingOf), [run, runId]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [developer, setDeveloper] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [storyPlaying, setStoryPlaying] = useState(false);
  const [repairStages, setRepairStages] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failuresRef = useRef(0);
  const cameraNonce = useRef(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    try {
      const finished = await fetchExploration(runId);
      failuresRef.current = 0;
      if (finished !== null) {
        setRun(finished);
        if (pollRef.current !== null) clearInterval(pollRef.current);
      }
    } catch {
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

  // Linked repair run (explicit ?repair=<runId>): fold its real backend
  // stages into marker repair states. Absent linkage stays unresolved.
  useEffect(() => {
    if (repairRunParam === "") return;
    const seen = new Set<string>();
    return subscribeRunEvents(
      repairRunParam,
      (event) => {
        if (seen.has(event.type)) return;
        seen.add(event.type);
        setRepairStages((previous) => [...previous, event.type]);
      },
      () => {
        /* status poll on the console still converges */
      },
    );
  }, [repairRunParam]);

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
  const announceLatest = latest !== null && (previous === null || previous.stage !== latest.stage);
  const confirmed = run?.findings.filter((finding) => finding.category === "confirmed-failure") ?? [];
  const automated = run?.findings.filter((finding) => finding.category === "automated-finding") ?? [];
  const observations = run?.findings.filter((finding) => finding.category === "observation") ?? [];
  const notTestedFindings = run?.findings.filter((finding) => finding.category === "not-tested") ?? [];
  const shots = run?.screenshots ?? [];
  const overviewShot = shots[0] ?? null;
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

  // Guided walkthrough doubles as the category filter: the scene shows
  // the scoped findings, so filtering hides/shows real markers only.
  const [walk, setWalk] = useState<{ scope: "all" | GroupId; fi: number; ei: number } | null>(null);

  const walkProblems: ExplorationFinding[] = [];
  for (const id of GROUP_ORDER) {
    const list = grouped.get(id);
    if (list !== undefined) walkProblems.push(...list);
  }

  function enterWalkthrough(scope: "all" | GroupId, fi = 0): void {
    setWalk({ scope, fi, ei: 0 });
    setStoryIndex(0);
    setStoryPlaying(false);
  }

  const scopedWalk =
    walk === null
      ? walkProblems
      : walk.scope === "all"
        ? walkProblems
        : walkProblems.filter((finding) => groupOf(finding) === walk.scope);
  const walkFinding = walk === null ? null : (scopedWalk[Math.min(walk.fi, Math.max(scopedWalk.length - 1, 0))] ?? null);
  const walkPosition = walk === null ? 0 : Math.min(walk.fi, Math.max(scopedWalk.length - 1, 0)) + 1;

  const isKeyboard = walkFinding?.probeId === "keyboard-traversal";
  const board = walkFinding !== null ? storyboardOf(walkFinding) : [];
  const storyShot =
    walkFinding !== null && isKeyboard && walkFinding.screenshots.length > 1
      ? (walkFinding.screenshots[Math.min(storyIndex, walkFinding.screenshots.length - 1)] ?? null)
      : null;
  const activeShot = storyShot ?? walkFinding?.screenshots[0] ?? overviewShot;

  const plane = useMemo(() => {
    if (run !== null && activeShot !== null) {
      for (const finding of run.findings) {
        for (const highlight of drawableHighlights(finding.highlights)) {
          if (highlight.screenshot === activeShot && highlight.viewportWidth > 0 && highlight.viewportHeight > 0) {
            return planeSizeFor(highlight.viewportWidth, highlight.viewportHeight);
          }
        }
      }
    }
    return planeSizeFor(1280, 720);
  }, [run, activeShot]);

  const repairStates = useMemo<Record<string, RepairState>>(() => {
    if (walkFinding === null || repairRunParam === "") return {};
    return { [walkFinding.findingId]: repairStateFromStages(repairStages) };
  }, [walkFinding, repairRunParam, repairStages]);

  const nodes = useMemo<FindingSceneNode[]>(() => {
    if (run === null || activeShot === null) return [];
    return buildSceneNodes(scopedWalk, {
      screenshot: activeShot,
      plane,
      selectedFindingId: walkFinding?.findingId ?? null,
      selectedElementIndex: walk?.ei ?? 0,
      repairStates,
      categoryOf: groupOf,
    });
  }, [run, activeShot, scopedWalk, plane, walkFinding?.findingId, walk?.ei, repairStates]);

  const selectedNode = nodes.find((node) => node.selected) ?? null;

  const focusPath = useMemo(
    () => (walkFinding !== null && isKeyboard ? focusPathOf(walkFinding, plane) : null),
    [walkFinding, isKeyboard, plane],
  );
  const showFocusPath = focusPath !== null && focusPath.nodes.length > 0;
  const focusSeq = focusPath !== null ? Math.min(storyIndex, focusPath.nodes.length - 1) : 0;

  const categoryCounts = Object.fromEntries(GROUP_ORDER.map((id) => [id, grouped.get(id)?.length ?? 0]));
  const selectedIssueLabel =
    walkFinding !== null && walk !== null
      ? `Issue ${walkPosition} · ${humanFindingOf(walkFinding).title}`
      : null;

  // Source trace for the selected issue (explicit ?source=<id> only).
  useEffect(() => {
    if (sourceIdParam === "" || walkFinding === null) {
      setSourceFile(null);
      return;
    }
    let cancelled = false;
    fetchSourceTrace(sourceIdParam).then((trace) => {
      if (cancelled) return;
      if (trace === null || trace.findingId !== walkFinding.findingId) {
        setSourceFile(null);
        return;
      }
      setSourceFile(trace.candidates[0]?.filePath ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceIdParam, walkFinding]);

  // Evidence playback: step through the recorded focus sequence.
  useEffect(() => {
    if (!storyPlaying || board.length < 2) return;
    const id = setInterval(() => {
      setStoryIndex((index) => (index + 1) % board.length);
    }, 1600);
    return () => clearInterval(id);
  }, [storyPlaying, board.length]);

  // Overview is shown first; user clicks "Review problems" or category to enter walkthrough.
  const walkKey = walk === null ? "none" : `${walk.scope}:${walk.fi}`;
  useEffect(() => {
    if (panelRef.current !== null && walk !== null) {
      void revealIn(panelRef.current, "[data-enter]");
    }
  }, [walkKey, walk]);

  function moveCamera(point: { x: number; y: number }, distance: number): void {
    cameraNonce.current += 1;
    setCameraRequest({ point, distance, nonce: cameraNonce.current });
  }

  function focusIssue(fi: number, ei: number, list: ExplorationFinding[] = scopedWalk): void {
    const finding = list[Math.min(Math.max(fi, 0), Math.max(list.length - 1, 0))] ?? null;
    if (finding === null || activeShot === null) return;
    const center = elementCenterOf(finding, ei, activeShot);
    if (center === null) return;
    moveCamera(center, fitDistanceFor(center.w, center.h));
  }

  function goToIssue(fi: number): void {
    if (walk === null) return;
    const next = Math.min(Math.max(fi, 0), scopedWalk.length - 1);
    setWalk({ scope: walk.scope, fi: next, ei: 0 });
    setStoryIndex(0);
    setStoryPlaying(false);
    focusIssue(next, 0);
  }

  // Previous/next moves through the spatial presentation: current
  // typography exits with stagger, the camera moves, new text enters.
  async function goToIssueAnimated(fi: number): Promise<void> {
    const scope = panelRef.current;
    if (walk === null || scope === null || prefersReducedMotion()) {
      goToIssue(fi);
      return;
    }
    const { exitPanel } = await import("../../../lib/motion");
    await exitPanel(scope);
    goToIssue(fi);
  }

  function onSelectNode(findingId: string, highlightIndex: number): void {
    const inScope = scopedWalk.findIndex((finding) => finding.findingId === findingId);
    const scope = walk?.scope ?? "all";
    if (inScope >= 0 && walk !== null) {
      setWalk({ scope, fi: inScope, ei: highlightIndex });
    } else {
      const index = walkProblems.findIndex((finding) => finding.findingId === findingId);
      if (index < 0) return;
      setWalk({ scope: "all", fi: index, ei: highlightIndex });
    }
    setStoryIndex(0);
    setStoryPlaying(false);
    const node = nodes.find((candidate) => candidate.findingId === findingId && candidate.highlightIndex === highlightIndex);
    if (node !== null && node !== undefined) {
      moveCamera(node.center, fitDistanceFor(node.rect.width, node.rect.height));
    }
  }

  function onSelectFinding(findingId: string): void {
    const inScope = scopedWalk.findIndex((finding) => finding.findingId === findingId);
    if (inScope >= 0 && walk !== null) {
      goToIssue(inScope);
      return;
    }
    const index = walkProblems.findIndex((finding) => finding.findingId === findingId);
    if (index < 0) return;
    enterWalkthrough("all", index);
    focusIssue(index, 0, walkProblems);
  }

  function onElementSelect(index: number): void {
    if (walk === null || walkFinding === null) return;
    setWalk({ scope: walk.scope, fi: walk.fi, ei: index });
    const center = elementCenterOf(walkFinding, index, activeShot ?? "");
    if (center !== null) moveCamera(center, fitDistanceFor(center.w, center.h));
  }

  function onStorySelect(index: number): void {
    setStoryIndex(index);
    setStoryPlaying(false);
    if (focusPath !== null && focusPath.nodes.length > 0) {
      const node = focusPath.nodes[Math.min(index, focusPath.nodes.length - 1)];
      if (node !== undefined) moveCamera(node.center, 3.5);
    } else if (walkFinding !== null) {
      const center = elementCenterOf(walkFinding, 0, activeShot ?? "");
      if (center !== null) moveCamera(center, fitDistanceFor(center.w, center.h));
    }
  }

  function onResetView(): void {
    setResetNonce((nonce) => nonce + 1);
  }

  function startReview(scope: "all" | GroupId, fi = 0): void {
    const list =
      scope === "all" ? walkProblems : walkProblems.filter((finding) => groupOf(finding) === scope);
    if (list.length === 0) return;
    enterWalkthrough(scope, fi);
    focusIssue(fi, 0, list);
  }

  const textureUrl = activeShot !== null ? explorationShotSrc(runId, activeShot) : null;
  const walkDrawableCount =
    walkFinding !== null && activeShot !== null
      ? drawableHighlights(walkFinding.highlights).filter((highlight) => highlight.screenshot === activeShot).length
      : 0;

  const scanPct = progress.length > 0 ? Math.round((doneSteps / progress.length) * 100) : 0;

  if (run?.state === "COMPLETED" && tourModel !== null && !showDetailedEvidence) return <main>
    <SpatialTour model={tourModel} />
    <section className="site-check-section"><h2>Keep the evidence in view.</h2><p>This tour uses only screenshots and measurements from this website check.</p><div className="finding-actions"><Button onClick={() => setShowDetailedEvidence(true)}>Developer details and full evidence</Button><Button variant="secondary" asChild><Link href="/#check-site">Check another website</Link></Button></div></section>
  </main>;

  return (
    <main className="xp">
      <a className="skip-link" href="#issue-panel">
        Skip to issue details
      </a>

      {run === null && !unreachable && (
        <section aria-labelledby="run-title">
          <div className="xp-stage-head">
            <span className="mono-label">
              <span className="dot-live" aria-hidden="true">● </span>Checking your website — {shortPageOf(targetUrl)}
            </span>
            <button type="button" className="issue-nav-btn" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel check"}
            </button>
          </div>
          <section aria-label="Live website scan" className="scene-wrap">
            <SpatialScene
              textureUrl={null}
              plane={plane}
              nodes={[]}
              selectedNode={null}
              selectedIssueLabel={null}
              focusPath={null}
              showFocusPath={false}
              focusActiveSeq={0}
              focusPlaying={false}
              scanning
              cameraRequest={null}
              resetNonce={0}
              onSelectNode={() => undefined}
              onWebGLFail={() => setWebglFailed(true)}
            />
            <div className="xp-float xp-float-tl">
              <span className="mono-label">Scanning your site</span>
              <p className="xp-float-strong" role="status">
                <span className="n">{issueCount}</span> {issueCount === 1 ? "problem" : "problems"} found
              </p>
            </div>
            <div className="xp-float xp-float-tr">
              <span className="mono-label">Progress</span>
              <p className="xp-float-strong">
                <span className="n">{scanPct}</span>%
              </p>
            </div>
            <div className="scan-line" aria-hidden="false">
              <div className="scan-line-track">
                <div
                  className="scan-line-fill"
                  style={{ width: `${scanPct}%`, transition: "width 0.9s ease" }}
                />
              </div>
              <div className="scan-line-stages">
                {progress.map((step) => (
                  <span
                    key={step.id}
                    data-on={step.state === "done" || step.state === "running" ? "true" : "false"}
                  >
                    {step.state === "done" ? "✓ " : step.state === "running" ? "● " : "○ "}
                    {step.label}
                  </span>
                ))}
              </div>
              <p className="help" role="status" aria-live="polite" style={{ margin: "8px 0 0" }}>
                {announceLatest && latest !== null
                  ? latest.message
                  : "Opening the website in the test browser…"}
              </p>
            </div>
            <span id="run-title" className="sr-only">
              Checking your website
            </span>
          </section>
          {error !== null && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </section>
      )}

      {run === null && unreachable && (
        <section aria-labelledby="missing-title" id="result" className="verify-hero">
          <span className="mono-label">Verification unavailable</span>
          <h1 id="missing-title" className="display-2">
            We couldn&apos;t find this check.
          </h1>
          <p className="lede-xl">
            This check may have run on a server that has since restarted, so
            its progress is no longer available. Nothing was backfilled — we
            show this honestly instead of inventing results.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <Button asChild>
              <Link href="/">Check a website</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/console">See the recorded example instead</Link>
            </Button>
          </div>
        </section>
      )}

      {run !== null && run.state === "COMPLETED" && (
        <section aria-labelledby="run-title">
          <div className="xp-verdict">
            <span className="mono-label">
              Scan complete — {shortPageOf(run.target.entryUrl)}
            </span>
            <h1 id="run-title" className="display-2">
              {issueCount > 0 ? (
                <>
                  We found <span className="n">{issueCount}</span> {issueCount === 1 ? "problem" : "problems"}.
                </>
              ) : (
                <>No major barriers found.</>
              )}
            </h1>
            {issueCount > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-sm text-[#e6e5e0]">
                <span className="px-2.5 py-0.5 rounded bg-[#222226] text-[#f26a5b] font-medium">
                  <strong>{tier0.length > 0 ? tier0.length : tier1.length > 0 ? tier1.length : 1} should be fixed first</strong>
                </span>
                <span className="text-[#7e7d7a]">to make sure everyone can actually use your site.</span>
              </div>
            )}
            {issueCount > 0 && walk === null && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <Button size="lg" onClick={() => startReview("all")}>
                  Review problems →
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/">Check another site</Link>
                </Button>
              </div>
            )}
            {issueCount > 0 && (
              <p className="xp-tiers">
                {tier0.length > 0 && (
                  <span className="t0"><strong>{tier0.length}</strong> need attention first</span>
                )}
                {tier1.length > 0 && (
                  <span className="t1"><strong>{tier1.length}</strong> important</span>
                )}
                {tier2.length > 0 && (
                  <span className="t2"><strong>{tier2.length}</strong> improvements</span>
                )}
              </p>
            )}
            <div role="group" aria-label="Detail level" className="kat-filter" style={{ borderBottom: 0, paddingTop: 0 }}>
              <button
                type="button"
                aria-pressed={!developer}
                onClick={() => setDeveloper(false)}
              >
                Plain language
              </button>
              <button
                type="button"
                aria-pressed={developer}
                onClick={() => setDeveloper(true)}
              >
                Developer view
              </button>
            </div>
          </div>
          {issueCount > 0 && (
            <div className="kat-filter" role="group" aria-label="Filter problems by category">
              <button
                type="button"
                aria-pressed={walk === null || walk.scope === "all"}
                onClick={() => startReview("all")}
              >
                All<span className="count">{walkProblems.length}</span>
              </button>
              {GROUP_ORDER.filter((id) => (categoryCounts[id] ?? 0) > 0).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={walk !== null && walk.scope === id}
                  onClick={() => startReview(id)}
                >
                  {PROBLEM_GROUPS[id].heading}<span className="count">{categoryCounts[id]}</span>
                </button>
              ))}
            </div>
          )}
          <Separator style={{ marginTop: 12 }} />

          {issueCount > 0 ? (
            <div className="spatial-layout">
              <section aria-label="3D accessibility map" className="scene-wrap">
                {webglFailed ? (
                  <div className="scene-fallback">
                    {walkFinding !== null ? (
                      <EvidenceFallback
                        runId={runId}
                        finding={walkFinding}
                        elementIndex={walk?.ei ?? 0}
                        onElementSelect={onElementSelect}
                      />
                    ) : activeShot !== null ? (
                      <EvidenceViewer
                        src={explorationShotSrc(runId, activeShot)}
                        alt="Recorded screenshot of the tested website"
                        highlights={[]}
                        selectedIndex={0}
                        onSelect={() => undefined}
                        caption="3D is unavailable — use the issue list to review each problem."
                      />
                    ) : <p className="help">No screenshot was captured. Use the issue list to review each problem.</p>}
                  </div>
                ) : (
                  <SpatialScene
                    textureUrl={textureUrl}
                    plane={plane}
                    nodes={nodes}
                    selectedNode={selectedNode}
                    selectedIssueLabel={selectedIssueLabel}
                    focusPath={focusPath}
                    showFocusPath={showFocusPath}
                    focusActiveSeq={focusSeq}
                    focusPlaying={storyPlaying}
                    scanning={false}
                    cameraRequest={cameraRequest}
                    resetNonce={resetNonce}
                    onSelectNode={onSelectNode}
                    onWebGLFail={() => setWebglFailed(true)}
                  />
                )}
                {walk !== null && (
                  <div className="xp-float xp-float-tr">
                    <span className="mono-label">Issue</span>
                    <p className="xp-float-strong">
                      <span className="n">{walkPosition}</span> / {scopedWalk.length}
                    </p>
                  </div>
                )}
                {walk === null && (
                  <div className="xp-float xp-float-tl">
                    <span className="mono-label">Results</span>
                    <p className="xp-float-strong" role="status">
                      {issueCount} problems ready to review
                    </p>
                  </div>
                )}
                <div className="scene-bar">
                  <p className="help" style={{ margin: 0 }}>
                    {activeShot !== null ? "This is the exact page state the test browser captured." : "Waiting for browser evidence…"}
                    {storyShot !== null && ` State ${Math.min(storyIndex, (walkFinding?.screenshots.length ?? 1) - 1) + 1} of ${walkFinding?.screenshots.length ?? 1}.`}
                  </p>
                  <Button size="sm" variant="secondary" onClick={onResetView}>
                    Reset view
                  </Button>
                </div>
              </section>

              <aside className="spatial-panel" aria-label="Issue details" id="issue-panel">
                {walkFinding !== null && walk !== null ? (
                  <div className="issue-sheet" ref={panelRef}>
                    <p className="issue-pos" data-enter data-exit aria-live="polite">
                      <span className="now">{String(walkPosition).padStart(2, "0")}</span>
                      {" / "}
                      {String(scopedWalk.length).padStart(2, "0")}
                    </p>
                    <div data-enter data-exit>
                      <IssueWalkthrough
                        finding={walkFinding}
                        runId={runId}
                        position={walkPosition}
                        total={scopedWalk.length}
                        developer={developer}
                        elementCount={walkDrawableCount}
                        elementIndex={Math.min(walk.ei, Math.max(walkDrawableCount - 1, 0))}
                        onElementSelect={onElementSelect}
                        storyIndex={storyIndex}
                        onStorySelect={onStorySelect}
                        storyPlaying={storyPlaying}
                        onTogglePlay={() => setStoryPlaying((playing) => !playing)}
                        isKeyboard={isKeyboard}
                        hasDrawableGeometry={drawableHighlights(walkFinding.highlights).length > 0}
                        repairState={repairStates[walkFinding.findingId] ?? "unresolved"}
                        sourceFile={sourceFile}
                        hasPrevious={walk.fi > 0}
                        hasNext={walk.fi < scopedWalk.length - 1}
                        onPrevious={() => void goToIssueAnimated(walk.fi - 1)}
                        onNext={() => void goToIssueAnimated(walk.fi + 1)}
                        onResetView={onResetView}
                      />
                    </div>
                  </div>
                ) : (
                  <Card>
                    <p className="lede" style={{ margin: 0 }}>{VERDICT_COPY[verdict]}</p>
                    <p className="help" style={{ color: "var(--ink-dim)" }}>
                      {[
                        tier0.length > 0 ? `${tier0.length} need attention first` : null,
                        tier1.length > 0 ? `${tier1.length} may make the site harder to use` : null,
                        tier2.length > 0 ? `${tier2.length} are smaller improvements` : null,
                      ]
                        .filter((part) => part !== null)
                        .join(" · ") || "nothing else"}
                      {observations.length > 0 && ` · ${observations.length} ${observations.length === 1 ? "observation" : "observations"}`}
                    </p>
                    <p style={{ marginTop: 12 }}>
                      <Button size="lg" onClick={() => startReview("all")}>
                        Review {issueCount} {issueCount === 1 ? "problem" : "problems"}
                      </Button>
                    </p>
                  </Card>
                )}
                <h2 className="mono-label" style={{ marginTop: 28 }}>Index — every problem</h2>
                <FindingListFallback
                  findings={scopedWalk}
                  selectedFindingId={walkFinding?.findingId ?? null}
                  onSelect={onSelectFinding}
                  compact
                />
                <p className="help mt-2" style={{ color: "var(--ink-dim)" }}>
                  Every problem is listed here. Markers appear on the map for
                  problems with a measured location.
                </p>
              </aside>
            </div>
          ) : (
            <div className="verify-hero">
              <span className="verify-mark" aria-hidden="true">✓</span>
              <h2 className="display-2">No major barriers found.</h2>
              <p className="lede-xl">
                We didn’t find any major accessibility problems in the parts of
                the site we tested. This does not guarantee the entire website
                is accessible.
              </p>
            </div>
          )}

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
        <section aria-labelledby="run-title" id="result" className="verify-hero">
          <span className="mono-label">
            {run.state === "CANCELLED" ? "Check cancelled" : "Connection failed"}
          </span>
          <h1 id="run-title" className="display-2">
            {run.state === "CANCELLED" ? "Check cancelled." : "We couldn't open this website."}
          </h1>
          <p className="lede-xl">
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
        </section>
      )}

      <footer className="product-foot">
        <p>
          <Link href="/">Check another website</Link>
          {" · "}
          <Link href="/console">Recorded demo</Link>
        </p>
      </footer>
    </main>
  );
}
