#!/usr/bin/env node
// Smoke test of a running deployment through its one public port.
// Usage: node deploy/smoke.mjs <base-url> [scan-target-url]
//
// Makes real requests, including one real website scan. It makes no model calls:
// POST /backend/runs is only exercised when the server reports no model key, so
// it cannot start a paid run.

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
const scanTarget = process.argv[3] ?? "https://example.com/";
if (baseUrl === "") {
  console.error("Usage: node deploy/smoke.mjs <base-url> [scan-target-url]");
  process.exit(2);
}

const STARTUP_TIMEOUT_MS = 180_000;
const SCAN_TIMEOUT_MS = 180_000;
const api = `${baseUrl}/backend`;
let failures = 0;

function check(name, passed, detail = "") {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
  if (!passed) failures += 1;
}

/** Every response body is read to the end so its connection can be reused. */
async function request(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, ok: res.ok, contentType: res.headers.get("content-type") ?? "", body };
}

function postJson(url, body) {
  return request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForHealth() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await request(`${api}/health`);
      if (res.ok) return JSON.parse(res.body);
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

/** Reads the proxied SSE stream until it ends, counting real stage events. */
async function readEvents(runId) {
  const res = await fetch(`${api}/explorations/${runId}/events`, {
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
  });
  const decoder = new TextDecoder();
  const arrivals = [];
  for await (const chunk of res.body) {
    const text = decoder.decode(chunk);
    const count = (text.match(/^data: /gm) ?? []).length;
    for (let i = 0; i < count; i += 1) arrivals.push(Date.now());
    // The server leaves a live stream open; the client closes it on this event.
    if (text.includes('"stage":"done"') || text.includes('"done":true')) break;
  }
  return { contentType: res.headers.get("content-type") ?? "", arrivals };
}

const health = await waitForHealth();
check("API health through the proxy", health?.status === "ok", JSON.stringify(health));
if (health === null) process.exit(1);
check("runtime data directory is writable", health.dataDirWritable === true);

for (const path of ["/", "/console", "/connect"]) {
  const res = await request(`${baseUrl}${path}`);
  check(`page ${path}`, res.ok, String(res.status));
}

const demo = JSON.parse((await request(`${api}/runs/demo`)).body);
check("recorded demo is ACCEPTED", demo.finalStatus === "ACCEPTED", demo.runId);
const patch = await request(`${api}/runs/${demo.runId}/artifacts/repair-diff.patch`);
check("recorded first-attempt patch is served", patch.ok);
const shot = await request(`${api}/runs/${demo.runId}/artifacts/focus-escaped.png`);
check("recorded failure screenshot is served", shot.ok && shot.contentType.startsWith("image/"));

for (const target of ["http://127.0.0.1:3001/health", "http://169.254.169.254/latest/meta-data/", "http://localhost/"]) {
  const res = await postJson(`${api}/explorations`, { url: target });
  check(`private target refused: ${target}`, res.status === 400, String(res.status));
}
const localPath = await postJson(`${api}/sources/connect`, { localPath: "/etc" });
check("server file paths refused for source connection", localPath.status === 403, String(localPath.status));

if (health.modelConfigured === false) {
  const live = await request(`${api}/runs`, { method: "POST" });
  check("paid live run refused without a model key", live.status === 503, String(live.status));
} else {
  check("server holds no model key", false, "public hosting must leave MODEL_API_KEY unset");
}

const started = await postJson(`${api}/explorations`, { url: scanTarget, maxPages: 1 });
check(`scan accepted: ${scanTarget}`, started.status === 202, String(started.status));
if (started.status !== 202) process.exit(1);
const { runId } = JSON.parse(started.body);
const stream = await readEvents(runId);
const spreadMs = stream.arrivals.length > 1 ? stream.arrivals.at(-1) - stream.arrivals[0] : 0;
check("scan progress streams as SSE", stream.contentType.includes("text/event-stream") && stream.arrivals.length > 1, `${stream.arrivals.length} events`);
// Events arriving together at the end would mean a proxy buffered the stream.
check("scan events arrive over time, not in one burst", spreadMs > 500, `${spreadMs} ms first to last`);

let run = null;
const deadline = Date.now() + SCAN_TIMEOUT_MS;
while (Date.now() < deadline) {
  run = JSON.parse((await request(`${api}/explorations/${runId}`)).body);
  if (run.finishedAt !== undefined && run.finishedAt !== null) break;
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
check("scan completed", run?.state === "COMPLETED", `${run?.state}, ${run?.findings?.length ?? "?"} findings`);
const screenshot = run?.pageCaptures?.[0]?.screenshot ?? run?.screenshots?.[0];
if (typeof screenshot === "string") {
  const image = await request(`${api}/explorations/${runId}/screenshots/${encodeURIComponent(screenshot)}`);
  check("real page screenshot is served", image.ok && image.contentType.startsWith("image/"), screenshot);
} else {
  check("real page screenshot is served", false, "the run recorded no screenshot");
}
const page = await request(`${baseUrl}/explore/${runId}`);
check("result deep link loads", page.ok, String(page.status));

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
