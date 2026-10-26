import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepairProposal } from "@a11yforge/shared";
import {
  applyRepairProposal,
  buildLineDiff,
  countAnchorOccurrences,
  RepairApplyError,
  resolveWorkspacePath,
} from "./apply.js";

const BEFORE = [
  '<div id="checkout-modal">',
  '  <button id="checkout-modal-close">Close</button>',
  "</div>",
  '<a id="background-control" href="#s">info</a>',
].join("\n");

function proposalFor(
  originalText: string,
  filePath = "src/App.tsx",
): RepairProposal {
  return {
    proposalId: "prop-test",
    diagnosisId: "diag-test",
    summary: "test",
    rationale: "test",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: ["src/App.tsx"],
    edits: [
      {
        filePath,
        originalText,
        replacementText: `${originalText}\n{/* trap */}`,
        reason: "test",
      },
    ],
    risks: [],
    verificationPlan: ["rebuild"],
  };
}

async function seedRoot(content: string): Promise<string> {
  const root = join(
    tmpdir(),
    `a11yforge-apply-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), content);
  return root;
}

describe("safe repair application", () => {
  it("replaces an exact single anchor and emits a deterministic diff", async () => {
    const root = await seedRoot(`${BEFORE}\n`);
    const anchor = '  <button id="checkout-modal-close">Close</button>';
    const { appliedEdits, diffText } = await applyRepairProposal({
      workspaceSourceRoot: root,
      proposal: proposalFor(anchor),
    });
    assert.equal(appliedEdits.length, 1);
    assert.equal(appliedEdits[0]?.filePath, "src/App.tsx");
    const after = await readFile(join(root, "src", "App.tsx"), "utf8");
    assert.ok(after.includes("{/* trap */}"));
    assert.ok(after.includes('<a id="background-control"'));
    assert.ok(diffText.includes("--- a/src/App.tsx"));
    assert.ok(diffText.includes("+++ b/src/App.tsx"));
    // Pure insertion: the anchor line is context, the trap comment is added,
    // and no removal is claimed.
    assert.ok(diffText.includes("+{/* trap */}"));
    assert.ok(diffText.includes("   <button"));
    assert.ok(!diffText.match(/^-[^-]/m));
    // Deterministic: re-running the diff builder is byte-identical.
    const rebuilt = buildLineDiff(
      "src/App.tsx",
      `${BEFORE}\n`,
      after,
    );
    assert.equal(rebuilt, diffText);
  });

  it("refuses a missing anchor without writing anything", async () => {
    const root = await seedRoot(`${BEFORE}\n`);
    await assert.rejects(
      () =>
        applyRepairProposal({
          workspaceSourceRoot: root,
          proposal: proposalFor('<div id="no-such-modal">'),
        }),
      (error: unknown) =>
        error instanceof RepairApplyError && /missing anchor/.test(error.message),
    );
    assert.equal(await readFile(join(root, "src", "App.tsx"), "utf8"), `${BEFORE}\n`);
  });

  it("refuses an ambiguous anchor without writing anything", async () => {
    const root = await seedRoot(`<button>x</button>\n<button>x</button>\n`);
    await assert.rejects(
      () =>
        applyRepairProposal({
          workspaceSourceRoot: root,
          proposal: proposalFor("<button>"),
        }),
      (error: unknown) =>
        error instanceof RepairApplyError &&
        /ambiguous replacement refused/.test(error.message),
    );
    assert.equal(
      await readFile(join(root, "src", "App.tsx"), "utf8"),
      "<button>x</button>\n<button>x</button>\n",
    );
  });

  it("refuses paths escaping the workspace", async () => {
    const root = await seedRoot(`${BEFORE}\n`);
    for (const escape of ["../App.tsx", "/abs/path.tsx", "a/../../b.tsx"]) {
      assert.throws(
        () => resolveWorkspacePath(root, escape),
        (error: unknown) =>
          error instanceof RepairApplyError && /escapes/.test(error.message),
      );
    }
    await assert.rejects(
      () =>
        applyRepairProposal({
          workspaceSourceRoot: root,
          proposal: proposalFor('<div id="checkout-modal">', "../escape.tsx"),
        }),
      RepairApplyError,
    );
  });

  it("refuses a missing target file", async () => {
    const root = await seedRoot(`${BEFORE}\n`);
    await assert.rejects(
      () =>
        applyRepairProposal({
          workspaceSourceRoot: root,
          proposal: proposalFor('<div id="x">', "src/Missing.tsx"),
        }),
      (error: unknown) =>
        error instanceof RepairApplyError &&
        /does not exist in the repair workspace/.test(error.message),
    );
  });

  it("counts occurrences without regex semantics", () => {
    assert.equal(countAnchorOccurrences("aaa", "aa"), 1);
    assert.equal(countAnchorOccurrences("a.b a.b", "a.b"), 2);
    assert.equal(countAnchorOccurrences("abc", ""), 0);
  });
});
