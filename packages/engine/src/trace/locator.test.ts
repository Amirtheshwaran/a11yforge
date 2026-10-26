import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import {
  collectSourceFiles,
  countOccurrences,
  extractSnippets,
  MAX_SNIPPET_CHARS,
  MAX_SNIPPET_LINES,
  MAX_SNIPPETS_PER_FILE,
  rankFileContent,
  searchSourceTree,
} from "./locator.js";

function freshDir(tag: string): string {
  return join(
    tmpdir(),
    `a11yforge-locator-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

const MODAL_SOURCE = `import { useState } from "react";

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div>
      <button className="proceed-to-checkout" onClick={() => setModalOpen(true)}>
        Proceed to checkout
      </button>
      {modalOpen && (
        <div role="dialog" id="checkout-modal" className="checkout-modal">
          <button id="checkout-modal-close" onClick={() => setModalOpen(false)}>
            Close
          </button>
          <input id="checkout-modal-email" type="email" />
          <button id="checkout-modal-continue">Continue</button>
        </div>
      )}
      <a id="background-control" href="#shipping-info">Shipping info</a>
    </div>
  );
}
`;

async function seedTree(root: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "dep"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), MODAL_SOURCE);
  await writeFile(
    join(root, "src", "other.ts"),
    "export const label = 'background-control';\n",
  );
  await writeFile(
    join(root, "src", "image.png"),
    "checkout-modal checkout-modal-close",
  );
  await writeFile(
    join(root, "node_modules", "dep", "evil.ts"),
    "checkout-modal checkout-modal-close checkout-modal-email checkout-modal-continue background-control",
  );
  await writeFile(
    join(root, "dist", "bundle.js"),
    "checkout-modal checkout-modal-close checkout-modal-email background-control",
  );
  await writeFile(join(root, "pnpm-lock.yaml"), "checkout-modal\n");
  await writeFile(
    join(root, "src", "big.ts"),
    `export const x = "checkout-modal";\n${"y".repeat(300_000)}\n`,
  );
}

const TERMS = [
  "checkout-modal",
  "checkout-modal-close",
  "checkout-modal-email",
  "checkout-modal-continue",
  "background-control",
];

describe("deterministic source locator", () => {
  it("searches only plausible files and ignores deps, output, and lockfiles", async () => {
    const root = freshDir("ignore");
    await seedTree(root);
    const files = await collectSourceFiles(root);
    assert.deepEqual(files, [
      join(root, "src", "App.tsx"),
      join(root, "src", "big.ts"),
      join(root, "src", "other.ts"),
    ]);
  });

  it("ranks the multi-term modal file above a single weak match", async () => {
    const root = freshDir("rank");
    await seedTree(root);
    const candidates = await searchSourceTree(root, TERMS);
    assert.ok(candidates.length >= 2);
    const top = candidates[0] as (typeof candidates)[number];
    assert.ok(top !== undefined);
    assert.equal(top.filePath, "src/App.tsx");
    assert.ok(top.matchedTerms.includes("checkout-modal"));
    assert.equal(top.matchedTerms.length, 5);
    // score = distinct * 100 + occurrences * 5
    assert.equal(top.score, top.matchedTerms.length * 100 + top.matchCount * 5);
    const second = candidates[1] as (typeof candidates)[number];
    assert.ok(second !== undefined);
    assert.ok(second.score < top.score);
  });

  it("skips oversized files instead of ingesting them", async () => {
    const root = freshDir("big");
    await seedTree(root);
    const candidates = await searchSourceTree(root, TERMS);
    assert.ok(
      candidates.every((candidate) => candidate.filePath !== "src/big.ts"),
    );
  });

  it("keeps snippets bounded around matching lines", async () => {
    const lines = MODAL_SOURCE.split("\n");
    const candidate = rankFileContent("src/App.tsx", MODAL_SOURCE, TERMS);
    assert.ok(candidate !== null);
    assert.ok(candidate.snippets.length >= 1);
    assert.ok(candidate.snippets.length <= MAX_SNIPPETS_PER_FILE);
    for (const snippet of candidate.snippets) {
      assert.ok(snippet.startLine >= 1);
      assert.ok(snippet.endLine <= lines.length);
      assert.ok(snippet.endLine - snippet.startLine + 1 <= MAX_SNIPPET_LINES);
      assert.ok(snippet.content.length <= MAX_SNIPPET_CHARS);
      assert.ok(snippet.matchedTerms.length >= 1);
      for (const term of snippet.matchedTerms) {
        assert.ok(snippet.content.includes(term));
      }
      // Context window respected: excerpt extends past the match itself.
      assert.ok(
        snippet.endLine - snippet.startLine + 1 > snippet.matchedTerms.length ||
          snippet.startLine > 1 ||
          snippet.endLine < lines.length,
      );
    }
  });

  it("merges nearby windows and caps excerpt size directly", () => {
    const lines = Array.from(
      { length: 200 },
      (_v, i) => `line ${i + 1} filler text`,
    );
    lines[9] = "line 10 mentions checkout-modal here";
    lines[150] = "line 151 mentions background-control here";
    const snippets = extractSnippets("f.ts", lines, [
      "checkout-modal",
      "background-control",
    ]);
    assert.equal(snippets.length, 2);
    for (const snippet of snippets) {
      assert.ok(snippet.endLine - snippet.startLine + 1 <= MAX_SNIPPET_LINES);
      assert.ok(snippet.content.length <= MAX_SNIPPET_CHARS);
    }
    assert.ok(snippets[0]?.content.includes("checkout-modal"));
    assert.ok(snippets[1]?.content.includes("background-control"));
  });

  it("counts literal non-overlapping occurrences", () => {
    assert.equal(countOccurrences("aaa", "aa"), 1);
    assert.equal(countOccurrences("a a a", "a"), 3);
    assert.equal(countOccurrences("nothing here", "checkout-modal"), 0);
  });

  it("finds the real broken modal implementation in fixtures/broken-shop", async () => {
    const sourceRoot = join(findWorkspaceRoot(), "fixtures", "broken-shop");
    const candidates = await searchSourceTree(sourceRoot, TERMS);
    assert.ok(candidates.length > 0);
    const top = candidates[0] as (typeof candidates)[number];
    assert.ok(top !== undefined);
    // The implementation must surface as the strongest candidate without
    // the locator hard-coding any filename.
    assert.ok(top.filePath.endsWith("src/App.tsx"), top.filePath);
    assert.ok(top.matchedTerms.includes("checkout-modal"));
    assert.ok(top.matchCount >= 3);
    assert.ok(top.snippets.length > 0);
  });
});
