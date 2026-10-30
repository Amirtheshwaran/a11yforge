import { ElementHighlightSchema } from "@a11yforge/shared";
import type { RecordedSpatialReplay } from "./tour-model";

/** Fail closed if supplemental geometry does not match the capture it describes. */
export function parseRecordedSpatialReplay(value: unknown): RecordedSpatialReplay | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  if (typeof input["sourceRunId"] !== "string" || typeof input["capturedAt"] !== "string"
    || !Number.isFinite(Date.parse(input["capturedAt"])) || typeof input["patchSha256"] !== "string" || !/^[a-f0-9]{64}$/.test(input["patchSha256"])) return null;
  function capture(raw: unknown): RecordedSpatialReplay["before"] | null {
    if (typeof raw !== "object" || raw === null) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item["imageUrl"] !== "string" || !/^\/demo\/spatial-replay\/[a-z-]+\.jpg$/.test(item["imageUrl"])
      || !Array.isArray(item["steps"]) || item["steps"].length < 2 || item["steps"].length > 50) return null;
    const steps: RecordedSpatialReplay["before"]["steps"] = [];
    for (const rawStep of item["steps"]) {
      if (typeof rawStep !== "object" || rawStep === null) return null;
      const step = rawStep as Record<string, unknown>;
      const box = ElementHighlightSchema.safeParse(step["box"]);
      if (!box.success || typeof step["label"] !== "string" || typeof step["insideExpectedRegion"] !== "boolean"
        || box.data.screenshot !== item["imageUrl"].split("/").at(-1)
        || box.data.width < 2 || box.data.height < 2 || box.data.viewportWidth <= 0 || box.data.viewportHeight <= 0) return null;
      steps.push({ label: step["label"], insideExpectedRegion: step["insideExpectedRegion"], box: box.data });
    }
    return { imageUrl: item["imageUrl"], steps };
  }
  const before = capture(input["before"]), after = capture(input["after"]);
  return before === null || after === null ? null : { sourceRunId: input["sourceRunId"], capturedAt: input["capturedAt"], patchSha256: input["patchSha256"], before, after };
}
