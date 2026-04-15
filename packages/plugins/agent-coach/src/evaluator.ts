/**
 * Rubric-based LLM evaluator.
 *
 * Defines a small `RubricEvaluator` interface so the rest of the plugin
 * stays transport-agnostic. Today we ship an Anthropic implementation
 * against the Messages API; future slices can add evaluator variants
 * (e.g. `ctx.agents.invoke` against a dedicated evaluator agent) without
 * touching the scoring or persistence layers.
 */

import { buildRubricPrompt, parseRubricResponse, type RubricInput, type RubricResult } from "./rubric.js";

export type RubricEvaluation =
  | { readonly ok: true; readonly result: RubricResult }
  | { readonly ok: false; readonly reason: string };

export interface RubricEvaluator {
  evaluate(input: RubricInput): Promise<RubricEvaluation>;
}

/**
 * No-op evaluator used when LLM evaluation is disabled. Keeps the wiring
 * simple — callers always get a `RubricEvaluation` back and never need to
 * branch on "is the feature on".
 */
export class NullRubricEvaluator implements RubricEvaluator {
  async evaluate(): Promise<RubricEvaluation> {
    return { ok: false, reason: "evaluator disabled" };
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AnthropicEvaluatorOptions {
  readonly httpFetch: FetchLike;
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
  readonly endpoint?: string;
  readonly anthropicVersion?: string;
}

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 512;

interface AnthropicMessagesResponse {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
}

function extractTextFromAnthropic(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parsed = body as AnthropicMessagesResponse;
  if (!Array.isArray(parsed.content)) return null;
  const chunks: string[] = [];
  for (const block of parsed.content) {
    if (block?.type === "text" && typeof block.text === "string") {
      chunks.push(block.text);
    }
  }
  return chunks.length === 0 ? null : chunks.join("\n");
}

/**
 * Calls the Anthropic Messages API and parses the response against the
 * rubric contract. Any network/parse failure becomes a typed
 * `{ ok: false, reason }` so orchestration code can log and fall back
 * rather than crash the event handler.
 */
export class AnthropicRubricEvaluator implements RubricEvaluator {
  private readonly options: Required<Omit<AnthropicEvaluatorOptions, "anthropicVersion">> & {
    anthropicVersion: string;
  };

  constructor(options: AnthropicEvaluatorOptions) {
    this.options = {
      httpFetch: options.httpFetch,
      apiKey: options.apiKey,
      model: options.model,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
      anthropicVersion: options.anthropicVersion ?? DEFAULT_VERSION,
    };
  }

  async evaluate(input: RubricInput): Promise<RubricEvaluation> {
    const prompt = buildRubricPrompt(input);
    let response: Response;
    try {
      response = await this.options.httpFetch(this.options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": this.options.anthropicVersion,
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.options.maxTokens,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        }),
      });
    } catch (error: unknown) {
      return {
        ok: false,
        reason: `http error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!response.ok) {
      return { ok: false, reason: `http ${response.status}` };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error: unknown) {
      return {
        ok: false,
        reason: `json parse error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const text = extractTextFromAnthropic(body);
    if (!text) return { ok: false, reason: "no text in Anthropic response" };

    const parsed = parseRubricResponse(text);
    if (!parsed.ok) return { ok: false, reason: `rubric parse: ${parsed.error}` };

    return { ok: true, result: parsed.result };
  }
}
