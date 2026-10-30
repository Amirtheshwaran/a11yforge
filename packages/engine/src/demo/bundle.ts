import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AccessibilityDiagnosisSchema,
  CriticDecisionSchema,
  KeyboardScenarioResultSchema,
  ModelUsageSchema,
  RepairLifecycleSchema,
  RepairProposalSchema,
  RepairVerificationResultSchema,
} from "@a11yforge/shared";
import { SourceTraceResultSchema } from "../trace/trace.js";

/**
 * Phase 7 recorded-demo bundle.
 *
 * Exports ONE explicitly provided completed ACCEPTED run from the
 * git-ignored `.a11yforge/runs/` tree into the versioned
 * `demo/accepted-run/` directory. The bundle is a REAL historical
 * A11yForge run — nothing is manufactured — with local-machine details
 * stripped so it is safe to commit:
 *
 * - absolute filesystem paths removed (sourceRoot → repo-relative form),
 * - provider request IDs removed (token usage retained),
 * - no authorization material, no environment dumps, no secret-like values.
 *
 * Fail-closed: any sanitization failure aborts the export with no partial
 * bundle left behind. Zero model calls.
 */

export const DEMO_MODE = "recorded" as const;
export const DEMO_SOURCE = "real-a11yforge-run" as const;

/** JSON artifacts copied verbatim (after sanitization). Required first. */
const REQUIRED_JSON_ARTIFACTS = [
  "scenario.json",
  "diagnosis.json",
  "source-trace.json",
  "repair-proposal.json",
  "repair-lifecycle.json",
  "repair-verification.json",
  "repair-feedback.json",
  "repair-revision-proposal.json",
  "repair-revision-lifecycle.json",
  "repair-revision-verification.json",
  "critic-decision.json",
] as const;

/** JSON artifacts copied when present (evidence + usage, all sanitized). */
const OPTIONAL_JSON_ARTIFACTS = [
  "scan.json",
  "revised-scan.json",
  "repaired-scan.json",
  "revised-scenario.json",
  "revised-reverse-scenario.json",
  "repaired-scenario.json",
  "model-usage.json",
  "repair-model-usage.json",
  "repair-revision-model-usage.json",
  "critic-model-usage.json",
  "model-usage-summary.json",
] as const;

/** Deterministic diffs — the bounded source changes the verifier checked. */
const REQUIRED_PATCH_ARTIFACTS = [
  "repair-diff.patch",
  "repair-revision-diff.patch",
] as const;

/**
 * Screenshots served by the read model (before + after evidence).
 * The after screenshot prefers the accepted revision's capture.
 */
const BEFORE_PNGS = ["before-modal.png", "modal-open.png", "focus-escaped.png"] as const;
const AFTER_PNG_CANDIDATES = [
  "focus-contained-after-revision.png",
  "focus-contained-after.png",
] as const;

export const MAX_DIFF_BYTES = 100_000;
export const MAX_SCREENSHOT_BYTES = 2_000_000;

export class DemoBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoBundleError";
  }
}

/** Key names that must never appear in a committed bundle. */
const BANNED_KEY_PATTERN =
  /api[_-]?key|model[_-]?api[_-]?key|secret|passwd|password|credential|authorization|set-cookie|x-api-key/i;

/** Value patterns that must never appear in a committed bundle. */
const BANNED_VALUE_PATTERNS: RegExp[] = [
  /model_api_key/i,
  /authorization/i,
  /\bbearer\s+[A-Za-z0-9\-._~+/=]{6,}/i,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(sk-live|sk-test|sk-ant-|xox[bpas]-|gh[op]_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16})/,
  /\/home\/|\/Users\/|\/private\/|\b[A-Z]:\\/,
];

/** Request-ID fields are stripped (token usage is retained). */
function isRequestIdKey(key: string): boolean {
  return key.toLowerCase() === "requestid";
}

/**
 * Sanitize one parsed JSON artifact in place-shape: strip request IDs,
 * rewrite the machine-local source root to its repo-relative form, and
 * throw on anything secret-like or machine-local that remains.
 */
