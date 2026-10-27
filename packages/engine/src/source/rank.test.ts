import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSourceContext, mergeWindows } from "./context.js";
import {
  isTraceSufficientForRepair,
  searchAndRank,
} from "./rank.js";
import type { WeightedTerm } from "./evidence-terms.js";

function terms(names: string[]): WeightedTerm[] {
  return names.map((term) => ({ term, kinds: ["axe-violation:id"] }));
}

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

describe("generic source ranking", () => {
  it("returns FOUND with reasons for a clearly matching file", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-rank-"));
    try {
      await writeTree(root, {
        "src/ProfileForm.ts": [
          "export function renderProfileForm() {",
          '  return `<label for="user-email">Email</label>`;',
          '  + `<input id="user-email" data-testid="email-field" aria-describedby="email-hint">`;',
          '  + `<p id="email-hint">We never share it.</p>`;',
          "}",
        ].join("\n"),
        "src/unrelated.ts": "export const nothing = 'hello world';\n",
      });
      const ranked = await searchAndRank({
        sourceRoot: root,
        textFiles: ["src/ProfileForm.ts", "src/unrelated.ts"],
        terms: terms(["user-email", "email-field", "email-hint"]),
      });
      assert.equal(ranked.status, "FOUND");
      assert.equal(ranked.candidates[0]?.filePath, "src/ProfileForm.ts");
      assert.ok((ranked.candidates[0]?.matchReasons.length ?? 0) > 0);
      assert.ok(
        ranked.candidates[0]?.matchReasons.some((r) => r.includes("user-email")),
      );
      const context = await extractSourceContext({
        sourceRoot: root,
        candidates: ranked.candidates,
      });
      assert.ok(context.length > 0);
      assert.ok(
        isTraceSufficientForRepair({
          status: ranked.status,
          candidates: ranked.candidates,
          selectedContext: context,
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns NOT_FOUND when nothing matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-rank-"));
    try {
      await writeTree(root, { "src/a.ts": "export const a = 1;\n" });
      const ranked = await searchAndRank({
        sourceRoot: root,
        textFiles: ["src/a.ts"],
        terms: terms(["no-such-widget-identifier"]),
      });
      assert.equal(ranked.status, "NOT_FOUND");
      assert.deepEqual(ranked.candidates, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns AMBIGUOUS when runners-up are too close", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-rank-"));
    try {
      await writeTree(root, {
        "src/one.ts": 'const id = "shared-widget";\n'.repeat(5),
        "src/two.ts": 'const id = "shared-widget";\n'.repeat(5),
      });
      const ranked = await searchAndRank({
        sourceRoot: root,
        textFiles: ["src/one.ts", "src/two.ts"],
        terms: terms(["shared-widget"]),
      });
      assert.equal(ranked.status, "AMBIGUOUS");
      assert.ok(
        !isTraceSufficientForRepair({
          status: ranked.status,
          candidates: ranked.candidates,
          selectedContext: [],
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("never reports FOUND on prose-only matches (no strong identifier)", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-rank-"));
    try {
      await writeTree(root, {
        "README.md": "Fork me on GitHub by octocat. This project is one of many.\n",
      });
      const ranked = await searchAndRank({
        sourceRoot: root,
        textFiles: ["README.md"],
        terms: ["Fork", "octocat", "GitHub", "project", "many"].map((term) => ({
          term,
          kinds: ["axe-violation:text"],
        })),
      });
      assert.notEqual(ranked.status, "FOUND");
      assert.ok(
        !isTraceSufficientForRepair({
          status: ranked.status,
          candidates: ranked.candidates,
          selectedContext: [],
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("merges overlapping snippet windows", () => {
    assert.deepEqual(mergeWindows([5, 6, 40], 2, 100), [
      [3, 8],
      [38, 42],
    ]);
  });
});
