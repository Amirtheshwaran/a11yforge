import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanRepairWorkspace,
  createRepairWorkspace,
  REPAIR_WORKSPACE_BASE_CONFIG,
  REPAIR_WORKSPACE_ENTRIES,
} from "./workspace.js";

function freshDir(tag: string): string {
  return join(
    tmpdir(),
    `a11yforge-ws-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

async function seedFixture(root: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const x = 1;\n");
  await writeFile(join(root, "index.html"), "<html></html>\n");
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "vite.config.ts"), "export default {};\n");
  await writeFile(join(root, "tsconfig.json"), "{}\n");
}

describe("isolated repair workspace", () => {
  it("copies required entries without touching the fixture source", async () => {
    const fixtureRoot = freshDir("src");
    await seedFixture(fixtureRoot);
    const workspacesDir = freshDir("ws");
    const workspace = await createRepairWorkspace({
      repairId: "repair-test-1",
      fixtureRoot,
      workspacesDir,
    });
    assert.equal(
      workspace.workspaceRoot,
      join(workspacesDir, "repair-test-1"),
    );
    for (const entry of REPAIR_WORKSPACE_ENTRIES) {
      const info = await stat(join(workspace.sourceRoot, entry)).catch(
        () => null,
      );
      assert.ok(info !== null, `missing workspace entry ${entry}`);
    }
    assert.ok(
      (await stat(join(workspace.sourceRoot, "src", "App.tsx"))).isFile(),
    );
    // The monorepo base config is mirrored so the fixture's relative
    // `extends` resolves inside the isolated workspace.
    assert.ok(
      (
        await stat(join(workspace.workspaceRoot, REPAIR_WORKSPACE_BASE_CONFIG))
      ).isFile(),
    );
    // The fixture source is untouched: writing in the workspace does not
    // leak back.
    await writeFile(join(workspace.sourceRoot, "src", "App.tsx"), "changed\n");
    assert.equal(
      await readFile(join(fixtureRoot, "src", "App.tsx"), "utf8"),
      "export const x = 1;\n",
    );
  });

  it("rejects invalid repair ids and existing workspaces", async () => {
    const fixtureRoot = freshDir("bad");
    await seedFixture(fixtureRoot);
    const workspacesDir = freshDir("badws");
    await assert.rejects(
      () =>
        createRepairWorkspace({
          repairId: "../escape",
          fixtureRoot,
          workspacesDir,
        }),
      /Invalid repair id/,
    );
    await createRepairWorkspace({
      repairId: "repair-dup",
      fixtureRoot,
      workspacesDir,
    });
    await assert.rejects(
      () =>
        createRepairWorkspace({
          repairId: "repair-dup",
          fixtureRoot,
          workspacesDir,
        }),
      /already exists/,
    );
  });

  it("cleans only inside the workspaces dir", async () => {
    const fixtureRoot = freshDir("clean");
    await seedFixture(fixtureRoot);
    const workspacesDir = freshDir("cleanws");
    const workspace = await createRepairWorkspace({
      repairId: "repair-clean",
      fixtureRoot,
      workspacesDir,
    });
    await assert.rejects(
      () =>
        cleanRepairWorkspace({
          workspaceRoot: fixtureRoot,
          workspacesDir,
        }),
      /outside the repair workspaces dir/,
    );
    await assert.rejects(
      () =>
        cleanRepairWorkspace({ workspaceRoot: workspacesDir, workspacesDir }),
      /outside the repair workspaces dir/,
    );
    await cleanRepairWorkspace({
      workspaceRoot: workspace.workspaceRoot,
      workspacesDir,
    });
    await assert.rejects(() =>
      readFile(join(workspace.sourceRoot, "src", "App.tsx"), "utf8"),
    );
    // The main fixture source survives the clean.
    assert.equal(
      await readFile(join(fixtureRoot, "src", "App.tsx"), "utf8"),
      "export const x = 1;\n",
    );
  });
});