export function sanitizeJsonArtifact(
  fileName: string,
  value: unknown,
): { sanitized: unknown; redactions: number } {
  let redactions = 0;
  const scrub = (node: unknown, pointer: string): unknown => {
    if (typeof node === "string") {
      for (const pattern of BANNED_VALUE_PATTERNS) {
        if (pattern.test(node)) {
          throw new DemoBundleError(
            `sanitization refused: banned pattern in ${fileName} at ${pointer}`,
          );
        }
      }
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((entry, index) => scrub(entry, `${pointer}[${index}]`));
    }
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(node)) {
        if (isRequestIdKey(key)) {
          // Provider request IDs are not evidence: redact to null so the
          // artifact keeps its schema shape (token usage is retained).
          redactions += 1;
          out[key] = null;
          continue;
        }
        if (BANNED_KEY_PATTERN.test(key)) {
          throw new DemoBundleError(
            `sanitization refused: banned key "${key}" in ${fileName} at ${pointer}`,
          );
        }
        // Machine-local checkout root → repo-relative display form.
        if (
          fileName === "source-trace.json" &&
          key === "sourceRoot" &&
          typeof entry === "string"
        ) {
          redactions += 1;
          out[key] = "fixtures/broken-shop";
          continue;
        }
        out[key] = scrub(entry, `${pointer}.${key}`);
      }
      return out;
    }
    return node;
  };
  return { sanitized: scrub(value, "$"), redactions };
}

/** Parse + validate one JSON artifact against its Zod schema. */
function parseArtifact<T>(
  fileName: string,
  raw: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new DemoBundleError(`invalid JSON artifact: ${fileName}`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    throw new DemoBundleError(`artifact failed schema validation: ${fileName}`);
  }
  return parsed.data;
}

export interface DemoManifest {
  mode: typeof DEMO_MODE;
  source: typeof DEMO_SOURCE;
  runId: string;
  exportedAt: string;
  artifacts: string[];
  sha256: Record<string, string>;
  redactions: number;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function readRunFile(runDir: string, name: string): Promise<Buffer> {
  try {
    const raw = await readFile(join(runDir, name));
    if (name.endsWith(".json") || name.endsWith(".patch")) {
      return Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    }
    return raw;
  } catch {
    throw new DemoBundleError(`missing required artifact: ${name}`);
  }
}

async function readOptionalRunFile(
  runDir: string,
  name: string,
): Promise<Buffer | null> {
  try {
    return await readFile(join(runDir, name));
  } catch {
    return null;
  }
}

/**
 * Validate that a run directory holds a complete ACCEPTED run and return
 * its revision lifecycle state. Throws DemoBundleError otherwise.
 */
export async function assertAcceptedRun(runDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(runDir);
  } catch {
    throw new DemoBundleError(`run directory not found: ${runDir}`);
  }
  for (const name of REQUIRED_JSON_ARTIFACTS) {
    if (!entries.includes(name)) {
      throw new DemoBundleError(`run is missing required artifact: ${name}`);
    }
  }
  // Schema validation of every artifact the read model consumes.
  const scenarioRaw = (await readRunFile(runDir, "scenario.json")).toString("utf8");
  const scenario = parseArtifact("scenario.json", scenarioRaw, KeyboardScenarioResultSchema);
  const failed = scenario.assertions.find((a) => a.assertion === "focus-contained-in-modal");
  if (failed === undefined || failed.passed) {
    throw new DemoBundleError("run has no failed focus-contained-in-modal before-state");
  }
  parseArtifact(
    "diagnosis.json",
    (await readRunFile(runDir, "diagnosis.json")).toString("utf8"),
    AccessibilityDiagnosisSchema,
  );
  parseArtifact(
    "source-trace.json",
    (await readRunFile(runDir, "source-trace.json")).toString("utf8"),
    SourceTraceResultSchema,
  );
  parseArtifact(
    "repair-proposal.json",
    (await readRunFile(runDir, "repair-proposal.json")).toString("utf8"),
    RepairProposalSchema,
  );
  parseArtifact(
    "repair-lifecycle.json",
    (await readRunFile(runDir, "repair-lifecycle.json")).toString("utf8"),
    RepairLifecycleSchema,
  );
  const verification = parseArtifact(
    "repair-verification.json",
    (await readRunFile(runDir, "repair-verification.json")).toString("utf8"),
    RepairVerificationResultSchema,
  );
  if (verification.originalAssertion.passed) {
    throw new DemoBundleError("before-state assertion unexpectedly passes");
  }
  parseArtifact(
    "repair-revision-proposal.json",
    (await readRunFile(runDir, "repair-revision-proposal.json")).toString("utf8"),
    RepairProposalSchema,
  );
  const revisionLifecycle = parseArtifact(
    "repair-revision-lifecycle.json",
    (await readRunFile(runDir, "repair-revision-lifecycle.json")).toString("utf8"),
    RepairLifecycleSchema,
  );
  if (revisionLifecycle.state !== "ACCEPTED") {
    throw new DemoBundleError(
      `run lifecycle is ${revisionLifecycle.state}, not ACCEPTED — refusing export`,
    );
  }
  const revisionVerification = parseArtifact(
    "repair-revision-verification.json",
    (await readRunFile(runDir, "repair-revision-verification.json")).toString("utf8"),
    RepairVerificationResultSchema,
  );
  if (!revisionVerification.repairedAssertion.passed) {
    throw new DemoBundleError("after-state assertion does not pass — refusing export");
  }
  const critic = parseArtifact(
    "critic-decision.json",
    (await readRunFile(runDir, "critic-decision.json")).toString("utf8"),
    CriticDecisionSchema,
  );
  if (critic.decision !== "ACCEPT") {
    throw new DemoBundleError("critic did not ACCEPT — refusing export");
  }
  // Token usage retained (request IDs stripped later).
  for (const name of OPTIONAL_JSON_ARTIFACTS) {
    const data = await readOptionalRunFile(runDir, name);
    if (data === null) continue;
    if (name.endsWith("-usage.json") || name === "model-usage-summary.json") {
      if (name === "model-usage-summary.json") continue; // aggregate shape, scanned below
      parseArtifact(name, data.toString("utf8"), ModelUsageSchema);
    }
  }
}

