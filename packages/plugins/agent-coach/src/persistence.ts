/**
 * Persistence helpers for the agent-coach plugin.
 *
 * Scoring results land in two places:
 *
 * 1. `ctx.entities.upsert` — one `run-score` entity per run, scoped to the
 *    agent. Upsert-by-externalId (runId) keeps the operation idempotent so
 *    replayed events do not create duplicates. Querying this list is how the
 *    aggregate-metrics job will build rolling averages in Slice 2.
 *
 * 2. `ctx.state.set` — a compact "latest score" snapshot per agent at a
 *    well-known key, so the dashboard and propose-improvements job can read
 *    the most recent outcome with a single state lookup.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "./constants.js";
import type { AgentRunEventPayload } from "./event-payloads.js";
import type { RubricResult } from "./rubric.js";
import type { ScoreResult } from "./scoring.js";

export const RUN_SCORE_ENTITY_TYPE = "run-score";

export interface PersistedRunScore {
  readonly runId: string;
  readonly agentId: string;
  readonly status: string;
  readonly score: number;
  readonly dimensions: ScoreResult["dimensions"];
  readonly flags: readonly string[];
  readonly durationMs: number | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly recordedAt: string;
  readonly rubric: RubricResult | null;
  readonly rubricFailure: string | null;
}

export interface PersistRunScoreOptions {
  readonly rubric?: RubricResult | null;
  readonly rubricFailure?: string | null;
  readonly now?: Date;
}

function buildPersistedScore(
  payload: AgentRunEventPayload & { readonly agentId: string; readonly runId: string },
  result: ScoreResult,
  now: Date,
  options: PersistRunScoreOptions,
): PersistedRunScore {
  return {
    runId: payload.runId,
    agentId: payload.agentId,
    status: payload.status,
    score: result.score,
    dimensions: result.dimensions,
    flags: result.flags,
    durationMs: payload.durationMs,
    startedAt: payload.startedAt,
    finishedAt: payload.finishedAt,
    recordedAt: now.toISOString(),
    rubric: options.rubric ?? null,
    rubricFailure: options.rubricFailure ?? null,
  };
}

export async function persistRunScore(
  ctx: PluginContext,
  payload: AgentRunEventPayload & { readonly agentId: string; readonly runId: string },
  result: ScoreResult,
  optionsOrDate: PersistRunScoreOptions | Date = {},
): Promise<PersistedRunScore> {
  const options: PersistRunScoreOptions =
    optionsOrDate instanceof Date ? { now: optionsOrDate } : optionsOrDate;
  const now = options.now ?? new Date();
  const record = buildPersistedScore(payload, result, now, options);

  await ctx.entities.upsert({
    entityType: RUN_SCORE_ENTITY_TYPE,
    scopeKind: "agent",
    scopeId: payload.agentId,
    externalId: payload.runId,
    title: `Run ${payload.runId.slice(0, 8)} · ${result.score}`,
    status: payload.status,
    data: { ...record },
  });

  await ctx.state.set(
    { scopeKind: "agent", scopeId: payload.agentId, stateKey: STATE_KEYS.latestScore },
    record,
  );

  return record;
}
