import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPathWithin, requireAbsolutePath } from "./paths.js";
import { cleanSourceWorkspace, cloneGitSource, copyLocalSource } from "./acquire.js";

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("source path containment", () => {
  it("rejects traversal outside the root", async () => {
    const root = await tempDir("a11y-paths-");
    try {
      await assert.rejects(() => assertPathWithin(root, "../escape"));
      await assert.rejects(() => assertPathWithin(root, "/etc/passwd"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes", async (t) => {
    const root = await tempDir("a11y-paths-");
    const outside = await tempDir("a11y-outside-");
    try {
      try {
        await symlink(outside, join(root, "evil"), "dir");
      } catch (err: unknown) {
        if (process.platform === "win32" && (err as NodeJS.ErrnoException).code === "EPERM") {
          t?.skip?.("symlink not permitted on win32 without developer mode");
          return;
        }
        throw err;
      }
      await assert.rejects(() => assertPathWithin(root, "evil"));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("requires absolute local paths without traversal", () => {
    assert.throws(() => requireAbsolutePath("Source directory", "relative/path"));
    assert.throws(() => requireAbsolutePath("Source directory", "/tmp/../etc"));
  });
});

describe("git source acquisition", () => {
  // Literal addresses that the hostname-string check in parseGitSource misses.
  for (const host of ["100.64.0.1", "169.254.1.1", "[fd00::1]"]) {
    it(`refuses a non-public address before running git: ${host}`, async () => {
      const sourcesDir = await tempDir("a11y-clone-");
      try {
        await assert.rejects(
          () => cloneGitSource({ gitUrl: `https://${host}/owner/repo`, sourcesDir, allowPrivate: false }),
          /Could not connect that repository/,
        );
        await assert.rejects(() => access(join(sourcesDir, "repo")));
      } finally {
        await rm(sourcesDir, { recursive: true, force: true });
      }
    });
  }
});

describe("local source acquisition", () => {
  it("copies a tree and records a revision without mutating the original", async () => {
    const src = await tempDir("a11y-local-");
    const dest = await tempDir("a11y-sources-");
    try {
      await writeFile(join(src, "index.html"), "<html></html>", "utf8");
      const result = await copyLocalSource({ sourcePath: src, sourcesDir: dest });
      assert.ok(result.workspacePath.startsWith(dest));
      assert.ok(result.revision.startsWith("local-"));
      assert.equal(
        await import("node:fs/promises").then((fs) =>
          fs.readFile(join(src, "index.html"), "utf8"),
        ),
        "<html></html>",
      );
    } finally {
      await rm(src, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("refuses symlink escapes during copy", async (t) => {
    const src = await tempDir("a11y-local-");
    const outside = await tempDir("a11y-outside-");
    const dest = await tempDir("a11y-sources-");
    try {
      await writeFile(join(outside, "secret.txt"), "secret", "utf8");
      try {
        await symlink(join(outside, "secret.txt"), join(src, "link.txt"));
      } catch (err: unknown) {
        if (process.platform === "win32" && (err as NodeJS.ErrnoException).code === "EPERM") {
          t?.skip?.("symlink not permitted on win32 without developer mode");
          return;
        }
        throw err;
      }
      await assert.rejects(() => copyLocalSource({ sourcePath: src, sourcesDir: dest }));
    } finally {
      await rm(src, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("cleanSourceWorkspace refuses paths outside the sources dir", async () => {
    const dest = await tempDir("a11y-sources-");
    try {
      await mkdir(join(dest, "src-abc", "repo"), { recursive: true });
      await assert.rejects(() =>
        cleanSourceWorkspace({ workspacePath: "/tmp/elsewhere", sourcesDir: dest }),
      );
      await assert.rejects(() =>
        cleanSourceWorkspace({ workspacePath: dest, sourcesDir: dest }),
      );
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
