import {
  RepairProposalSchema,
  type ModelUsage,
  type RepairProposal,
  type RepairRevisionRequest,
} from "@a11yforge/shared";
import {
  META_API_BASE_URL,
  REPAIR_MAX_OUTPUT_TOKENS,
  REVISION_OPERATION,
  REPAIR_REASONING_EFFORT,
} from "./config.js";
import {
  REPAIR_PROPOSAL_JSON_SCHEMA,
  REPAIR_PROPOSAL_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
import { REVISION_SYSTEM_PROMPT } from "./prompt.js";
import {
  MetaApiError,
  MetaMalformedResultError,
  UnknownEvidenceReferenceError,
  extractUsage,
  type MetaFetch,
} from "./provider.js";
import { assertRepairEvidenceKnown } from "./repair.js";

/**
 * Meta repair-revision call — the single bounded fix-forward request.
 *
 * Sent ONLY after deterministic verification rejected the first proposal:
 * the model receives the original diagnosis/context/proposal plus the
 * verifier's failure feedback (failed stage, bounded compiler output).
 * Output shape is the same `accessibility-repair-proposal` schema, so all
 * existing source/evidence/path validation applies unchanged. Exactly one
 * request per invocation, never retried. The `fetchFn` is injectable so
 * every test runs against mocks.
 */

export interface ProposeRevisionOptions {
  /** Fetch implementation (defaults to global fetch; mocks in tests). */
  fetchFn?: MetaFetch;
  /** Endpoint base (defaults to the Meta API; overridable in tests). */
  baseUrl?: string;
  /** Model id (resolved centrally via `getMetaModel` by the CLI). */
  model: string;
  /** API key — read via `requireApiKey`, never logged. */
  apiKey: string;
  /** Output token cap (defaults to the repair budget). */
  maxOutputTokens?: number;
}

export interface ProposeRevisionResult {
  proposal: RepairProposal;
  usage: ModelUsage;
}

interface ChatCompletionsResponse {
  id?: unknown;
  choices?: unknown;
  usage?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Exactly one Meta request: send the revision request (context + rejected
 * proposal + verifier feedback), demand a schema-constrained revised
 * proposal, validate it locally, and ground its evidence references
 * against the ORIGINAL context bundle. Never retries. The API key
 * travels only in the Authorization header.
 */
export async function proposeRepairRevisionWithMeta(
  request: RepairRevisionRequest,
  options: ProposeRevisionOptions,
): Promise<ProposeRevisionResult> {
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
      { role: "system", content: REVISION_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Revise the rejected repair using ONLY the supplied source context and verifier feedback. ` +
          `The previous repair functionally resolved the keyboard failure but was rejected because ` +
          `the code does not satisfy the repository's strict TypeScript configuration. ` +
          `Revise the repair minimally without weakening compiler settings. ` +
          `This is a PROPOSAL — the revision is not applied or tested.\n` +
          `${JSON.stringify(request)}`,
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
      REVISION_OPERATION,
    );
    throw new MetaMalformedResultError(
      `Meta API returned no message content for the repair revision ` +
        `(model=${model}, requestId=${usage.requestId ?? "n/a"}). ` +
        `Credits were consumed; no revision was fabricated.`,
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
      `Meta API returned a repair revision that failed local validation: ${validated.error.message}`,
    );
  }
  try {
    assertRepairEvidenceKnown(validated.data, request.context);
  } catch (error) {
    if (error instanceof UnknownEvidenceReferenceError) {
      throw new MetaMalformedResultError(
        `Meta API returned a repair revision citing unknown evidence: ${error.message}`,
      );
    }
    throw error;
  }

  return {
    proposal: validated.data,
    usage: extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
      REVISION_OPERATION,
    ),
  };
}
