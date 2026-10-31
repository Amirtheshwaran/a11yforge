import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canFrameHighlight, liveTourModel, recordedTourModel, tourSegment } from "./lib/tour-model.ts";
import { isDrawableHighlight } from "./lib/overlay.ts";

const box = { x: 320, y: 240, width: 120, height: 40, viewportWidth: 1280, viewportHeight: 720, screenshot: "capture.png", label: "Search button", selector: "button" };
const finding = { findingId: "live-control", category: "automated-finding", title: "Unnamed control", whatHappened: "A control has no name.", whyItMatters: "Users need a name.", howReproduced: [], pageUrl: "https://example.com/", severity: "serious", probeId: "page-axe-scan", screenshots: ["capture.png"], standardReferences: [], highlights: [box] };
const live = { runId: "real-scan", target: { entryUrl: finding.pageUrl }, findings: [finding], screenshots: ["capture.png"], pagesVisited: [finding.pageUrl], limitations: [] };
const render = (run) => liveTourModel(run, (name) => `/live/${name}`, (item) => ({ title: item.title, why: item.whyItMatters }));

describe("shared spatial tour evidence", () => {
  it("uses live findings, measured boxes, and live artifact URLs only", () => {
    const model = render(live);
    const issue = model.chapters.find((chapter) => chapter.kind === "finding");
    assert.equal(model.label, "Live website scan");
    assert.equal(model.id, live.runId);
    assert.equal(issue.finding, finding);
    assert.equal(issue.highlight, box);
    assert.equal(issue.imageUrl, "/live/capture.png");
    assert.ok(model.chapters.every((chapter) => chapter.outcome === "unresolved"));
  });
  it("retains issues without geometry without inventing a camera target", () => {
    const model = render({ ...live, findings: [{ ...finding, highlights: [{ ...box, y: 900 }] }] });
    const issue = model.chapters.find((chapter) => chapter.kind === "finding");
    assert.equal(issue.highlight, null);
    assert.deepEqual(issue.markers, []);
    assert.ok(issue.facts.some((text) => text.includes("unavailable")));
  });
  it("never draws boxes from artifacts absent from the run", () => {
    const model = render({ ...live, findings: [{ ...finding, highlights: [{ ...box, screenshot: "missing.png" }] }] });
    assert.ok(model.chapters.every((chapter) => chapter.highlight === null && chapter.markers.length === 0));
  });
  it("does not turn observations or untested probes into problems", () => {
    const model = render({ ...live, findings: [{ ...finding, category: "observation" }, { ...finding, category: "not-tested" }] });
    assert.deepEqual(model.chapters.map((chapter) => chapter.kind), ["overview", "summary"]);
    assert.ok(model.chapters.every((chapter) => chapter.markers.length === 0));
  });
  it("presents a captured sign-in wall without claiming accessibility checks passed", () => {
    const model = render({ ...live, findings: [], probeResults: [], limitations: [{ code: "authentication-required", message: "Sign-in required." }] });
    assert.equal(model.chapters[0].imageUrl, "/live/capture.png");
    assert.equal(model.chapters[0].body, "Sign-in required.");
    assert.match(model.chapters[0].eyebrow, /ACCESS LIMITED/);
    assert.match(model.chapters.at(-1).title, /untested/);
    assert.ok(model.chapters.every((chapter) => chapter.markers.length === 0 && chapter.outcome === "unresolved"));
  });
  it("keeps an unreachable website untested without inventing an image", () => {
    const model = render({ ...live, findings: [], screenshots: [], pagesVisited: [], probeResults: [], limitations: [{ code: "navigation-failed", message: "Could not load the website." }] });
    assert.equal(model.chapters[0].body, "Could not load the website.");
    assert.ok(model.chapters.every((chapter) => chapter.imageUrl === null));
    assert.match(model.chapters.at(-1).title, /untested/);
  });
  it("agrees with the existing 2D highlight validity rules", () => {
    for (const candidate of [box, { ...box, width: 0 }, { ...box, x: 2000 }, { ...box, y: -15, height: 40 }, { ...box, x: 0, y: 0, width: 1280, height: 720 }]) {
      assert.equal(canFrameHighlight(candidate), isDrawableHighlight(candidate));
    }
  });
  it("includes captured pages with no findings and keeps their own image and URL", () => {
    const secondUrl = "https://example.com/about";
    const model = render({ ...live, screenshots: ["capture.png", "second.png"], pageCaptures: [
      { pageUrl: finding.pageUrl, screenshot: "capture.png", title: "Home" },
      { pageUrl: secondUrl, screenshot: "second.png", title: "About" },
      { pageUrl: "https://example.com/missing", screenshot: "unrecorded.png", title: "Missing" },
    ], probeResults: [{ pageUrl: secondUrl, screenshots: ["second.png"], status: "passed" }] });
    const page = model.chapters.find((item) => item.kind === "page");
    assert.equal(page.title, "About");
    assert.equal(page.imageUrl, "/live/second.png");
    assert.deepEqual(page.facts, [secondUrl]);
    assert.match(page.body, /0 accessibility issues/);
    assert.equal(model.chapters.filter((item) => item.kind === "page").length, 1);
    assert.equal(page.finding, null);
  });
  it("does not treat an independent page capture as a completed test", () => {
    const model = render({ ...live, findings: [], probeResults: [], screenshots: ["capture.png", "wall.png"], pageCaptures: [
      { pageUrl: finding.pageUrl, screenshot: "capture.png", title: "Home" },
      { pageUrl: "https://example.com/sign-in", screenshot: "wall.png", title: "Sign in" },
    ] });
    assert.match(model.chapters.find((item) => item.kind === "page").body, /untested/);
  });
});

