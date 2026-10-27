import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterNavigableSameOriginLinks,
  snapshotAbsoluteLinks,
  snapshotControlStates,
  snapshotPageSurface,
} from "./surface.js";
import { snapshotDisclosureCandidates } from "./probes/disclosure-probe.js";

describe("filterNavigableSameOriginLinks", () => {
  const origin = "https://example.com";
  it("keeps same-origin pages, drops everything else", () => {
    const result = filterNavigableSameOriginLinks(
      [
        "https://example.com/about",
        "https://example.com/about#team",
        "https://example.com/about",
        "https://other.com/page",
        "mailto:someone@example.com",
        "tel:+123456789",
        "javascript:void(0)",
        "https://example.com/report.pdf",
        "https://example.com/app.zip",
        "ftp://example.com/file",
      ],
      origin,
    );
    assert.deepEqual(result, ["https://example.com/about"]);
  });

  it("strips fragments and dedupes", () => {
    const result = filterNavigableSameOriginLinks(
      ["https://example.com/a#x", "https://example.com/a#y", "https://example.com/b"],
      origin,
    );
    assert.deepEqual(result, ["https://example.com/a", "https://example.com/b"]);
  });
});

describe("in-page snapshot self-containment", () => {
  /**
   * page.evaluate serializes each snapshot function ALONE — any free
   * reference to module scope fails at runtime in the browser. Every
   * UPPER_SNAKE token a snapshot function mentions must be declared as a
   * local const inside its own body.
   */
  const snapshots = {
    snapshotPageSurface,
    snapshotControlStates,
    snapshotAbsoluteLinks,
    snapshotDisclosureCandidates,
  };
  for (const [name, fn] of Object.entries(snapshots)) {
    it(`${name} declares every bound it uses locally`, () => {
      const source = fn.toString();
      const tokens = new Set(source.match(/MAX_[A-Z_]+/g) ?? []);
      assert.ok(tokens.size > 0, `${name} should use at least one bound`);
      for (const token of tokens) {
        assert.ok(
          source.includes(`const ${token} =`),
          `${name} references ${token} without a local declaration`,
        );
      }
    });
  }
});
