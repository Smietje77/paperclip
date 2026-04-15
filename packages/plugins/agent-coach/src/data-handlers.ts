/**
 * Data handlers — read-only access to persisted run-score data.
 *
 * Registered via `ctx.data.register()` so UI components (slice 2 dashboard)
 * and other consumers can pull scores without a dedicated REST route.
 *
 * Validation is strict at the boundary: malformed params throw a descriptive
 * Error rather than silently returning empty data so consumer bugs surface
 * loudly.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "./constants.js";
import type { PersistedRunScore } from "./persistence.js";
import { RUN_SCORE_ENTITY_TYPE } from "./persistence.js";

export const DATA_KEYS = {
  latestScore: "agent-score-latest",
  scoreHistory: "agent-score-history",
  agentList: "agent-list",
} as const;

export interface AgentListEntry {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
  readonly status: string | null;
}

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 500;

function requireAgentId(params: Record<string, unknown>, dataKey: string): string {
  const value = params.agentId;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${dataKey}: "agentId" param is required (string, non-empty)`);
  }
  return value;
}

function requireCompanyId(params: Record<string, unknown>, dataKey: string): string {
  const value = params.companyId;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${dataKey}: "companyId" param is required (string, non-empty)`);
  }
  return value;
}

function normalizeLimit(params: Record<string, unknown>): number {
  const raw = params.limit;
  if (raw === undefined || raw === null) return DEFAULT_HISTORY_LIMIT;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`agent-score-history: "limit" must be a positive number when provided`);
  }
  return Math.min(Math.floor(raw), MAX_HISTORY_LIMIT);
}

function coerceRecord(value: unknown): PersistedRunScore | null {
  if (!value || typeof value !== "object") return null;
  return value as PersistedRunScore;
}

export async function latestScoreHandler(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<PersistedRunScore | null> {
  const agentId = requireAgentId(params, DATA_KEYS.latestScore);
  const raw = await ctx.state.get({
    scopeKind: "agent",
    scopeId: agentId,
    stateKey: STATE_KEYS.latestScore,
  });
  return coerceRecord(raw);
}

export async function scoreHistoryHandler(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<PersistedRunScore[]> {
  const agentId = requireAgentId(params, DATA_KEYS.scoreHistory);
  const limit = normalizeLimit(params);
  const records = await ctx.entities.list({
    entityType: RUN_SCORE_ENTITY_TYPE,
    scopeKind: "agent",
    scopeId: agentId,
    limit,
  });
  const scores: PersistedRunScore[] = [];
  for (const record of records) {
    const coerced = coerceRecord(record.data);
    if (coerced) scores.push(coerced);
  }
  scores.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return scores;
}

export async function agentListHandler(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<AgentListEntry[]> {
  const companyId = requireCompanyId(params, DATA_KEYS.agentList);
  const agents = await ctx.agents.list({ companyId, limit: 200 });
  return agents
    .map((agent) => ({
      id: agent.id,
      name: agent.name ?? agent.id,
      role: agent.role ?? null,
      status: agent.status ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function registerDataHandlers(ctx: PluginContext): void {
  ctx.data.register(DATA_KEYS.latestScore, (params) => latestScoreHandler(ctx, params));
  ctx.data.register(DATA_KEYS.scoreHistory, (params) => scoreHistoryHandler(ctx, params));
  ctx.data.register(DATA_KEYS.agentList, (params) => agentListHandler(ctx, params));
}
