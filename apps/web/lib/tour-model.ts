import type { ElementHighlight, ExplorationFinding, ExplorationRun, RunViewModel } from "@a11yforge/shared";

export type TourKind = "overview" | "categories" | "finding" | "interaction" | "source" | "repair" | "rejection" | "revision" | "verification" | "summary";
export interface TourMarker { finding: ExplorationFinding; box: ElementHighlight; number: number }
export interface TourFocusStep { label: string; box: ElementHighlight | null; failed: boolean }
export interface TourSource { path: string; text: string }
export interface TourChapter {
  id: string;
  kind: TourKind;
  title: string;
  eyebrow: string;
  body: string;
  facts: string[];
  imageUrl: string | null;
  highlight: ElementHighlight | null;
  finding: ExplorationFinding | null;
  markers: TourMarker[];
  focusSteps: TourFocusStep[];
  source: TourSource | null;
  outcome: "unresolved" | "rejected" | "verified";
}
export interface TourModel {
  id: string;
  label: "Recorded real repair" | "Live website scan";
  target: string;
  chapters: TourChapter[];
}
export interface RecordedSpatialReplay {
  sourceRunId: string;
  capturedAt: string;
  patchSha256: string;
  before: { imageUrl: string; steps: { label: string; insideExpectedRegion: boolean; box: ElementHighlight }[] };
  after: { imageUrl: string; steps: { label: string; insideExpectedRegion: boolean; box: ElementHighlight }[] };
}

/** A camera destination must intersect its measured capture, not a guessed page location. */
export function canFrameHighlight(box: ElementHighlight): boolean {
  return box.viewportWidth > 0 && box.viewportHeight > 0 && box.width >= 2 && box.height >= 2
    && box.x + box.width > 0 && box.y + box.height > 0
    && box.x < box.viewportWidth && box.y < box.viewportHeight
    && box.width * box.height / (box.viewportWidth * box.viewportHeight) < 0.95;
}

function chapter(input: Pick<TourChapter, "id" | "kind" | "title" | "eyebrow" | "body" | "imageUrl"> & Partial<TourChapter>): TourChapter {
  return { facts: [], highlight: null, finding: null, markers: [], focusSteps: [], source: null, outcome: "unresolved", ...input };
}

/** Live projection accepts the real run only; recorded evidence is never a fallback. */
export function liveTourModel(
  run: ExplorationRun,
  imageUrl: (name: string) => string,
  human: (finding: ExplorationFinding) => { title: string; why: string },
): TourModel {
  const knownShots = new Set(run.screenshots);
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3, info: 4 };
  const problems = run.findings.filter((finding) => finding.category === "confirmed-failure" || finding.category === "automated-finding")
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
  const overviewShot = run.screenshots[0] ?? null;
  const overviewUrl = overviewShot === null ? null : imageUrl(overviewShot);
  const untested = run.probeResults?.length === 0;
  const accessMessage = run.limitations.map((item) => item.message).join(" ");
  const markers: TourMarker[] = problems.flatMap((finding, index) => finding.highlights
    .filter((box) => knownShots.has(box.screenshot) && canFrameHighlight(box))
    .map((box) => ({ finding, box, number: index + 1 })));
  const overviewMarkers = markers.filter((marker) => marker.box.screenshot === overviewShot);
  const issueChapters = problems.map((finding, index) => {
    const boxes = markers.filter((marker) => marker.finding.findingId === finding.findingId);
    const box = boxes[0]?.box ?? null;
    const shot = box?.screenshot ?? finding.screenshots.find((name) => knownShots.has(name)) ?? overviewShot;
    const copy = human(finding);
    // Only keyboard traces have temporal ordering. Other boxes are affected elements.
    const focusSteps: TourFocusStep[] = finding.probeId === "keyboard-traversal"
      ? boxes.filter((marker) => marker.box.screenshot === shot).map((marker, step, list) => ({
        label: marker.box.label, box: marker.box, failed: step === list.length - 1 && finding.category === "confirmed-failure",
      })) : [];
    return chapter({
      id: finding.findingId, kind: focusSteps.length > 1 ? "interaction" : "finding",
      title: copy.title, eyebrow: `ISSUE ${String(index + 1).padStart(2, "0")} / ${finding.severity.toUpperCase()}`,
      body: copy.why, facts: [finding.category === "confirmed-failure" ? "Reproduced interaction failure" : "Automated accessibility finding",
        box === null ? "Visual location unavailable — see the recorded evidence." : `${boxes.length} measured ${boxes.length === 1 ? "element" : "elements"}`],
      finding, imageUrl: shot === null ? null : imageUrl(shot), highlight: box,
      markers: markers.filter((marker) => marker.box.screenshot === shot), focusSteps,
    });
  });
  return {
    id: run.runId, label: "Live website scan", target: run.target.entryUrl,
    chapters: [
      chapter({ id: "overview", kind: "overview", title: untested ? "Here’s where the check stopped." : "Your website. A closer look.", eyebrow: untested ? "LIVE WEBSITE SCAN / ACCESS LIMITED" : "LIVE WEBSITE SCAN / CAPTURED EVIDENCE",
        body: untested ? accessMessage || "The browser could not complete accessibility checks on this website." : `${problems.length} accessibility ${problems.length === 1 ? "issue" : "issues"} recorded across ${run.pagesVisited.length} ${run.pagesVisited.length === 1 ? "page" : "pages"}. Scroll to inspect what the browser found.`,
        facts: untested ? [overviewUrl === null ? "No page capture is available for this run." : "This capture shows the visible page only. Content beyond it was not tested."] : [],
        imageUrl: overviewUrl, markers: overviewMarkers }),
      ...(problems.length === 0 ? [] : [chapter({ id: "categories", kind: "categories", title: "The barriers beneath the surface.", eyebrow: "REAL FINDINGS / REAL LOCATIONS",
        body: "Start with the whole page. Then move into each problem, keeping the surrounding interface in view.", imageUrl: overviewUrl, markers: overviewMarkers })]),
      ...issueChapters,
      chapter({ id: "summary", kind: "summary", title: untested ? "This website remains untested." : problems.length > 0 ? "Evidence before a fix." : "The checks are complete.", eyebrow: "SCAN SUMMARY",
        body: untested ? "Try a publicly accessible page. Pages behind sign-in need an authorized connection before their accessibility can be checked." : problems.length > 0 ? "These findings are unresolved. Connect source code from the detailed evidence to investigate a supported repair." : "No failures were reported by these checks. This is not a complete accessibility certification.",
        facts: run.limitations.map((item) => item.message), imageUrl: overviewUrl, markers: overviewMarkers }),
    ],
  };
}

