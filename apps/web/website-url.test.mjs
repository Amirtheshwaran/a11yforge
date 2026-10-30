import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeWebsiteUrl } from "./lib/website-url.ts";

describe("website check address input", () => {
  it("adds https to a bare address without losing its path, query, or hash", () => {
    assert.equal(normalizeWebsiteUrl("  www.site.test/path?q=one#section  "), "https://www.site.test/path?q=one#section");
    assert.equal(normalizeWebsiteUrl("site.test"), "https://site.test/");
    assert.equal(normalizeWebsiteUrl("//site.test/path"), "https://site.test/path");
  });
  it("retains explicit HTTP and ports for the API's target validation", () => {
    assert.equal(normalizeWebsiteUrl("http://site.test:8080/path"), "http://site.test:8080/path");
    assert.equal(normalizeWebsiteUrl("site.test:8443/path"), "https://site.test:8443/path");
    assert.equal(normalizeWebsiteUrl("https://site.test/path"), "https://site.test/path");
  });
  it("rejects empty and malformed addresses with an actionable error", () => {
    assert.throws(() => normalizeWebsiteUrl("  "), /Enter a website address/);
    assert.throws(() => normalizeWebsiteUrl("https://"), /valid website address/);
    assert.throws(() => normalizeWebsiteUrl("not a website"), /valid website address/);
  });
  it("rejects non-web schemes and credentials before starting a scan", () => {
    for (const value of ["javascript:alert(1)", "javascript:123", "file:///private.txt", "ftp://site.test", "data:text/html,test"]) {
      assert.throws(() => normalizeWebsiteUrl(value), /http:\/\/ or https:\/\//);
    }
    assert.throws(() => normalizeWebsiteUrl("https://user:password@site.test"), /without a username or password/);
  });
});
