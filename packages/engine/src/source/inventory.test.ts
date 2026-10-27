import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSourceInventory } from "./inventory.js";

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(root, rel);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

describe("source inventory", () => {
  it("discovers files, manifests, lockfiles, scripts, and source dirs", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-inv-"));
    try {
      await writeTree(root, {
        "package.json": JSON.stringify({
          scripts: { build: "tsc", start: "node dist/index.js" },
        }),
        "pnpm-lock.yaml": "lockfile",
        "src/app.ts": "export const x = 1;",
        "src/style.css": ".a { color: red; }",
        "index.html": "<html></html>",
        "node_modules/dep/index.js": "module.exports = {};",
        "dist/bundle.js": "bundled",
        ".git/HEAD": "ref: refs/heads/main",
        "photo.png": "binary",
      });
      const { inventory } = await buildSourceInventory({
        sourceId: "src-test",
        revision: "abc",
        sourceRoot: root,
      });
      assert.ok(inventory.textFiles.includes("src/app.ts"));
      assert.ok(inventory.textFiles.includes("package.json"));
      assert.ok(!inventory.textFiles.some((f) => f.startsWith("node_modules")));
      assert.ok(!inventory.textFiles.some((f) => f.startsWith("dist")));
      assert.ok(!inventory.textFiles.some((f) => f.startsWith(".git")));
      assert.deepEqual(inventory.manifestFiles, ["index.html", "package.json"]);
      assert.deepEqual(inventory.lockfiles, ["pnpm-lock.yaml"]);
      assert.ok(
        inventory.scripts.some(
          (s) => s.name === "build" && s.source === "package.json#scripts.build",
        ),
      );
      assert.ok(inventory.likelySourceDirs.includes("src"));
      assert.equal(inventory.truncated.files, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips escaping symlinks instead of following them", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-inv-"));
    const outside = await mkdtemp(join(tmpdir(), "a11y-out-"));
    try {
      await writeFile(join(outside, "secret.txt"), "secret", "utf8");
      await writeFile(join(root, "src.ts"), "const a = 1;", "utf8");
      await symlink(join(outside, "secret.txt"), join(root, "evil.txt"));
      const { inventory } = await buildSourceInventory({
        sourceId: "src-test",
        revision: "abc",
        sourceRoot: root,
      });
      assert.ok(inventory.textFiles.includes("src.ts"));
      assert.ok(!inventory.textFiles.some((f) => f.includes("secret")));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("reads python manifests structurally", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-inv-"));
    try {
      await writeTree(root, {
        "pyproject.toml": "[project]\nname = 'demo'\n",
        "app/main.py": "print('hi')\n",
      });
      const { inventory } = await buildSourceInventory({
        sourceId: "src-test",
        revision: "abc",
        sourceRoot: root,
      });
      assert.ok(inventory.manifestFiles.includes("pyproject.toml"));
      assert.ok(inventory.textFiles.includes("app/main.py"));
      assert.ok(inventory.likelySourceDirs.includes("app"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
