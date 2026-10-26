/**
 * Autonomous repair engine for A11yForge.
 *
 * Phase 0: package boundary shell only. The future explore → evidence →
 * diagnose → trace → patch → build → replay → verify → accept/reject loop
 * will live here. No functionality yet.
 */

export const ENGINE_NAME = "a11yforge-engine";

export { runAxeScan, newScanId, type ScanOptions } from "./scanner/scan.js";
export { normalizeAxeResults, type NormalizeInput } from "./scanner/normalize.js";
export { formatTerminalSummary } from "./scanner/report.js";
export { writeRunArtifact, type ArtifactOptions } from "./scanner/artifacts.js";
export {
  startFixtureServer,
  FIXTURE_HOST,
  FIXTURE_PORT,
  FIXTURE_URL,
  type FixtureServer,
} from "./scanner/fixture-server.js";
export { findWorkspaceRoot } from "./scanner/workspace.js";
