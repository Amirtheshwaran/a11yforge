import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLatestScenarioRun } from "./run-selector.js";

function scenarioJson(runId: string, passed: boolean): string {
  return JSON.stringify({
    runId,
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: [
      {
        seq: 0,
        action: "modal-open",
        key: null,
        timestamp: "2026-10-26T00:00:00.000Z",
        pageUrl: "http://127.0.0.1:3002/",
        selector: "#checkout-modal-close",
        tagName: "button",
        role: "button",
        accessibleName: "Close",
        text: "Close",
        tabIndex: 0,
        disabled: false,
        ariaHidden: false,
        insideModal: true,
      },
    ],
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed,
        step: 0,
        pressedKey: null,
        expectedRegion: "#checkout-modal",
        actualFocus: "#checkout-modal-close",
        actualHtml: "<button>Close</button>",
      },
    ],
    screenshots: [],
    events: [],
  });
}

async function seed(runsDir: string): Promise<void> {
  // Older failed run, newer passed run, newest failed run, plus a scan-only
  // run (scan.json, no scenario.json) that must never be selected.
  await mkdir(join(runsDir, "2026-01-01T00-00-00-000Z-aaaa"), {
    recursive: true,
  });
  await writeFile(
    join(runsDir, "2026-01-01T00-00-00-000Z-aaaa", "scenario.json"),
    scenarioJson("2026-01-01T00-00-00-000Z-aaaa", false),
  );
  await mkdir(join(runsDir, "2026-01-02T00-00-00-000Z-bbbb"), {
    recursive: true,
  });
  await writeFile(
    join(runsDir, "2026-01-02T00-00-00-000Z-bbbb", "scenario.json"),
    scenarioJson("2026-01-02T00-00-00-000Z-bbbb", true),
  );
  await mkdir(join(runsDir, "2026-01-03T00-00-00-000Z-cccc"), {
    recursive: true,
  });
  await writeFile(
    join(runsDir, "2026-01-03T00-00-00-000Z-cccc", "scenario.json"),
    scenarioJson("2026-01-03T00-00-00-000Z-cccc", false),
  );
  await mkdir(join(runsDir, "2026-01-04T00-00-00-000Z-dddd"), {
    recursive: true,
  });
  await writeFile(
    join(runsDir, "2026-01-04T00-00-00-000Z-dddd", "scan.json"),
    "{}",
  );
}

describe("findLatestScenarioRun", () => {
  it("selects the newest failed run deterministically and skips scan-only runs", async () => {
    const runsDir = join(
      tmpdir(),
      `a11yforge-runs-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    );
    await mkdir(runsDir, { recursive: true });
    await seed(runsDir);
    const selection = await findLatestScenarioRun(runsDir);
    assert.equal(selection.runId, "2026-01-03T00-00-00-000Z-cccc");
    assert.ok(selection.resultPath.endsWith("scenario.json"));
    // Deterministic: a second lookup selects the same run.
    const again = await findLatestScenarioRun(runsDir);
    assert.equal(again.runId, selection.runId);
  });

  it("fails when no failed containment run exists", async () => {
    const runsDir = join(
      tmpdir(),
      `a11yforge-empty-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    );
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, "scan.json"), "{}");
    await assert.rejects(() => findLatestScenarioRun(runsDir));
  });
});
