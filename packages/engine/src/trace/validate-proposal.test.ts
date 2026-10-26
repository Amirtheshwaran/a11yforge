import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RepairProposalSchema,
  type RepairContextBundle,
  type RepairProposal,
} from "@a11yforge/shared";
import {
  RepairProposalValidationError,
  validateRepairProposal,
} from "./validate-proposal.js";

const ANCHOR = '      <div role="dialog" id="checkout-modal">';
const APP_SOURCE = [
  "export function App() {",
  "  return (",
  ANCHOR,
  '    <button id="checkout-modal-close">Close</button>',
  "  );",
  "}",
  "",
].join("\n");

function contextWith(overrides?: Partial<RepairContextBundle>): {
  context: RepairContextBundle;
  sourceRoot: string;
} {
  const sourceRoot = join(
    tmpdir(),
    `a11yforge-validate-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
  const context: RepairContextBundle = {
    bundleId: "repair-ctx-trace-run-1",
    diagnosisId: "diag-v-1",
    evidenceIds: ["ev-modal-open", "ev-focus-escape"],
    observedFailure: "Focus escaped #checkout-modal.",
    repairStrategy: "Contain focus while the modal is active.",
    sourceFiles: [
      {
        filePath: "src/App.tsx",
        score: 300,
        matchedTerms: ["checkout-modal"],
        matchCount: 20,
      },
    ],
    snippets: [
      {
        filePath: "src/App.tsx",
        startLine: 1,
        endLine: 5,
        content: APP_SOURCE,
        matchedTerms: ["checkout-modal"],
      },
    ],
    ...overrides,
  };
  return { context, sourceRoot };
}

async function writeApp(sourceRoot: string): Promise<void> {
  await mkdir(join(sourceRoot, "src"), { recursive: true });
  await writeFile(join(sourceRoot, "src", "App.tsx"), APP_SOURCE);
}

function validProposal(): RepairProposal {
  return RepairProposalSchema.parse({
    proposalId: "prop-v-1",
    diagnosisId: "diag-v-1",
    summary: "Contain keyboard focus within the active checkout dialog.",
    rationale:
      "Observed evidence shows focus leaving #checkout-modal; trapping Tab inside the dialog addresses the escape.",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: ["src/App.tsx"],
    edits: [
      {
        filePath: "src/App.tsx",
        originalText: ANCHOR,
        replacementText: `${ANCHOR}\n      {/* focus trap added by Phase 5 */}`,
        reason: "Anchors the dialog element that must contain focus.",
      },
    ],
    risks: ["Shift+Tab wrap-around still needs verification."],
    verificationPlan: [
      "rebuild project",
      "replay checkout-modal-keyboard",
      "verify focus-contained-in-modal passes",
    ],
  });
}

describe("validateRepairProposal", () => {
  it("accepts a grounded single-file proposal", async () => {
    const { context, sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    assert.doesNotThrow(() =>
      validateRepairProposal({
        proposal: validProposal(),
        context,
        sourceRoot,
      }),
    );
  });

  it("rejects unknown evidence IDs", async () => {
    const { context, sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    const proposal = { ...validProposal(), evidenceIds: ["ev-invented"] };
    assert.throws(
      () => validateRepairProposal({ proposal, context, sourceRoot }),
      (error: unknown) =>
        error instanceof RepairProposalValidationError &&
        /unknown evidence/.test(error.message),
    );
  });

  it("rejects target files outside the supplied context", async () => {
    const { context, sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    const proposal = {
      ...validProposal(),
      targetFiles: ["src/Invented.tsx"],
    } as RepairProposal;
    assert.throws(
      () => validateRepairProposal({ proposal, context, sourceRoot }),
      /was not supplied in source context/,
    );
  });

  it("rejects anchors absent from the supplied snippets", async () => {
    const { context, sourceRoot } = contextWith();
    // On-disk file contains MORE than the snippets: an anchor the model
    // never saw must still be rejected.
    await mkdir(join(sourceRoot, "src"), { recursive: true });
    await writeFile(
      join(sourceRoot, "src", "App.tsx"),
      `${APP_SOURCE}\nconst unseen = "checkout-modal-shadow";\n`,
    );
    const proposal = {
      ...validProposal(),
      edits: [
        {
          filePath: "src/App.tsx",
          originalText: 'const unseen = "checkout-modal-shadow";',
          replacementText: 'const unseen = "fixed";',
          reason: "Uses unseen source.",
        },
      ],
    };
    assert.throws(
      () => validateRepairProposal({ proposal, context, sourceRoot }),
      /does not appear in the supplied source context/,
    );
  });

  it("rejects empty anchors and identical replacements", async () => {
    const { context, sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    const empty = {
      ...validProposal(),
      edits: [
        {
          filePath: "src/App.tsx",
          originalText: "   ",
          replacementText: "x",
          reason: "Empty anchor.",
        },
      ],
    };
    assert.throws(
      () => validateRepairProposal({ proposal: empty, context, sourceRoot }),
      /originalText is empty/,
    );
    const identical = {
      ...validProposal(),
      edits: [
        {
          filePath: "src/App.tsx",
          originalText: ANCHOR,
          replacementText: ANCHOR,
          reason: "No-op.",
        },
      ],
    };
    assert.throws(
      () =>
        validateRepairProposal({ proposal: identical, context, sourceRoot }),
      /identical to originalText/,
    );
  });

  it("rejects edit-count and file-count overruns", async () => {
    const { context, sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    const base = validProposal().edits[0] as RepairProposal["edits"][number];
    const manyEdits = {
      ...validProposal(),
      edits: [base, base, base, base, base],
    } as unknown as RepairProposal;
    assert.throws(
      () =>
        validateRepairProposal({ proposal: manyEdits, context, sourceRoot }),
      /too many edits/,
    );
    const manyFiles = {
      ...validProposal(),
      edits: [
        { ...base, filePath: "src/App.tsx" },
        { ...base, filePath: "src/Other.tsx" },
        { ...base, filePath: "src/Third.tsx" },
      ],
    } as unknown as RepairProposal;
    // Unknown-file rejection fires first here; extend the context so the
    // count guard is the one under test.
    const wideContext: RepairContextBundle = {
      ...context,
      sourceFiles: [
        ...context.sourceFiles,
        {
          filePath: "src/Other.tsx",
          score: 1,
          matchedTerms: ["x"],
          matchCount: 1,
        },
        {
          filePath: "src/Third.tsx",
          score: 1,
          matchedTerms: ["x"],
          matchCount: 1,
        },
      ],
    };
    assert.throws(
      () =>
        validateRepairProposal({
          proposal: manyFiles,
          context: wideContext,
          sourceRoot,
        }),
      /too many files touched/,
    );
  });

  it("rejects out-of-root and ignored-directory paths", async () => {
    const traversal: RepairContextBundle = {
      ...contextWith().context,
      sourceFiles: [
        {
          filePath: "../evil.ts",
          score: 999,
          matchedTerms: ["x"],
          matchCount: 1,
        },
      ],
      snippets: [
        {
          filePath: "../evil.ts",
          startLine: 1,
          endLine: 1,
          content: "evil()",
          matchedTerms: ["x"],
        },
      ],
    };
    const { sourceRoot } = contextWith();
    await writeApp(sourceRoot);
    const traversalProposal = {
      ...validProposal(),
      diagnosisId: traversal.diagnosisId,
      targetFiles: ["../evil.ts"],
      edits: [
        {
          filePath: "../evil.ts",
          originalText: "evil()",
          replacementText: "evil('patched')",
          reason: "Traversal.",
        },
      ],
    } as unknown as RepairProposal;
    assert.throws(
      () =>
        validateRepairProposal({
          proposal: traversalProposal,
          context: traversal,
          sourceRoot,
        }),
      /escapes the traced source root/,
    );
  });

  it("rejects edits to files missing on disk", async () => {
    const { context, sourceRoot } = contextWith();
    // Context supplied, but the file was never written under sourceRoot.
    assert.throws(
      () =>
        validateRepairProposal({
          proposal: validProposal(),
          context,
          sourceRoot,
        }),
      /does not exist under the source root/,
    );
  });
});

describe("RepairProposalSchema", () => {
  it("parses a grounded proposal and rejects unbounded or empty ones", () => {
    RepairProposalSchema.parse(validProposal());
    const base = validProposal().edits[0] as RepairProposal["edits"][number];
    assert.throws(() =>
      RepairProposalSchema.parse({
        ...validProposal(),
        edits: [base, base, base, base, base],
      }),
    );
    assert.throws(() =>
      RepairProposalSchema.parse({ ...validProposal(), verificationPlan: [] }),
    );
    assert.throws(() =>
      RepairProposalSchema.parse({ ...validProposal(), evidenceIds: [] }),
    );
  });
});
