/**
 * Scheduled aggregation job.
 *
 * Runs on the cron declared in the manifest, reads every persisted
 * `run-score` entity, buckets them per agent, computes 7-day and 30-day
 * rolling metrics and writes the result to per-agent state so the dashboard
 * and future improvement heuristics can read them with a single lookup.
 */

import type { PluginContext, PluginJobContext } from "@paperclipai/plugin-sdk";
import { JOB_KEYS, STATE_KEYS } from "./constants.js";
import type { PersistedRunScore } from "./persistence.js";
import { RUN_SCORE_ENTITY_TYPE } from "./persistence.js";
import { computeRollingMetrics, groupByAgent, type RollingMetrics } from "./rolling-metrics.js";

export interface AggregationSummary {
  readonly ranAt: string;
  readonly agentCount: number;
  readonly recordCount: number;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

async function loadAllRunScores(ctx: PluginContext): Promise<PersistedRunScore[]> {
  const collected: PersistedRunScore[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await ctx.entities.list({
      entityType: RUN_SCORE_ENTITY_TYPE,
      scopeKind: "agent",
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    for (const record of batch) {
      if (record.data && typeof record.data === "object") {
        collected.push(record.data as unknown as PersistedRunScore);
      }
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return collected;
}

async function writeAgentRollups(
  ctx: PluginContext,
  agentId: string,
  rolling7d: RollingMetrics,
  rolling30d: RollingMetrics,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "agent", scopeId: agentId, stateKey: STATE_KEYS.rolling7d },
    rolling7d,
  );
  await ctx.state.set(
    { scopeKind: "agent", scopeId: agentId, stateKey: STATE_KEYS.rolling30d },
    rolling30d,
  );
}

export async function runAggregateMetrics(
  ctx: PluginContext,
  now: Date = new Date(),
): Promise<AggregationSummary> {
  const records = await loadAllRunScores(ctx);
  const grouped = groupByAgent(records);

  for (const [agentId, bucket] of grouped) {
    const rolling7d = computeRollingMetrics(bucket, now, 7);
    const rolling30d = computeRollingMetrics(bucket, now, 30);
    await writeAgentRollups(ctx, agentId, rolling7d, rolling30d);
  }

  return {
    ranAt: now.toISOString(),
    agentCount: grouped.size,
    recordCount: records.length,
  };
}

export function registerAggregateJob(ctx: PluginContext): void {
  ctx.jobs.register(JOB_KEYS.aggregateMetrics, async (job: PluginJobContext) => {
    const summary = await runAggregateMetrics(ctx);
    ctx.logger.info("agent-coach: aggregate-metrics completed", {
      jobKey: job.jobKey,
      runId: job.runId,
      trigger: job.trigger,
      ...summary,
    });
  });
}
