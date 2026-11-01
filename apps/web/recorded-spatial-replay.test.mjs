import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseRecordedSpatialReplay } from "./lib/recorded-spatial-replay.ts";

const evidenceUrl = new URL("./public/demo/spatial-replay/evidence.json", import.meta.url);

describe("measured demo replay provenance", () => {
  it("pairs measured captures with the exact historical accepted patch", async () => {
    const raw = JSON.parse(await readFile(evidenceUrl, "utf8"));
    const replay = parseRecordedSpatialReplay(raw);
    assert.ok(replay);
    const patch = await readFile(new URL(`../../demo/accepted-run/${replay.sourceRunId}/repair-revision-diff.patch`, import.meta.url));
    const canonicalPatch = patch.toString("utf8").replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(canonicalPatch).digest("hex"), replay.patchSha256);
    assert.equal(createHash("sha256").update(canonicalPatch.replace(/\n/g, "\r\n").replace(/\r\n/g, "\n")).digest("hex"), replay.patchSha256);
    assert.equal(replay.before.steps.at(-1).insideExpectedRegion, false);
    assert.ok(replay.after.steps.every((step) => step.insideExpectedRegion));
    assert.equal(raw.reverseCheck.insideExpectedRegion, true);
    for (const capture of [replay.before, replay.after]) {
      const image = await readFile(new URL(`./public${capture.imageUrl}`, import.meta.url));
      assert.equal(image[0], 0xff); assert.equal(image[1], 0xd8);
      for (const { box } of capture.steps) {
        assert.ok(box.x >= 0 && box.y >= 0);
        assert.ok(box.x + box.width <= box.viewportWidth && box.y + box.height <= box.viewportHeight);
      }
    }
  });
  it("rejects malformed or mismatched captures instead of guessing geometry", async () => {
    const raw = JSON.parse(await readFile(evidenceUrl, "utf8"));
    const mismatch = structuredClone(raw); mismatch.before.steps[0].box.screenshot = "another.jpg";
    assert.equal(parseRecordedSpatialReplay(mismatch), null);
    const invalid = structuredClone(raw); invalid.after.steps[0].box.viewportWidth = 0;
    assert.equal(parseRecordedSpatialReplay(invalid), null);
    const external = structuredClone(raw); external.before.imageUrl = "https://unrelated.invalid/capture.jpg";
    assert.equal(parseRecordedSpatialReplay(external), null);
  });
});
