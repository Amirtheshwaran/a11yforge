import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RepairContextBundle,
  RepairProposal,
} from "@a11yforge/shared";
import {
  RepairRevisionValidationError,
  findNonNullAssertions,
  validateRepairRevision,
} from "./validate-revision.js";

const ANCHOR = '<div role="dialog" id="checkout-modal">';
const ORIGINAL_REPLACEMENT = `${ANCHOR}\n{/* proposed focus trap */}`;

function contextBundle(): RepairContextBundle {
  return {
    bundleId: "trace-1",
    diagnosisId: "diag-1",
    evidenceIds: ["ev-focus-escape", "ev-assertion-failed"],
    observedFailure: "Focus escaped the open modal.",
    repairStrategy: "Contain focus while the modal is active.",
    sourceFiles: [
      {
        filePath: "src/App.tsx",
        score: 300,
        matchedTerms: ["checkout-modal"],
        matchCount: 10,
      },
      {
        filePath: "src/App.test.tsx",
        score: 10,
        matchedTerms: ["checkout-modal"],
        matchCount: 1,
      },
      {
        filePath: "tsconfig.json",
        score: 5,
        matchedTerms: ["checkout-modal"],
        matchCount: 1,
      },
    ],
    snippets: [
      {
        filePath: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        content: `${ANCHOR}\n  <button>Close</button>\n</div>`,
        matchedTerms: ["checkout-modal"],
      },
      {
        filePath: "src/App.test.tsx",
        startLine: 1,
        endLine: 1,
        content: "test-checkout-modal",
        matchedTerms: ["checkout-modal"],
      },
      {
        filePath: "tsconfig.json",
        startLine: 1,
        endLine: 1,
        content: "checkout-modal",
        matchedTerms: ["checkout-modal"],
      },
    ],
  };
}

function originalProposal(): RepairProposal {
  return {
    proposalId: "prop-1",
    diagnosisId: "diag-1",
    summary: "First attempt.",
    rationale: "Observed escape; containment addresses it.",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: ["src/App.tsx"],
    edits: [
      {
        filePath: "src/App.tsx",
        originalText: ANCHOR,
        replacementText: ORIGINAL_REPLACEMENT,
        reason: "Add trap.",
      },
    ],
    risks: [],
    verificationPlan: ["rebuild"],
  };
}

function revisionWith(
  proposalId: string,
  filePath: string,
  originalText: string,
  replacementText: string,
): RepairProposal {
  return {
    proposalId,
    diagnosisId: "diag-1",
    summary: "Revised attempt.",
    rationale: "Same trap with strict-safe access.",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: [filePath],
    edits: [
      { filePath, originalText, replacementText, reason: "Revise trap." },
    ],
    risks: [],
    verificationPlan: ["rebuild"],
  };
}

async function sourceRoot(): Promise<string> {
  const root = join(
    tmpdir(),
    `a11yforge-revval-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.tsx"),
    `${ANCHOR}\n  <button>Close</button>\n</div>\n`,
  );
  await writeFile(join(root, "src", "App.test.tsx"), "test-checkout-modal\n");
  await writeFile(join(root, "tsconfig.json"), "checkout-modal\n");
  return root;
}

describe("revision safety validation", () => {
  it("accepts a revision that differs from the rejected original", async () => {
    const root = await sourceRoot();
    const result = validateRepairRevision({
      revision: revisionWith(
        "prop-2",
        "src/App.tsx",
        ANCHOR,
        `${ANCHOR}\n{/* revised trap with guards */}`,
      ),
      original: originalProposal(),
      context: contextBundle(),
      sourceRoot: root,
      failedStage: "typecheck",
    });
    assert.deepEqual(result.nonNullAssertions, []);
  });

  it("rejects a revision identical to the rejected proposal", async () => {
    const root = await sourceRoot();
    assert.throws(
      () =>
        validateRepairRevision({
          revision: revisionWith(
            "prop-2",
            "src/App.tsx",
            ANCHOR,
            ORIGINAL_REPLACEMENT,
          ),
          original: originalProposal(),
          context: contextBundle(),
          sourceRoot: root,
          failedStage: "typecheck",
        }),
      (error: unknown) =>
        error instanceof RepairRevisionValidationError &&
        /identical/.test(error.message),
    );
  });

  it("rejects a revision reusing the rejected proposalId", async () => {
    const root = await sourceRoot();
    assert.throws(
      () =>
        validateRepairRevision({
          revision: revisionWith(
            "prop-1",
            "src/App.tsx",
            ANCHOR,
            `${ANCHOR}\n{/* different text */}`,
          ),
          original: originalProposal(),
          context: contextBundle(),
          sourceRoot: root,
          failedStage: "typecheck",
        }),
      RepairRevisionValidationError,
    );
  });

  it("rejects compiler bypasses instead of genuine fixes", async () => {
    const root = await sourceRoot();
    const bypasses = [
      "const x = y as any;",
      "const x: any = y;",
      "foo<any>(y);",
      "// @ts-ignore",
      "// @ts-expect-error",
      "/* @ts-nocheck */",
      "// eslint-disable-next-line",
      "noUncheckedIndexedAccess",
    ];
    for (const bypass of bypasses) {
      assert.throws(
        () =>
          validateRepairRevision({
            revision: revisionWith(
              "prop-2",
              "src/App.tsx",
              ANCHOR,
              `${ANCHOR}\n${bypass}`,
            ),
            original: originalProposal(),
            context: contextBundle(),
            sourceRoot: root,
            failedStage: "typecheck",
          }),
        RepairRevisionValidationError,
        bypass,
      );
    }
  });

  it("rejects test and compiler-config edits", async () => {
    const root = await sourceRoot();
    assert.throws(
      () =>
        validateRepairRevision({
          revision: revisionWith(
            "prop-2",
            "src/App.test.tsx",
            "test-checkout-modal",
            "test-checkout-modal-changed",
          ),
          original: originalProposal(),
          context: contextBundle(),
          sourceRoot: root,
          failedStage: "typecheck",
        }),
      /forbidden target/,
    );
    assert.throws(
      () =>
        validateRepairRevision({
          revision: revisionWith(
            "prop-2",
            "tsconfig.json",
            "checkout-modal",
            "checkout-modal-changed",
          ),
          original: originalProposal(),
          context: contextBundle(),
          sourceRoot: root,
          failedStage: "typecheck",
        }),
      /forbidden target/,
    );
  });

  it("reports non-null assertions without rejecting them", async () => {
    const root = await sourceRoot();
    const result = validateRepairRevision({
      revision: revisionWith(
        "prop-2",
        "src/App.tsx",
        ANCHOR,
        `${ANCHOR}\nfirst!.focus();`,
      ),
      original: originalProposal(),
      context: contextBundle(),
      sourceRoot: root,
      failedStage: "typecheck",
    });
    assert.ok(result.nonNullAssertions.length > 0);
    assert.deepEqual(findNonNullAssertions("a && b"), []);
  });
});
