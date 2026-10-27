import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keyboardProbe } from "./keyboard-probe.js";
import type { ProbeContext } from "./types.js";

/**
 * Keyboard probe focus evidence: every forward focus landing is recorded
 * with its measured box, in order, so the finding can project a real
 * spatial focus path. Detection behavior is unchanged — only the
 * evidence carried alongside the verdict grows.
 */

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    hasFocus: true,
    role: "button",
    name: "Menu",
    tag: "BUTTON",
    selector: "button.menu",
    exposed: true,
    disabled: false,
    rendered: true,
    onScreen: true,
    isBody: false,
    box: { x: 10, y: 10, width: 40, height: 20, viewportWidth: 1280, viewportHeight: 720, scrollY: 0 },
    ...overrides,
  };
}

const hiddenLink = () =>
  snapshot({
    role: "link",
    name: "Help",
    tag: "A",
    selector: "#background-help",
    exposed: false,
    box: { x: 200, y: 10, width: 40, height: 20, viewportWidth: 1280, viewportHeight: 720, scrollY: 0 },
  });

const body = () =>
  snapshot({ role: "body", name: "", tag: "BODY", selector: "body", isBody: true, box: null });

async function runProbe(snapshots: ReturnType<typeof snapshot>[]) {
  let index = 0;
  const page = {
    keyboard: { press: async () => undefined },
    evaluate: async () => snapshots[Math.min(index++, snapshots.length - 1)],
  };
  const ctx = {
    targetId: "tgt-1",
    pageUrl: "https://example.com/",
    surface: {},
    maxTabSteps: 10,
    page,
    captureScreenshot: async () => "screenshot-9.png",
    checkCancelled: () => undefined,
  } as unknown as ProbeContext;
  return keyboardProbe.execute(ctx);
}

describe("keyboard probe focus evidence", () => {
  it("records every focus landing with its box, in order, on failure", async () => {
    const button = snapshot();
    const result = await runProbe([body(), button, hiddenLink(), button, body()]);
    assert.equal(result.status, "failed");
    const data = (result.evidence[0]?.data ?? {}) as Record<string, unknown>;
    assert.deepEqual(data["focusSteps"], [
      { label: 'button "Menu" (button.menu)', selector: "button.menu", box: button.box },
      { label: 'link "Help" (#background-help)', selector: "#background-help", box: (hiddenLink() as { box: unknown }).box },
    ]);
    assert.deepEqual(data["box"], (hiddenLink() as { box: unknown }).box);
  });

  it("keeps unmeasurable landings as text-only steps, never invented boxes", async () => {
    const unmeasured = snapshot({ name: "Ghost", selector: "#ghost", box: null });
    const result = await runProbe([body(), unmeasured, hiddenLink(), unmeasured, body()]);
    assert.equal(result.status, "failed");
    const data = (result.evidence[0]?.data ?? {}) as Record<string, unknown>;
    const steps = data["focusSteps"] as { label: string; box: unknown }[];
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.label, 'button "Ghost" (#ghost)');
    assert.equal(steps[0]?.box, null);
  });
});
