import {
  CriticDecisionSchema,
  CriticInputSchema,
  type AccessibilityDiagnosis,
  type CriticDecision,
  type CriticInput,
  type ModelUsage,
  type RepairProposal,
  type RepairVerificationResult,
} from "@a11yforge/shared";
import {
  critiqueRepairWithMeta,
  getMetaModel,
  requireApiKey,
  type MetaFetch,
} from "@a11yforge/meta";

/**
 * Phase 5 bounded critic request.
 *
 * Built ONLY from measured artifacts (diagnosis facts, proposal, diff,
 * build/replay outcomes, axe comparison) — never the repository. The
 * critic verdict is validated locally and its cited evidence IDs must
 * come from the supplied input; a critic citing unknown evidence is
 * rejected outright.
 */

export class CriticEvidenceError extends Error {
  constructor(unknownIds: string[]) {
    super(
      `Critic cites unknown evidence IDs: ${unknownIds.join(", ")}`,
    );
    this.name = "CriticEvidenceError";
  }
}

/** Assemble the bounded critic input from verified artifacts. */
export function buildCriticInput(args: {
  diagnosis: AccessibilityDiagnosis;
  proposal: RepairProposal;
  verification: RepairVerificationResult;
  diffText: string;
  evidenceIds: string[];
}): CriticInput {
  return CriticInputSchema.parse({
    repairId: args.verification.repairId,
    proposalId: args.proposal.proposalId,
    diagnosisId: args.diagnosis.diagnosisId,
    observedFailure: args.diagnosis.observedFailure,
    proposalSummary: args.proposal.summary,
    proposalRationale: args.proposal.rationale,
    evidenceIds: args.evidenceIds,
    diff: args.diffText,
    buildCommand: args.verification.buildCommand,
    buildExitCode: args.verification.buildExitCode,
    buildPassed: args.verification.buildPassed,
    before: args.verification.originalAssertion,
    after: args.verification.repairedAssertion,
    baselineAxeRules: args.verification.baselineAxeRules,
    repairedAxeRules: args.verification.repairedAxeRules,
    newAxeViolations: args.verification.newAxeViolations,
    regressions: args.verification.regressions,
  });
}

/** Reject a critic verdict that cites evidence outside the input. */
export function assertCriticEvidenceKnown(
  decision: CriticDecision,
  input: CriticInput,
): void {
  const known = new Set(input.evidenceIds);
  const unknown = decision.evidenceIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new CriticEvidenceError(unknown);
  }
}

export interface RequestCriticDeps {
  env?: NodeJS.ProcessEnv;
  fetchFn?: MetaFetch;
  input: CriticInput;
}

export interface RequestCriticResult {
  decision: CriticDecision;
  usage: ModelUsage;
  model: string;
}

/**
 * Make the single bounded critic call (no retries). Fails BEFORE any
 * network attempt without MODEL_API_KEY.
 */
export async function requestCriticDecision(
  deps: RequestCriticDeps,
): Promise<RequestCriticResult> {
  const env = deps.env ?? process.env;
  const apiKey = requireApiKey(env);
  const model = getMetaModel(env);
  const { decision, usage } = await critiqueRepairWithMeta(deps.input, {
    ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}),
    model,
    apiKey,
  });
  const validated = CriticDecisionSchema.parse(decision);
  assertCriticEvidenceKnown(validated, deps.input);
  return { decision: validated, usage, model };
}
