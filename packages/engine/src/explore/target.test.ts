import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTargetGuard,
  ipIsBlocked,
  TargetRejectedError,
  validateTargetUrl,
} from "./target.js";

describe("ipIsBlocked", () => {
  it("blocks loopback, private, and link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254"]) {
      assert.equal(ipIsBlocked(ip), true, ip);
    }
  });

  it("blocks reserved, multicast, documentation, and CGNAT ranges", () => {
    for (const ip of ["0.0.0.0", "224.0.0.1", "240.0.0.1", "255.255.255.255", "192.0.2.1", "198.51.100.7", "203.0.113.9", "100.64.0.1"]) {
      assert.equal(ipIsBlocked(ip), true, ip);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "1.1.1.1"]) {
      assert.equal(ipIsBlocked(ip), false, ip);
    }
  });

  it("blocks IPv6 loopback, link-local, unique-local, and mapped IPv4", () => {
    assert.equal(ipIsBlocked("::1"), true);
    assert.equal(ipIsBlocked("fe80::1"), true);
    assert.equal(ipIsBlocked("fc00::1"), true);
    assert.equal(ipIsBlocked("::ffff:127.0.0.1"), true);
    assert.equal(ipIsBlocked("::ffff:93.184.216.34"), false);
  });
});

describe("validateTargetUrl", () => {
  it("normalizes a public URL (lowercases host, drops fragment)", async () => {
    const result = await validateTargetUrl("https://Example.COM:443/a/../b#frag", {
      resolveDns: false,
    });
    assert.equal(result.normalizedUrl, "https://example.com/b");
    assert.equal(result.origin, "https://example.com");
  });

  it("rejects non-http schemes", async () => {
    for (const url of ["file:///etc/passwd", "data:text/html,hi", "javascript:alert(1)", "ftp://example.com/x"]) {
      await assert.rejects(() => validateTargetUrl(url, { resolveDns: false }), TargetRejectedError, url);
    }
  });

  it("rejects credentials in the URL", async () => {
    await assert.rejects(
      () => validateTargetUrl("https://user:pass@example.com/", { resolveDns: false }),
      TargetRejectedError,
    );
  });

  it("rejects garbage input", async () => {
    await assert.rejects(() => validateTargetUrl("not a url", { resolveDns: false }), TargetRejectedError);
  });

  it("rejects private IP literals by default", async () => {
    for (const url of ["http://127.0.0.1:3000/", "http://10.0.0.1/", "http://169.254.169.254/"]) {
      await assert.rejects(() => validateTargetUrl(url), TargetRejectedError, url);
    }
  });

  it("allows private IP literals when explicitly opted in", async () => {
    const result = await validateTargetUrl("http://127.0.0.1:3000/", { allowPrivate: true });
    assert.equal(result.hostname, "127.0.0.1");
  });

  it("rejects localhost via DNS by default, allows with opt-in", async () => {
    await assert.rejects(() => validateTargetUrl("http://localhost:3000/"), TargetRejectedError);
    const result = await validateTargetUrl("http://localhost:3000/", { allowPrivate: true });
    assert.equal(result.hostname, "localhost");
  });
});

describe("createTargetGuard", () => {
  it("caches verdicts and revalidates each new host", async () => {
    const guard = createTargetGuard({ resolveDns: false });
    assert.equal(await guard.checkUrl("https://example.com/a"), true);
    assert.equal(await guard.checkUrl("https://example.com/b"), true);
    assert.equal(await guard.checkUrl("file:///etc/passwd"), false);
    const reason = await guard.rejectionReason("file:///etc/passwd");
    assert.match(reason ?? "", /http/i);
  });
});
