import {
  RepairProposalSchema,
  repairEvidenceIdsOf,
  type ModelUsage,
  type RepairContextBundle,
  type RepairProposal,
} from "@a11yforge/shared";
import {
  META_API_BASE_URL,
  REPAIR_MAX_OUTPUT_TOKENS,
  REPAIR_OPERATION,
  REPAIR_REASONING_EFFORT,
} from "./config.js";
import {
  REPAIR_PROPOSAL_JSON_SCHEMA,
  REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
import { REPAIR_SYSTEM_PROMPT } from "./prompt.js";
import {
  MetaApiError,
  MetaMalformedResultError,
  UnknownEvidenceReferenceError,
  extractUsage,
  type MetaFetch,
} from "./provider.js";

/**
 * Meta repair-proposal call — the second and last model job in A11yForge.
 *
 * Same discipline as diagnosis: OpenAI-compatible Chat Completions with
 * JSON-Schema constrained decoding, then local Zod validation, then
 * evidence-reference grounding. Exactly one request per invocation, never
 * retried — callers fail loudly instead of spending another request.
 * The `fetchFn` is injectable so every test runs against mocks.
 */

export interface ProposeRepairOptions {
  /** Fetch implementation (defaults to global fetch; mocks in tests). */
  fetchFn?: MetaFetch;
  /** Endpoint base (defaults to the Meta API; overridable in tests). */
  baseUrl?: string;
  /** Model id (resolved centrally via `getMetaModel` by the CLI). */
  model: string;
  /** API key — read via `requireApiKey`, never logged. */
  apiKey: string;
  /** Output token cap (defaults to the documented repair budget). */
  maxOutputTokens?: number;
}

export interface ProposeRepairResult {
  proposal: RepairProposal;
  usage: ModelUsage;
}

interface ChatCompletionsResponse {
  id?: unknown;
  choices?: unknown;
  usage?: unknown;
}

/**
 * Reject a proposal that cites evidence outside the supplied context bundle.
 * Exported so the engine and tests apply the same grounding rule.
 */
export function assertRepairEvidenceKnown(
  proposal: Pick<RepairProposal, "evidenceIds">,
  bundle: RepairContextBundle,
): void {
  const known = repairEvidenceIdsOf(bundle);
  const unknown = proposal.evidenceIds.filter((id: string) => !known.has(id));
  if (unknown.length > 0) {
    throw new UnknownEvidenceReferenceError(unknown);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Exactly one Meta request: send the repair context bundle, demand a
 * schema-constrained proposal, validate it locally, and ground its evidence
 * references. Never retries. The API key travels only in the Authorization
 * header.
 */
export async function proposeRepairWithMeta(
  bundle: RepairContextBundle,
  options: ProposeRepairOptions,
): Promise<ProposeRepairResult> {
  const {
    fetchFn = fetch,
    baseUrl = META_API_BASE_URL,
    model,
    apiKey,
    maxOutputTokens = REPAIR_MAX_OUTPUT_TOKENS,
  } = options;

  const requestBody = {
    model,
    messages: [
      { role: "system", content: REPAIR_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Propose the smallest repair for this diagnosis from the supplied source context only. ` +
          `Cite only evidence IDs from the bundle. This is a PROPOSAL — the repair is not applied or tested.\n` +
          `${JSON.stringify(bundle)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
        strict: true,
        schema: REPAIR_PROPOSAL_JSON_SCHEMA,
      },
    },
    // `max_completion_tokens` covers reasoning + visible tokens on
    // reasoning models; `reasoning_effort` is centralized in config.
    max_completion_tokens: maxOutputTokens,
    reasoning_effort: REPAIR_REASONING_EFFORT,
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new MetaApiError(
      null,
      `Meta API request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const snippet = (await response.text().catch(() => "")).slice(0, 300);
    throw new MetaApiError(
      response.status,
      `Meta API error ${response.status}${snippet !== "" ? `: ${snippet}` : ""}`,
    );
  }

  const body = (await response.json().catch(() => null)) as
    | ChatCompletionsResponse
    | null;
  // Official Chat Completions path only: choices[0].message.content.
  // No alternate speculative response formats are accepted.
  const bodyRecord = asRecord(body) ?? {};
  const choices = bodyRecord["choices"];
  const firstChoice = asRecord(
    Array.isArray(choices) ? choices[0] : undefined,
  );
  const message = asRecord(firstChoice?.["message"]);
  const content = message?.["content"];
  if (typeof content !== "string" || content.trim() === "") {
    const usage = extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
      REPAIR_OPERATION,
    );
    throw new MetaMalformedResultError(
      `Meta API returned no message content for the repair proposal ` +
        `(model=${model}, requestId=${usage.requestId ?? "n/a"}). ` +
        `Credits were consumed; no proposal was fabricated.`,
      usage,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new MetaMalformedResultError(
      "Meta API returned content that is not valid JSON.",
    );
  }

  const validated = RepairProposalSchema.safeParse(parsed);
  if (!validated.success) {
    throw new MetaMalformedResultError(
      `Meta API returned a repair proposal that failed local validation: ${validated.error.message}`,
    );
  }
  assertRepairEvidenceKnown(validated.data, bundle);

  return {
    proposal: validated.data,
    usage: extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
      REPAIR_OPERATION,
    ),
  };
}
