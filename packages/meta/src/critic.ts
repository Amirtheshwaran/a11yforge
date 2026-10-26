import {
  CriticDecisionSchema,
  type CriticDecision,
  type CriticInput,
  type ModelUsage,
} from "@a11yforge/shared";
import {
  CRITIC_MAX_OUTPUT_TOKENS,
  CRITIC_OPERATION,
  CRITIC_REASONING_EFFORT,
  META_API_BASE_URL,
} from "./config.js";
import {
  CRITIC_DECISION_JSON_SCHEMA,
  CRITIC_DECISION_JSON_SCHEMA_NAME,
} from "./jsonschema.js";
import { CRITIC_SYSTEM_PROMPT } from "./prompt.js";
import {
  MetaApiError,
  MetaMalformedResultError,
  extractUsage,
  type MetaFetch,
} from "./provider.js";

/**
 * Meta repair-critic call — the optional second and final model job.
 *
 * Runs ONLY after deterministic verification already passed. Same
 * discipline as diagnosis and repair proposal: OpenAI-compatible Chat
 * Completions with JSON-Schema constrained decoding, then local Zod
 * validation. Exactly one request per invocation, never retried. The
 * `fetchFn` is injectable so every test runs against mocks.
 */

export interface CritiqueRepairOptions {
  /** Fetch implementation (defaults to global fetch; mocks in tests). */
  fetchFn?: MetaFetch;
  /** Endpoint base (defaults to the Meta API; overridable in tests). */
  baseUrl?: string;
  /** Model id (resolved centrally via `getMetaModel` by the CLI). */
  model: string;
  /** API key — read via `requireApiKey`, never logged. */
  apiKey: string;
  /** Output token cap (defaults to the documented critic budget). */
  maxOutputTokens?: number;
}

export interface CritiqueRepairResult {
  decision: CriticDecision;
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
 * Exactly one Meta request: send the bounded critic input, demand a
 * schema-constrained verdict, validate it locally. Never retries. The API
 * key travels only in the Authorization header. The critic receives
 * measured artifacts only — never the repository.
 */
export async function critiqueRepairWithMeta(
  input: CriticInput,
  options: CritiqueRepairOptions,
): Promise<CritiqueRepairResult> {
  const {
    fetchFn = fetch,
    baseUrl = META_API_BASE_URL,
    model,
    apiKey,
    maxOutputTokens = CRITIC_MAX_OUTPUT_TOKENS,
  } = options;

  const requestBody = {
    model,
    messages: [
      { role: "system", content: CRITIC_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Adjudicate this deterministically verified repair from the supplied evidence only. ` +
          `Cite only evidence IDs from the input. This verdict cannot override deterministic failure.\n` +
          `${JSON.stringify(input)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: CRITIC_DECISION_JSON_SCHEMA_NAME,
        strict: true,
        schema: CRITIC_DECISION_JSON_SCHEMA,
      },
    },
    max_completion_tokens: maxOutputTokens,
    reasoning_effort: CRITIC_REASONING_EFFORT,
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
      CRITIC_OPERATION,
    );
    throw new MetaMalformedResultError(
      `Meta API returned no message content for the critic verdict ` +
        `(model=${model}, requestId=${usage.requestId ?? "n/a"}). ` +
        `Credits were consumed; no verdict was fabricated.`,
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

  const validated = CriticDecisionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new MetaMalformedResultError(
      `Meta API returned a critic verdict that failed local validation: ${validated.error.message}`,
    );
  }

  return {
    decision: validated.data,
    usage: extractUsage(
      bodyRecord as ChatCompletionsResponse,
      model,
      latencyMs,
      new Date().toISOString(),
      CRITIC_OPERATION,
    ),
  };
}
