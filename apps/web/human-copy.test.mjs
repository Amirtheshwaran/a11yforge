import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  affectedCountOf,
  fixGuidanceOf,
  GROUP_ORDER,
  groupOf,
  humanFindingOf,
  humanLimitationOf,
  humanProgressOf,
  humanStepsOf,
  pluralize,
  PROBLEM_GROUPS,
  ruleSlugOf,
  severityWordOf,
  shortPageOf,
  storyboardOf,
  tierOfSeverity,
  TIER_LABELS,
  verdictOf,
  VERDICT_COPY,
} from "./lib/human-copy.ts";

/**
 * Human-copy mapping: plain-language UI derives from real backend fields
 * (rule slugs, probe ids, severities, backend message counts) — never
 * invented. Minimal finding shapes; only read fields are provided.
 */

function automatedFinding(overrides = {}) {
  return {
    findingId: "page-axe-scan-button-name-0",
    category: "automated-finding",
    title: "Automated check: Buttons must have discernible text",
    whatHappened: "An automated accessibility check (button-name) failed on 1 element, including .x.",
    whyItMatters: "Backend why.",
    howReproduced: ["Opened https://example.com/ in a real browser."],
    pageUrl: "https://example.com/",
    severity: "critical",
    probeId: "page-axe-scan",
    screenshots: [],
    standardReferences: ["https://dequeuniversity.com/rules/axe/4.14/button-name?application=axeAPI"],
    ...overrides,
  };
}

