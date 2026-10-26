import {
  AccessibilityDiagnosisSchema,
  evidenceIdsOf,
  type AccessibilityDiagnosis,
  type EvidenceBundle,
  type ModelUsage,
} from "@a11yforge/shared";
import {
  DIAGNOSIS_MAX_OUTPUT_TOKENS,
  DIAGNOSIS_OPERATION,
  DIAGNOSIS_REASONING_EFFORT,
  META_API_BASE_URL,
} from "./config.js";
import {
  ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
  DIAGNOSIS_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
import { DIAGNOSIS_SYSTEM_PROMPT } from "./prompt.js";

/**
 * Meta Model API provider — the only Meta model caller in A11yForge.
 *
 * OpenAI-compatible Chat Completions with JSON-Schema constrained decoding
 * (`response_format`), then local Zod validation, then A11yForge
 * evidence-reference validation. The `fetchFn` is injectable so every test
 * runs against mocks; no test performs a live request.
 */

export type MetaFetch = typeof fetch;

/** Transport/API failure: non-2xx status or unreachable endpoint. */
export class MetaApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * The model returned bytes that are not a valid diagnosis object.
 *
 * When the HTTP request succeeded but the model produced no usable output
 * (e.g. empty content), `usage` carries the telemetry for the request that
 * consumed credits, so callers can preserve it before throwing. It is null
 * when no usage was reported or when the failure happened before any
 * response arrived.
 */
export class MetaMalformedResultError extends Error {
  readonly usage: ModelUsage | null;

  constructor(message: string, usage: ModelUsage | null = null) {
    super(message);
    this.name = "MetaMalformedResultError";
    this.usage = usage;
  }
}

/** The diagnosis cites evidence IDs absent from the supplied bundle. */
export class UnknownEvidenceReferenceError extends Error {
  constructor(readonly unknownIds: string[]) {
    super(
      `Diagnosis cites unknown evidence IDs: ${unknownIds.join(", ")}`,
    );
    this.name = "UnknownEvidenceReferenceError";
  }
}

export interface DiagnoseOptions {
  /** Fetch implementation (defaults to global fetch; mocks in tests). */
  fetchFn?: MetaFetch;
  /** Endpoint base (defaults to the Meta API; overridable in tests). */
  baseUrl?: string;
  /** Model id (resolved centrally via `getMetaModel` by the CLI). */
  model: string;
  /** API key — read via `requireApiKey`, never logged. */
  apiKey: string;
  /** Output token cap (defaults to the documented conservative budget). */
  maxOutputTokens?: number;
}

export interface DiagnoseResult {
  diagnosis: AccessibilityDiagnosis;
  usage: ModelUsage;
}

interface ChatCompletionsResponse {
  id?: unknown;
  choices?: unknown;
  usage?: unknown;
}

/**
 * Reject a diagnosis that cites evidence outside the supplied bundle.
 * Exported so the engine and tests apply the same grounding rule.
 */
export function assertEvidenceReferencesKnown(
  diagnosis: Pick<AccessibilityDiagnosis, "evidenceIds">,
  bundle: EvidenceBundle,
): void {
  const known = evidenceIdsOf(bundle);
  const unknown = diagnosis.evidenceIds.filter((id: string) => !known.has(id));
  if (unknown.length > 0) {
    throw new UnknownEvidenceReferenceError(unknown);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeIntOrNull(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Safe, secret-free summary of an empty-content Chat Completions response.
 * Reports only response metadata (request id, model, finish reason, token
 * counts) — never the API key, headers, hidden reasoning, or raw secrets.
 */
function describeEmptyContent(args: {
  model: string;
  responseId: string | null;
  finishReason: string | null;
  shapeDetail: string;
  usage: ModelUsage;
  totalTokens: number | null;
}): string {
  const detail = [
    "HTTP request succeeded",
    `model=${args.model}`,
    `requestId=${args.responseId ?? "n/a"}`,
    `finish_reason=${args.finishReason ?? "n/a"}`,
    `promptTokens=${args.usage.inputTokens ?? "n/a"}`,
    `completionTokens=${args.usage.outputTokens ?? "n/a"}`,
    `reasoningTokens=${args.usage.reasoningTokens ?? "n/a"}`,
    `totalTokens=${args.totalTokens ?? "n/a"}`,
    "contentEmpty=true",
  ].join(", ");
  let message =
    `Meta API returned no message content for the diagnosis ` +
    `(${args.shapeDetail}; ${detail}).`;
  if (args.finishReason === "length") {
    message +=
      " Meta diagnosis exhausted the completion-token budget before " +
      "producing visible structured output (finish_reason=length). The " +
      "reasoning model consumed the completion budget before emitting JSON; " +
      "raise max_completion_tokens or lower reasoning effort and retry " +
      "as a new bounded request.";
  }
  return message;
}

export function extractUsage(
  body: ChatCompletionsResponse,
  model: string,
  latencyMs: number,
  timestamp: string,
  operation: string = DIAGNOSIS_OPERATION,
): ModelUsage {
  const usage = asRecord(body.usage) ?? {};
  const promptDetails =
    asRecord(usage["prompt_tokens_details"]) ?? {};
  const completionDetails =
    asRecord(usage["completion_tokens_details"]) ?? {};
  const requestId =
    typeof body.id === "string" && body.id !== "" ? body.id : null;
  return {
    model,
    operation,
    inputTokens: asNonNegativeIntOrNull(usage["prompt_tokens"]),
    cachedInputTokens: asNonNegativeIntOrNull(
      promptDetails["cached_tokens"],
    ),
    outputTokens: asNonNegativeIntOrNull(usage["completion_tokens"]),
    reasoningTokens: asNonNegativeIntOrNull(
      completionDetails["reasoning_tokens"],
    ),
    latencyMs,
    timestamp,
    requestId,
  };
}

/**
 * Exactly one Meta request: send the evidence bundle, demand a
 * schema-constrained diagnosis, validate it locally, and ground it against
 * the bundle. Never retries — callers fail loudly instead of spending
 * another request. The API key travels only in the Authorization header.
 */
export async function diagnoseWithMeta(
  bundle: EvidenceBundle,
  options: DiagnoseOptions,
): Promise<DiagnoseResult> {
  const {
    fetchFn = fetch,
    baseUrl = META_API_BASE_URL,
    model,
    apiKey,
    maxOutputTokens = DIAGNOSIS_MAX_OUTPUT_TOKENS,
  } = options;

  const requestBody = {
    model,
    messages: [
      { role: "system", content: DIAGNOSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Diagnose the failed assertion from this evidence bundle. Cite only evidence IDs from the bundle.\n${JSON.stringify(bundle)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: DIAGNOSIS_JSON_SCHEMA_NAME,
        strict: true,
        schema: ACCESSIBILITY_DIAGNOSIS_JSON_SCHEMA,
      },
    },
    // `max_completion_tokens` covers reasoning + visible tokens on
    // reasoning models; `reasoning_effort` is centralized in config.
    max_completion_tokens: maxOutputTokens,
    reasoning_effort: DIAGNOSIS_REASONING_EFFORT,
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
    const shapeDetail =
      !Array.isArray(choices) || choices.length === 0
        ? "response has no usable choice"
        : firstChoice === null
          ? "first choice is not an object"
          : message === null
            ? "first choice has no message object"
            : "message content is missing or empty";
    const finishReason = asOptionalString(firstChoice?.["finish_reason"]);
    const usage = extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
    );
    const totalTokens = asNonNegativeIntOrNull(
      asRecord(bodyRecord["usage"])?.["total_tokens"],
    );
    throw new MetaMalformedResultError(
      describeEmptyContent({
        model,
        responseId: usage.requestId,
        finishReason,
        shapeDetail,
        usage,
        totalTokens,
      }),
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

  const validated = AccessibilityDiagnosisSchema.safeParse(parsed);
  if (!validated.success) {
    throw new MetaMalformedResultError(
      `Meta API returned a diagnosis that failed local validation: ${validated.error.message}`,
    );
  }
  assertEvidenceReferencesKnown(validated.data, bundle);

  return {
    diagnosis: validated.data,
    usage: extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
    ),
  };
}