describe("reversible tour timeline", () => {
  it("returns the same state at a position whether traveling forward or backward", () => {
    const positions = Array.from({ length: 601 }, (_, index) => index / 100);
    const forward = positions.map((position) => tourSegment(position, 7));
    const reverse = positions.toReversed().map((position) => tourSegment(position, 7)).toReversed();
    assert.deepEqual(reverse, forward);
    for (let index = 1; index < forward.length; index++) {
      const a = forward[index - 1], b = forward[index];
      assert.ok(Math.abs((b.from + b.mix) - (a.from + a.mix)) < 0.03, "continuous blend at chapter boundaries");
    }
  });
  it("clamps rapid scroll beyond either end and can reuse frame storage", () => {
    assert.deepEqual(tourSegment(-200, 4), { from: 0, to: 1, mix: 0 });
    assert.deepEqual(tourSegment(200, 4), { from: 3, to: 3, mix: 0 });
    const reused = { from: 0, to: 0, mix: 0 };
    assert.equal(tourSegment(1.5, 4, reused), reused);
    assert.ok(Math.abs(reused.mix - 0.5) < 1e-12);
  });
});

describe("recorded repair truth", () => {
  const attempt = { attempt: 1, summary: "Create a bounded patch", state: "TYPECHECK_FAILED", typecheckPassed: false, buildPassed: false, scenarioPassed: false, outcomeNote: "The compiler rejected the patch.", diagnosticCodes: ["TS18048"] };
  const recorded = { runId: "recorded-run", targetLabel: "Controlled test website", artifacts: { beforeModalUrl: "/before.png", modalOpenUrl: "/modal.png", focusEscapedUrl: "/failure.png", afterUrl: "/after.png" }, focusTrace: [{ role: "button", accessibleName: "Continue", insideModal: true }, { role: "link", accessibleName: "Help", insideModal: false }], finding: { passedBefore: false }, sourceTrace: { topFile: "src/App.tsx", startLine: 10, endLine: 30 }, attempts: [attempt, { ...attempt, attempt: 2, state: "ACCEPTED", typecheckPassed: true, buildPassed: true, scenarioPassed: true }], finalStatus: "ACCEPTED", verification: { typecheckPassed: true, buildPassed: true, primaryReplayPassed: true, reverseReplayPassed: true, axeBaselinePreserved: true, decisionBasis: "Measured gates passed." } };
  it("preserves rejection, revision, and proof and never manufactures legacy coordinates", () => {
    const model = recordedTourModel(recorded, (url) => url, { 1: "+ first", 2: "+ revised" });
    assert.deepEqual(model.chapters.map((chapter) => chapter.kind), ["overview", "finding", "interaction", "source", "repair", "rejection", "revision", "verification"]);
    assert.equal(model.chapters.find((chapter) => chapter.kind === "source").source.text, "+ first");
    assert.equal(model.chapters.at(-1).outcome, "verified");
    assert.ok(model.chapters.every((chapter) => chapter.highlight === null && chapter.focusSteps.every((step) => step.box === null)));
  });
  it("cannot show a verified payoff if any deterministic gate failed", () => {
    const model = recordedTourModel({ ...recorded, verification: { ...recorded.verification, primaryReplayPassed: false } }, (url) => url, {});
    assert.equal(model.chapters.at(-1).outcome, "unresolved");
    assert.notEqual(model.chapters.at(-1).title, "Fixed. Checked. Proven.");
  });
});
