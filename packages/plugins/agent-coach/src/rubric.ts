/**
 * Pure rubric prompt builder and response parser for the LLM evaluator.
 *
 * The evaluator asks a cheap model to rate an agent run against a fixed
 * rubric and return strict JSON. Keeping prompt construction and response
 * parsing in one pure module means the evaluator orchestrator (slice 3.3)
 * can stay focused on transport concerns.
 */

import type { AgentRunEventPayload } from "./event-payloads.js";

export interface RubricInput {
  readonly runId: string;
  readonly agentId: string;
  readonly status: string;
  readonly durationMs: number | null;
  readonly processLossRetryCount: number;
  readonly error: string | null;
  readonly errorCode: string | null;
  readonly flags: readonly string[];
  /** Optional truncated transcript excerpt to ground the rubric. */
  readonly transcriptExcerpt?: string;
}

export interface RubricResult {
  readonly score: number;
  readonly rationale: string;
  readonly suggestions: readonly string[];
}

export interface RubricPrompt {
  readonly system: string;
  readonly user: string;
}

const MAX_TRANSCRIPT_CHARS = 4000;

export const RUBRIC_SYSTEM_PROMPT = [
  "You are an agent-performance evaluator for a Paperclip automation instance.",
  "Given a single run summary, assign a score from 0 to 100 against these dimensions,",
  "then compose an overall score (average):",
  "  - outcome (did the run achieve its goal?)",
  "  - robustness (retries, transient errors, crashes)",
  "  - efficiency (cost and latency vs. the task complexity)",
  "  - signal quality (was the output useful and correct?)",
  "Return STRICT JSON with exactly these keys:",
  '  { "score": number, "rationale": string, "suggestions": string[] }',
  "Suggestions should be actionable, at most 3, each under 140 characters.",
  "Do not wrap the JSON in code fences or commentary.",
].join("\n");

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[truncated]`;
}

function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null) return "unknown";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function formatList(items: readonly string[]): string {
  if (items.length === 0) return "(none)";
  return items.join(", ");
}

export function buildRubricPrompt(input: RubricInput): RubricPrompt {
  const lines = [
    `Run ${input.runId} for agent ${input.agentId}`,
    `Status: ${input.status}`,
    `Duration: ${formatDurationMs(input.durationMs)}`,
    `Process-loss retries: ${input.processLossRetryCount}`,
    `Scoring flags: ${formatList(input.flags)}`,
  ];
  if (input.errorCode || input.error) {
    lines.push(`Error code: ${input.errorCode ?? "(none)"}`);
    lines.push(`Error message: ${input.error ?? "(none)"}`);
  }
  if (input.transcriptExcerpt && input.transcriptExcerpt.trim().length > 0) {
    lines.push("");
    lines.push("Transcript excerpt:");
    lines.push(truncate(input.transcriptExcerpt.trim(), MAX_TRANSCRIPT_CHARS));
  }
  lines.push("");
  lines.push("Return STRICT JSON only.");
  return { system: RUBRIC_SYSTEM_PROMPT, user: lines.join("\n") };
}

/**
 * Extract the first JSON object from a model response. Models occasionally
 * surround JSON with prose despite system instructions; falling back to the
 * first {...} block keeps parsing robust without losing strictness on the
 * actual field validation.
 */
function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

export interface RubricParseFailure {
  readonly ok: false;
  readonly error: string;
}

export interface RubricParseSuccess {
  readonly ok: true;
  readonly result: RubricResult;
}

export type RubricParseOutcome = RubricParseSuccess | RubricParseFailure;

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
    if (out.length >= 10) break;
  }
  return out;
}

export function parseRubricResponse(raw: string): RubricParseOutcome {
  const block = extractJsonBlock(raw);
  if (!block) return { ok: false, error: "no JSON object in response" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (error: unknown) {
    return { ok: false, error: `JSON parse error: ${(error as Error).message}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "parsed value is not an object" };
  }
  const record = parsed as Record<string, unknown>;

  const score = clampScore(record.score);
  if (score === null) {
    return { ok: false, error: '"score" must be a finite number' };
  }

  const rationaleRaw = record.rationale;
  const rationale = typeof rationaleRaw === "string" ? rationaleRaw.trim() : "";

  const suggestions = toStringArray(record.suggestions);

  return {
    ok: true,
    result: {
      score,
      rationale,
      suggestions,
    },
  };
}

/**
 * Convenience helper — turns a raw event payload into the rubric input shape.
 */
export function rubricInputFromPayload(
  payload: AgentRunEventPayload & { readonly agentId: string; readonly runId: string },
  transcriptExcerpt?: string,
): RubricInput {
  return {
    runId: payload.runId,
    agentId: payload.agentId,
    status: payload.status,
    durationMs: payload.durationMs,
    processLossRetryCount: payload.processLossRetryCount,
    error: payload.error,
    errorCode: payload.errorCode,
    flags: [],
    transcriptExcerpt,
  };
}
