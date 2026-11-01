import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ExplorationRunSchema } from "@a11yforge/shared";
import { loadFindingEvidence } from "./connect.js";
import { defaultSourcesDir } from "./paths.js";

const timestamp = "2026-11-01T00:00:00.000Z";
const firstPage = "https://example.com/";
const secondPage = "https://example.com/about";
const probe = (pageUrl: string, probeId = "page-axe-scan") => ({
  probeId, pageUrl, targetId: "test-target", status: "failed",
  title: "Test probe", humanSummary: "Test evidence", startedAt: timestamp, completedAt: timestamp,
});

async function savedRun(probeResults: ReturnType<typeof probe>[], check: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "a11y-source-evidence-"));
  try {
    const run = ExplorationRunSchema.parse({
      runId: "test-run", target: { targetId: "test-target", entryUrl: firstPage, normalizedUrl: firstPage, origin: firstPage, createdAt: timestamp, policy: {} },
      state: "COMPLETED", stages: [], startedAt: timestamp, probeResults,
      findings: [{ findingId: "selected", category: "automated-finding", title: "Test finding", whatHappened: "Test failure", whyItMatters: "Test impact", pageUrl: secondPage, probeId: "page-axe-scan" }],
    });
    await writeFile(join(directory, "exploration.json"), JSON.stringify(run));
    await check(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("source evidence provenance", () => {
  it("selects the finding's page when probe ids repeat across pages", async () => {
    await savedRun([probe(firstPage), probe(secondPage)], async (directory) => {
      const evidence = await loadFindingEvidence(directory, "selected");
      assert.equal(evidence.probe.pageUrl, secondPage);
    });
  });
  it("rejects a matching probe on the wrong page", async () => {
    await savedRun([probe(firstPage)], async (directory) => {
      await assert.rejects(loadFindingEvidence(directory, "selected"), /No probe evidence/);
    });
  });
  it("does not substitute a different failed check on the same page", async () => {
    await savedRun([probe(secondPage, "keyboard-traversal")], async (directory) => {
      await assert.rejects(loadFindingEvidence(directory, "selected"), /No probe evidence/);
    });
  });
  it("does not report a repair success when the CLI only traced source, even with a model key", async () => {
    const html = '<input id="contact-email" class="contact-field" data-testid="contact-control" type="email">';
    const matchingProbe = { ...probe(secondPage), evidence: [{ kind: "axe-violation", summary: "Input lacks a label", data: { selector: "#contact-email", html } }] };
    await savedRun([matchingProbe], async (directory) => {
      const source = join(directory, "source");
      await mkdir(source);
      await writeFile(join(source, "index.html"), html);
      try {
        const child = spawnSync(process.execPath, [fileURLToPath(new URL("../repair-cli.js", import.meta.url)), "--run", ".", "--finding", "selected", "--source", source], {
          encoding: "utf8", timeout: 30_000,
          env: { ...process.env, A11YFORGE_RUNS_DIR: directory, MODEL_API_KEY: "test-only-unused-key" },
        });
        assert.equal(child.error, undefined);
        assert.equal(child.status, 3, child.stderr);
        assert.match(child.stdout, /Source candidate located/);
        assert.match(child.stdout, /no repair proposed or verified/);
        assert.doesNotMatch(child.stdout, /available via the API flow/);
      } finally {
        const raw = await readFile(join(directory, "source-target.json"), "utf8").catch(() => null);
        if (raw !== null) {
          const target = JSON.parse(raw) as { workspacePath: string };
          const workspace = resolve(target.workspacePath);
          const sourceDirectory = dirname(workspace);
          assert.equal(dirname(sourceDirectory), resolve(defaultSourcesDir()));
          assert.match(basename(sourceDirectory), /^src-[a-f0-9]{8}$/);
          await rm(sourceDirectory, { recursive: true, force: true });
        }
      }
    });
  });
});