/** Historical repair adapter. Missing legacy geometry remains missing, never re-created. */
export function recordedTourModel(
  run: RunViewModel,
  imageUrl: (path: string) => string,
  diffs: Readonly<Record<number, string>>,
  home = false,
  replay: RecordedSpatialReplay | null = null,
): TourModel {
  const before = run.artifacts.beforeModalUrl ?? run.artifacts.modalOpenUrl ?? run.artifacts.focusEscapedUrl;
  const failure = run.artifacts.focusEscapedUrl ?? run.artifacts.modalOpenUrl ?? before;
  const after = run.artifacts.afterUrl;
  const shot = (url: string | null): string | null => url === null ? null : imageUrl(url);
  const first = run.attempts[0];
  const last = run.attempts[run.attempts.length - 1];
  const sourceFor = (attempt: number): TourSource => ({ path: run.sourceTrace.topFile, text: diffs[attempt] ?? "Recorded patch unavailable. Open the repair evidence below." });
  const verified = run.finalStatus === "ACCEPTED" && run.verification.typecheckPassed && run.verification.buildPassed
    && run.verification.primaryReplayPassed && run.verification.reverseReplayPassed && run.verification.axeBaselinePreserved;
  const focusSteps = run.focusTrace.map((step, index) => ({ label: step.accessibleName || step.role || `Focus stop ${index + 1}`, box: null, failed: !step.insideModal }));
  const chapters: TourChapter[] = [
    chapter({ id: "overview", kind: "overview", title: home ? "See where your website is hard to use." : "Watch A11yForge find, reject, and repair a real accessibility failure.",
      eyebrow: "RECORDED REAL REPAIR / CONTROLLED TEST WEBSITE", body: "One website. One real failure. Follow the evidence from the first broken interaction to the verified repair.", imageUrl: shot(before) }),
    chapter({ id: "problem", kind: "finding", title: "The surface is only the beginning.", eyebrow: "01 / THE PROBLEM", body: "The dialog stays open, but keyboard focus can escape to the page behind it. The browser reproduced the failure before a repair was attempted.",
      facts: [run.finding.passedBefore ? "Original assertion passed" : "Original assertion failed"], imageUrl: shot(failure) }),
    chapter({ id: "interaction", kind: "interaction", title: "Keyboard users can lose track of where they are.", eyebrow: "02 / SEE THE FAILURE",
      body: "Follow the recorded Tab sequence. Focus leaves the active dialog and reaches the page behind it.",
      facts: ["Recorded focus order below. This older run did not retain spatial coordinates."], imageUrl: shot(failure), focusSteps }),
    chapter({ id: "source", kind: "source", title: "We found the code.", eyebrow: "03 / BENEATH THE SURFACE", body: "The browser evidence was traced to the source file that contains the interaction.",
      facts: [run.sourceTrace.topFile, `Recorded source lines ${run.sourceTrace.startLine}–${run.sourceTrace.endLine}`], imageUrl: shot(failure), source: sourceFor(first?.attempt ?? 1) }),
  ];
  if (first !== undefined) {
    chapters.push(chapter({ id: "repair", kind: "repair", title: "A first fix was created.", eyebrow: "04 / THE FIRST ATTEMPT", body: "A bounded change was proposed to keep keyboard focus inside the active dialog. It still had to pass the deterministic checks.",
      facts: [`Attempt ${first.attempt}`], source: sourceFor(first.attempt), imageUrl: shot(failure) }));
    if (!first.typecheckPassed || !first.buildPassed || !first.scenarioPassed) chapters.push(chapter({ id: "rejection", kind: "rejection", title: "That fix wasn’t good enough.",
      eyebrow: "05 / DETERMINISTIC REJECTION", body: !first.typecheckPassed ? "The compiler rejected the first patch. A failed deterministic check stopped the repair from being accepted." : !first.buildPassed ? "The build failed. The repair could not be accepted, even if the change looked promising." : "The original interaction still failed its check. The repair was rejected.", facts: [first.state, ...first.diagnosticCodes],
      source: sourceFor(first.attempt), imageUrl: shot(failure), outcome: "rejected" }));
  }
  if (last !== undefined && last !== first) chapters.push(chapter({ id: "revision", kind: "revision", title: "The failed check became feedback.", eyebrow: "06 / THE REVISION",
    body: last.outcomeNote, facts: [`Attempt ${last.attempt}`, last.state], imageUrl: shot(failure), source: sourceFor(last.attempt) }));
  chapters.push(chapter({ id: "verification", kind: "verification", title: verified ? "Fixed. Checked. Proven." : "The evidence decides.", eyebrow: "07 / VERIFICATION",
    body: verified ? "The original interaction was replayed after the repair. The compiler, build, reverse replay, and accessibility regression checks all passed." : "The required checks did not all pass. Review the recorded verification evidence before accepting a repair.", facts: [
      `Typecheck ${run.verification.typecheckPassed ? "passed" : "failed"}`, `Build ${run.verification.buildPassed ? "passed" : "failed"}`,
      `Original replay ${run.verification.primaryReplayPassed ? "passed" : "failed"}`, `Reverse replay ${run.verification.reverseReplayPassed ? "passed" : "failed"}`,
    ], imageUrl: shot(after ?? failure), outcome: verified ? "verified" : "unresolved" }));
  // Supplemental measured replay is explicit demo evidence, never assigned to a live run.
  if (replay?.sourceRunId === run.runId && replay.before.steps.some((step) => !step.insideExpectedRegion)) {
    const failedBox = replay.before.steps.find((step) => !step.insideExpectedRegion)?.box ?? null;
    const dialogBox = replay.before.steps.filter((step) => step.insideExpectedRegion).at(-1)?.box ?? null;
    for (const item of chapters) {
      if (item.kind !== "overview" && item.kind !== "verification") item.imageUrl = replay.before.imageUrl;
      if (item.kind === "finding") item.highlight = dialogBox;
      if (item.kind === "interaction") {
        item.highlight = failedBox;
        item.focusSteps = replay.before.steps.map((step) => ({ label: step.label, box: step.box, failed: !step.insideExpectedRegion }));
        item.facts = ["Measured geometry replay of the controlled fixture. Original repair artifacts are preserved below."];
      }
      if (item.kind === "verification" && verified && replay.after.steps.every((step) => step.insideExpectedRegion)) {
        item.imageUrl = replay.after.imageUrl;
        item.focusSteps = replay.after.steps.map((step) => ({ label: step.label, box: step.box, failed: false }));
      }
    }
  }
  return { id: run.runId, label: "Recorded real repair", target: run.targetLabel, chapters };
}

/** Continuous, reversible chapter travel with a short hold at either end. */
export function tourSegment(progress: number, count: number, output = { from: 0, to: 0, mix: 0 }): { from: number; to: number; mix: number } {
  const bounded = Math.max(0, Math.min(Math.max(0, count - 1), Number.isFinite(progress) ? progress : 0));
  const from = Math.floor(bounded);
  const t = Math.max(0, Math.min(1, ((bounded - from) - 0.16) / 0.68));
  output.from = from; output.to = Math.min(count - 1, from + 1); output.mix = t * t * (3 - 2 * t);
  return output;
}
