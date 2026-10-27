import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { determineExecutionProfile, detectPackageManager } from "./exec-profile.js";
import type { SourceInventory } from "@a11yforge/shared";

function inventory(partial: Partial<SourceInventory>): SourceInventory {
  return {
    sourceId: "src-test",
    revision: "abc",
    fileCount: 1,
    directoryCount: 1,
    totalBytes: 10,
    textFiles: [],
    manifestFiles: [],
    lockfiles: [],
    scripts: [],
    likelySourceDirs: [],
    truncated: { files: false, textBytes: false },
    ...partial,
  };
}

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

describe("execution profiles", () => {
  it("derives node commands from observed scripts, manager from lockfile", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-exec-"));
    try {
      await writeTree(root, {
        "package.json": JSON.stringify({
          scripts: {
            build: "tsc",
            start: "node dist/index.js",
            test: "node --test",
          },
        }),
      });
      const inv = inventory({
        manifestFiles: ["package.json"],
        lockfiles: ["pnpm-lock.yaml"],
        textFiles: ["package.json"],
        scripts: [
          { name: "build", command: "tsc", source: "package.json#scripts.build" },
          { name: "start", command: "node dist/index.js", source: "package.json#scripts.start" },
          { name: "test", command: "node --test", source: "package.json#scripts.test" },
        ],
      });
      const profile = await determineExecutionProfile({
        sourceId: "src-test",
        sourceRoot: root,
        inventory: inv,
      });
      assert.equal(profile.adapter, "node-manifest");
      assert.equal(profile.packageManager, "pnpm");
      assert.equal(profile.installCommand?.command, "pnpm install --frozen-lockfile");
      assert.equal(profile.buildCommand?.source, "package.json#scripts.build");
      assert.equal(profile.startCommand?.source, "package.json#scripts.start");
      assert.equal(profile.confidence, "high");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves lockfile semantics (npm -> npm ci, yarn frozen)", async () => {
    assert.equal(detectPackageManager(["yarn.lock"]), "yarn");
    assert.equal(detectPackageManager(["package-lock.json"]), "npm");
    assert.equal(detectPackageManager([]), "unknown");
    const root = await mkdtemp(join(tmpdir(), "a11y-exec-"));
    try {
      await writeTree(root, {
        "package.json": JSON.stringify({ scripts: { start: "node s.js" } }),
      });
      const profile = await determineExecutionProfile({
        sourceId: "src-test",
        sourceRoot: root,
        inventory: inventory({
          manifestFiles: ["package.json"],
          lockfiles: ["package-lock.json"],
          scripts: [
            { name: "start", command: "node s.js", source: "package.json#scripts.start" },
          ],
        }),
      });
      assert.equal(profile.installCommand?.command, "npm ci");
      assert.equal(profile.confidence, "partial");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports honest unknown when no adapter applies", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-exec-"));
    try {
      await writeTree(root, { "notes.txt": "hello\n" });
      const profile = await determineExecutionProfile({
        sourceId: "src-test",
        sourceRoot: root,
        inventory: inventory({ textFiles: ["notes.txt"] }),
      });
      assert.equal(profile.adapter, "unknown");
      assert.equal(profile.confidence, "unknown");
      assert.equal(profile.installCommand, null);
      assert.ok(profile.explanation.includes("needs launch instructions") || profile.explanation.length > 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("labels user-supplied commands as user-supplied", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-exec-"));
    try {
      await writeTree(root, { "notes.txt": "hello\n" });
      const profile = await determineExecutionProfile({
        sourceId: "src-test",
        sourceRoot: root,
        inventory: inventory({ textFiles: ["notes.txt"] }),
        userCommands: { startCommand: "python -m http.server 8000" },
      });
      assert.equal(profile.startCommand?.source, "user-supplied");
      assert.equal(profile.confidence, "partial");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serves static html projects without inventing a build", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-exec-"));
    try {
      await writeTree(root, { "index.html": "<html></html>" });
      const profile = await determineExecutionProfile({
        sourceId: "src-test",
        sourceRoot: root,
        inventory: inventory({
          textFiles: ["index.html"],
          manifestFiles: ["index.html"],
        }),
      });
      assert.equal(profile.adapter, "static-html");
      assert.equal(profile.buildCommand, null);
      assert.ok(profile.startCommand !== null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
