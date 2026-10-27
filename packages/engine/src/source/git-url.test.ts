import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GitUrlRejectedError,
  parseGitSource,
  sanitizeGitError,
} from "./git-url.js";

describe("git-url validation", () => {
  it("accepts a public https GitHub URL and normalizes it", () => {
    const parsed = parseGitSource("https://github.com/owner/repository");
    assert.equal(parsed.host, "github.com");
    assert.equal(parsed.repoPath, "owner/repository");
    assert.equal(parsed.cloneUrl, "https://github.com/owner/repository.git");
  });

  it("strips a .git suffix and trailing slashes", () => {
    const parsed = parseGitSource("https://github.com/owner/repository.git/");
    assert.equal(parsed.cloneUrl, "https://github.com/owner/repository.git");
  });

  it("accepts non-GitHub https hosts generically", () => {
    const parsed = parseGitSource("https://git.example.org/team/app");
    assert.equal(parsed.host, "git.example.org");
  });

  it("rejects ssh-like transports", () => {
    assert.throws(
      () => parseGitSource("git@github.com:owner/repository.git"),
      GitUrlRejectedError,
    );
  });

  it("rejects file transport and http", () => {
    assert.throws(() => parseGitSource("file:///tmp/repo"), GitUrlRejectedError);
    assert.throws(() => parseGitSource("http://github.com/owner/repo"), GitUrlRejectedError);
  });

  it("rejects credentials in the URL", () => {
    assert.throws(
      () => parseGitSource("https://token123@github.com/owner/repo"),
      GitUrlRejectedError,
    );
  });

  it("rejects private hosts unless explicitly allowed", () => {
    assert.throws(
      () => parseGitSource("https://localhost:3000/repo"),
      GitUrlRejectedError,
    );
    assert.throws(
      () => parseGitSource("https://127.0.0.1/repo"),
      GitUrlRejectedError,
    );
    const allowed = parseGitSource("https://localhost:3000/repo", {
      allowPrivate: true,
    });
    assert.equal(allowed.host, "localhost");
  });

  it("sanitizes errors: no tokens, no home paths", () => {
    const dirty = new Error(
      "https://secrettoken123@github.com/o/r failed for /home/dev/secret token=abc123",
    );
    const clean = sanitizeGitError(dirty);
    assert.ok(!clean.includes("secrettoken123"));
    assert.ok(!clean.includes("abc123"));
    assert.ok(!clean.includes("/home/dev/secret"));
  });
});