describe("human copy mapping", () => {
  it("extracts the axe rule slug from id or reference", () => {
    assert.equal(ruleSlugOf(automatedFinding()), "button-name");
    assert.equal(
      ruleSlugOf(
        automatedFinding({ findingId: "other-1", standardReferences: ["https://x/rules/axe/4.14/color-contrast"] }),
      ),
      "color-contrast",
    );
    assert.equal(ruleSlugOf(automatedFinding({ findingId: "other-1", standardReferences: [] })), null);
  });

  it("parses affected counts from backend messages", () => {
    assert.equal(affectedCountOf(automatedFinding()), 1);
    assert.equal(
      affectedCountOf(automatedFinding({ whatHappened: "check (image-alt) failed on 4 elements, including x" })),
      4,
    );
    assert.equal(
      affectedCountOf(automatedFinding({ whatHappened: "no count here", title: "2 form controls have no name." })),
      2,
    );
    assert.equal(affectedCountOf(automatedFinding({ whatHappened: "no count here", title: "No count here" })), null);
  });

  it("groups by probe, then rule, then title keywords, then fallback", () => {
    assert.equal(groupOf(automatedFinding({ probeId: "keyboard-traversal" })), "keyboard");
    assert.equal(groupOf(automatedFinding()), "forms");
    assert.equal(groupOf(automatedFinding({ findingId: "page-axe-scan-image-alt-4" })), "images");
    assert.equal(
      groupOf(automatedFinding({ findingId: "zzz", probeId: "zzz", title: "Keyboard focus escaped", standardReferences: [] })),
      "keyboard",
    );
    assert.equal(
      groupOf(automatedFinding({ findingId: "zzz", probeId: "zzz", title: "Something entirely new", standardReferences: [] })),
      "more",
    );
  });

  it("covers every group used in ordering", () => {
    for (const id of GROUP_ORDER) {
      assert.ok(PROBLEM_GROUPS[id].heading.length > 0);
      assert.ok(PROBLEM_GROUPS[id].description.length > 0);
    }
  });

  it("rewrites known rules to human copy and passes confirmed failures through", () => {
    const button = humanFindingOf(automatedFinding());
    assert.equal(button.title, "A button has no readable label");
    assert.match(button.why, /screen reader/);
    assert.equal(button.noun, "button");
    const confirmed = humanFindingOf(
      automatedFinding({
        category: "confirmed-failure",
        title: "Keyboard focus moved somewhere hidden.",
        whyItMatters: "Backend human why.",
      }),
    );
    assert.equal(confirmed.title, "Keyboard focus moved somewhere hidden.");
    const probeTitled = humanFindingOf(
      automatedFinding({
        category: "confirmed-failure",
        probeId: "form-relationships",
        title: "2 form controls have no accessible name.",
        whyItMatters: "Backend human why.",
      }),
    );
    assert.equal(probeTitled.title, "Some form fields do not explain what they are for");
    assert.equal(probeTitled.noun, "field");
    const keyboardTitled = humanFindingOf(
      automatedFinding({
        category: "confirmed-failure",
        probeId: "keyboard-traversal",
        title: "Keyboard focus moved to content hidden from assistive technology.",
        whyItMatters: "Backend human why.",
      }),
    );
    assert.equal(keyboardTitled.title, "Keyboard focus moves to something users cannot understand");
    const generic = humanFindingOf(
      automatedFinding({ findingId: "zzz", title: "Automated check: Weird new rule speaks", standardReferences: [] }),
    );
    assert.equal(generic.title, "Weird new rule speaks");
  });

  it("pluralizes and shortens page references from real URLs", () => {
    assert.equal(pluralize(1, "image"), "1 image");
    assert.equal(pluralize(4, "image"), "4 images");
    assert.equal(shortPageOf("https://example.com/demo/mars/"), "example.com/demo/mars/");
    assert.equal(shortPageOf("https://example.com/"), "example.com");
  });

  it("anonymizes the tested address in reproduction steps", () => {
    const steps = humanStepsOf(automatedFinding());
    assert.deepEqual(steps, ["Opened the tested page in a real browser."]);
  });

  it("tiers severities and derives the verdict from real data", () => {
    assert.equal(tierOfSeverity("critical"), 0);
    assert.equal(tierOfSeverity("serious"), 1);
    assert.equal(tierOfSeverity("moderate"), 2);
    assert.equal(tierOfSeverity("minor"), 2);
    assert.ok(TIER_LABELS[0].length > 0 && TIER_LABELS[1].length > 0 && TIER_LABELS[2].length > 0);
    assert.equal(verdictOf(["critical", "moderate"]), "needs-attention");
    assert.equal(verdictOf(["serious"]), "several-important");
    assert.equal(verdictOf(["moderate"]), "no-major");
    assert.equal(VERDICT_COPY["needs-attention"], "Needs attention");
  });

  it("groups backend stages into human progress", () => {
    const all = (v) => ({ opening: v, exploring: v, scanning: v, interacting: v, reviewing: v, done: v });
    assert.deepEqual(
      humanProgressOf(all("pending")).map((s) => s.state),
      ["pending", "pending", "pending", "pending"],
    );
    const mid = humanProgressOf({ ...all("done"), interacting: "running", reviewing: "pending", done: "pending" });
    assert.deepEqual(mid.map((s) => [s.id, s.state]), [
      ["opening", "done"],
      ["looking", "done"],
      ["keyboard", "running"],
      ["reviewing", "pending"],
    ]);
    assert.deepEqual(
      humanProgressOf(all("done")).map((s) => s.state),
      ["done", "done", "done", "done"],
    );
  });

  it("humanizes limitation codes without inventing causes", () => {
    assert.equal(humanLimitationOf("page-unavailable", 2), "We couldn't check 2 pages");
    assert.equal(humanLimitationOf("page-unavailable", 1), "We couldn't check 1 page");
    assert.equal(humanLimitationOf("other-code", 3), "We couldn't check part of the site");
  });

  it("words severity without technical names", () => {
    assert.equal(severityWordOf("critical"), "Needs attention first");
    assert.equal(severityWordOf("serious"), "Important");
    assert.equal(severityWordOf("moderate"), "Improvement");
    assert.equal(severityWordOf("info"), "Improvement");
  });

  it("gives fix guidance per finding type with an honest fallback", () => {
    assert.match(fixGuidanceOf(automatedFinding()), /visible text or an accessible label/);
    assert.match(
      fixGuidanceOf(automatedFinding({ findingId: "page-axe-scan-image-alt-4" })),
      /alternative text/,
    );
    assert.match(
      fixGuidanceOf(
        automatedFinding({ category: "confirmed-failure", probeId: "keyboard-traversal", title: "t", whyItMatters: "w" }),
      ),
      /hidden or disabled content/,
    );
    assert.match(
      fixGuidanceOf(automatedFinding({ findingId: "zzz", title: "Unknown thing", standardReferences: [] })),
      /developer can inspect/,
    );
  });

  it("builds a focus storyboard from real trace steps", () => {
    const finding = automatedFinding({
      category: "confirmed-failure",
      probeId: "keyboard-traversal",
      howReproduced: [
        "Opened the tested page in a real browser.",
        "Keyboard focus started on the page body.",
        "Focus moved to banner.",
        "Focus moved to hidden frame.",
      ],
    });
    const board = storyboardOf(finding);
    assert.deepEqual(
      board.map((step) => step.marker),
      ["start", "tab", "problem"],
    );
    assert.match(board[2].text, /hidden frame/);
  });
});
