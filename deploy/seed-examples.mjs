#!/usr/bin/env node
// Scans the home page of each site in deploy/example-sites.json through a running
// A11yForge API and writes the example gallery manifest the API serves at GET /examples.
//
//   node deploy/seed-examples.mjs <api-base> <data-dir> [sites.json]
//
// Point it at an API instance that writes to the same data directory as the public
// server, so the public server can read each finished scan from disk. Every listed
// example is a real scan. Sites whose page was blocked, unavailable, behind a sign-in
// wall or a bot check are left out and reported, never shown as results. Review the
// pages each scan landed on before publishing: a site that redirects to a local page
// can reveal where the scanner runs, and those should be left out too.
// Progress is saved after each site, so an interrupted run resumes where it stopped.

import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [apiArg, dataDir, sitesFile = "deploy/example-sites.json"] = process.argv.slice(2);
if (apiArg === undefined || dataDir === undefined) {
  console.error("Usage: node deploy/seed-examples.mjs <api-base> <data-dir> [sites.json]");
  process.exit(2);
}
const api = apiArg.replace(/\/$/, "");
const manifestPath = join(dataDir, "examples.json");
const reportPath = join(dataDir, "examples-skipped.json");
const CONCURRENCY = 3;
const SCAN_TIMEOUT_MS = 4 * 60_000;
const BLOCKING_LIMITS = new Set([
  "invalid-target", "navigation-failed", "redirect-blocked", "page-unavailable", "authentication-required", "time-budget-exceeded",
]);
const BOT_WALL = /just a moment|attention required|access denied|are you a robot|captcha|verify you are human|security check|pardon our interruption|request blocked/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function writeJsonAtomic(path, value) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}

/** Why a finished scan can't stand as an example, or null when it can. */
function exclusionReason(run) {
  if (run.state !== "COMPLETED") return `scan ${run.state.toLowerCase()}${run.error ? `: ${run.error}` : ""}`;
  const blocking = run.limitations.find((limit) => BLOCKING_LIMITS.has(limit.code));
  if (blocking !== undefined) return `${blocking.code}: ${blocking.message}`;
  const title = run.pageCaptures?.[0]?.title ?? run.surfaces?.[0]?.title ?? "";
  if (BOT_WALL.test(title)) return `bot check page: "${title}"`;
  if (run.probeResults.length === 0) return "no checks completed";
  return null;
}

/** Counts as the results page shows them: confirmed failures plus automated findings. */
function summarize(site, run) {
  const problems = run.findings.filter((finding) => finding.category === "confirmed-failure" || finding.category === "automated-finding");
  return {
    runId: run.runId,
    name: site.name,
    url: site.url,
    scannedAt: run.finishedAt ?? run.startedAt,
    problems: problems.length,
    attentionFirst: problems.filter((finding) => finding.severity === "critical").length,
  };
}

async function scan(site) {
  let started;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${api}/explorations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: site.url, maxPages: 1 }),
    });
    if (response.status === 429 && attempt < 40) { await sleep(5_000); continue; }
    started = await response.json();
    if (!response.ok) return { error: `start refused (${response.status}): ${started.error ?? "unknown"}` };
    break;
  }
  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const run = await (await fetch(`${api}/explorations/${encodeURIComponent(started.runId)}`)).json();
    if (run.state !== "RUNNING" && Array.isArray(run.findings)) return { run };
    if (run.state === "FAILED" || run.state === "CANCELLED") return { error: `scan ${run.state.toLowerCase()}` };
  }
  await fetch(`${api}/explorations/${encodeURIComponent(started.runId)}/cancel`, { method: "POST" }).catch(() => {});
  return { error: "scan did not finish within 4 minutes" };
}

const sites = JSON.parse(await readFile(sitesFile, "utf8"));
const manifest = await readJson(manifestPath, { generatedAt: null, examples: [] });
const skipped = await readJson(reportPath, []);
const done = new Set([...manifest.examples.map((example) => example.url), ...skipped.map((entry) => entry.url)]);
const queue = sites.filter((site) => !done.has(site.url));
console.log(`${sites.length} sites, ${done.size} already handled, ${queue.length} to scan.`);

let saving = Promise.resolve();
function record(update) {
  update();
  manifest.generatedAt = new Date().toISOString();
  manifest.examples.sort((a, b) => sites.findIndex((s) => s.url === a.url) - sites.findIndex((s) => s.url === b.url));
  saving = saving.then(() => Promise.all([writeJsonAtomic(manifestPath, manifest), writeJsonAtomic(reportPath, skipped)]));
  return saving;
}

async function worker() {
  for (let site = queue.shift(); site !== undefined; site = queue.shift()) {
    const result = await scan(site).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    const reason = result.error ?? exclusionReason(result.run);
    if (reason === null) {
      const entry = summarize(site, result.run);
      await record(() => manifest.examples.push(entry));
      console.log(`OK    ${site.name}: ${entry.problems} problems (${entry.attentionFirst} need attention first)`);
    } else {
      await record(() => skipped.push({ name: site.name, url: site.url, reason: reason.slice(0, 300), runId: result.run?.runId ?? null }));
      console.log(`SKIP  ${site.name}: ${reason.slice(0, 160)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
await saving;

// Recount every listed example from its saved evidence, so the gallery always matches
// the results page, and drop any whose evidence is gone.
const runsDir = join(dataDir, ".a11yforge", "runs");
const checked = [];
for (const example of manifest.examples) {
  const run = await readJson(join(runsDir, example.runId, "exploration.json"), null);
  const site = sites.find((candidate) => candidate.url === example.url) ?? example;
  if (run !== null && run.runId === example.runId && exclusionReason(run) === null) checked.push(summarize(site, run));
  else console.log(`DROP  ${example.name}: saved evidence missing or no longer valid`);
}
await record(() => { manifest.examples = checked; });
console.log(`Done. ${manifest.examples.length} examples listed, ${skipped.length} left out. Manifest: ${manifestPath}`);