/**
 * Export one ACCEPTED run into `<outDir>/<runId>/` plus a manifest.
 * Fails closed: nothing is written unless every check passes first.
 */
export async function exportDemoRun(args: {
  runDir: string;
  runId: string;
  outDir: string;
}): Promise<DemoManifest> {
  await assertAcceptedRun(args.runDir);

  let afterPng: string | null = null;
  for (const candidate of AFTER_PNG_CANDIDATES) {
    if ((await readOptionalRunFile(args.runDir, candidate)) !== null) {
      afterPng = candidate;
      break;
    }
  }
  if (afterPng === null) {
    throw new DemoBundleError("run has no after-state screenshot — refusing export");
  }
  const pngNames = [...BEFORE_PNGS, afterPng];

  // Stage everything in memory first; write only after all checks pass.
  const staged = new Map<string, Buffer>();
  let redactions = 0;
  const stageJson = async (name: string, required: boolean): Promise<void> => {
    const data = required
      ? await readRunFile(args.runDir, name)
      : await readOptionalRunFile(args.runDir, name);
    if (data === null) return;
    const { sanitized, redactions: count } = sanitizeJsonArtifact(
      name,
      JSON.parse(data.toString("utf8")) as unknown,
    );
    redactions += count;
    staged.set(name, Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`, "utf8"));
  };
  for (const name of REQUIRED_JSON_ARTIFACTS) await stageJson(name, true);
  for (const name of OPTIONAL_JSON_ARTIFACTS) await stageJson(name, false);

  for (const name of REQUIRED_PATCH_ARTIFACTS) {
    const data = await readRunFile(args.runDir, name);
    if (data.length === 0 || data.length > MAX_DIFF_BYTES) {
      throw new DemoBundleError(`unsafe diff size for ${name} — refusing export`);
    }
    sanitizeTextArtifact(name, data.toString("utf8"));
    staged.set(name, data);
  }
  for (const name of pngNames) {
    const data = await readRunFile(args.runDir, name);
    if (data.length < 1000 || data.length > MAX_SCREENSHOT_BYTES) {
      throw new DemoBundleError(`unsafe screenshot size for ${name} — refusing export`);
    }
    if (!isPng(data)) {
      throw new DemoBundleError(`not a PNG screenshot: ${name} — refusing export`);
    }
    staged.set(name, data);
  }

  const manifest: DemoManifest = {
    mode: DEMO_MODE,
    source: DEMO_SOURCE,
    runId: args.runId,
    exportedAt: new Date().toISOString(),
    artifacts: [...staged.keys()].sort(),
    sha256: {},
    redactions,
  };
  for (const [name, data] of [...staged.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    manifest.sha256[name] = sha256Hex(data);
  }

  const destDir = join(args.outDir, args.runId);
  await mkdir(destDir, { recursive: true });
  for (const [name, data] of staged) {
    await writeFile(join(destDir, name), data);
  }
  await writeFile(
    join(args.outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

/** Plain-text artifacts (diffs) must also be free of secrets and paths. */
export function sanitizeTextArtifact(fileName: string, text: string): void {
  for (const pattern of BANNED_VALUE_PATTERNS) {
    if (pattern.test(text)) {
      throw new DemoBundleError(
        `sanitization refused: banned pattern in ${fileName}`,
      );
    }
  }
}

function isPng(data: Buffer): boolean {
  return (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

export interface DemoValidationResult {
  runId: string;
  artifacts: number;
  screenshots: number;
}

/**
 * Validate a previously exported bundle. Fails closed on the first
 * violation. Used by `pnpm demo:validate` and CI.
 */
export async function validateDemoBundle(bundleDir: string): Promise<DemoValidationResult> {
  let manifestRaw: string;
  try {
    manifestRaw = await readFile(join(bundleDir, "manifest.json"), "utf8");
  } catch {
    throw new DemoBundleError("demo bundle has no manifest.json");
  }
  const manifest = JSON.parse(manifestRaw) as DemoManifest;
  if (manifest.mode !== DEMO_MODE) {
    throw new DemoBundleError(`bundle mode is ${String(manifest.mode)}, want recorded`);
  }
  if (manifest.source !== DEMO_SOURCE) {
    throw new DemoBundleError("bundle source is not a real A11yForge run");
  }
  if (typeof manifest.runId !== "string" || manifest.runId === "") {
    throw new DemoBundleError("bundle manifest has no runId");
  }
  const runDir = join(bundleDir, manifest.runId);
  try {
    const entry = await stat(runDir);
    if (!entry.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new DemoBundleError(`bundle run directory missing: ${manifest.runId}`);
  }

  // Lifecycle + schemas straight from the committed bundle.
  await assertAcceptedRun(runDir);

  // Required evidence present in the manifest listing.
  for (const name of [
    ...REQUIRED_JSON_ARTIFACTS,
    ...REQUIRED_PATCH_ARTIFACTS,
    ...BEFORE_PNGS,
  ]) {
    if (!manifest.artifacts.includes(name)) {
      throw new DemoBundleError(`bundle manifest omits required artifact: ${name}`);
    }
  }
  const afterInManifest = AFTER_PNG_CANDIDATES.some((name) =>
    manifest.artifacts.includes(name),
  );
  if (!afterInManifest) {
    throw new DemoBundleError("bundle has no after-state screenshot");
  }

  // Integrity: hashes match, no unexpected files, every file re-scanned.
  const onDisk = await readdir(runDir);
  const manifestFiles = new Set(manifest.artifacts);
  for (const name of onDisk) {
    if (!manifestFiles.has(name)) {
      throw new DemoBundleError(`bundle contains unlisted file: ${name}`);
    }
  }
  let screenshots = 0;
  for (const name of manifest.artifacts) {
    const data = await readRunFile(runDir, name);
    const expected = manifest.sha256[name];
    if (expected === undefined || sha256Hex(data) !== expected) {
      throw new DemoBundleError(`bundle integrity mismatch: ${name}`);
    }
    if (name.endsWith(".json")) {
      sanitizeJsonArtifact(name, JSON.parse(data.toString("utf8")) as unknown);
    } else if (name.endsWith(".patch")) {
      sanitizeTextArtifact(name, data.toString("utf8"));
      if (data.length === 0) throw new DemoBundleError(`empty diff: ${name}`);
    } else if (name.endsWith(".png")) {
      if (!isPng(data) || data.length < 1000) {
        throw new DemoBundleError(`invalid screenshot: ${name}`);
      }
      screenshots += 1;
    } else {
      throw new DemoBundleError(`unexpected artifact type: ${name}`);
    }
  }
  return { runId: manifest.runId, artifacts: manifest.artifacts.length, screenshots };
}
