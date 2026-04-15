/**
 * Pure helpers that roll up `PersistedRunScore` records into fixed time
 * windows (7d, 30d). Kept free of I/O so the logic is exhaustively
 * unit-testable; the scheduled job (`aggregate-job.ts`) is the thin shell
 * that plugs these helpers into the plugin SDK.
 */

import type { PersistedRunScore } from "./persistence.js";

export interface RollingMetrics {
  readonly windowDays: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly sampleCount: number;
  readonly averageScore: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly cancelledRate: number;
  readonly flagFrequencies: readonly { flag: string; count: number }[];
  readonly oldestSampleAt: string | null;
  readonly newestSampleAt: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function msBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

function withinWindow(record: PersistedRunScore, since: Date): boolean {
  const recorded = Date.parse(record.recordedAt);
  if (Number.isNaN(recorded)) return false;
  return recorded >= since.getTime();
}

function countByFlag(records: readonly PersistedRunScore[]): { flag: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const record of records) {
    for (const flag of record.flags) {
      tally.set(flag, (tally.get(flag) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count || a.flag.localeCompare(b.flag));
}

function emptyMetrics(windowDays: number, windowStart: Date, windowEnd: Date): RollingMetrics {
  return {
    windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    sampleCount: 0,
    averageScore: 0,
    minScore: 0,
    maxScore: 0,
    successRate: 0,
    failureRate: 0,
    cancelledRate: 0,
    flagFrequencies: [],
    oldestSampleAt: null,
    newestSampleAt: null,
  };
}

export function computeRollingMetrics(
  records: readonly PersistedRunScore[],
  now: Date,
  windowDays: number,
): RollingMetrics {
  const windowStart = msBefore(now, windowDays);
  const withinSpec = records.filter((record) => withinWindow(record, windowStart));

  if (withinSpec.length === 0) {
    return emptyMetrics(windowDays, windowStart, now);
  }

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let successes = 0;
  let failures = 0;
  let cancelled = 0;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const record of withinSpec) {
    total += record.score;
    if (record.score < min) min = record.score;
    if (record.score > max) max = record.score;
    if (record.status === "success") successes += 1;
    else if (record.status === "cancelled") cancelled += 1;
    else failures += 1;
    if (oldest === null || record.recordedAt < oldest) oldest = record.recordedAt;
    if (newest === null || record.recordedAt > newest) newest = record.recordedAt;
  }

  const sampleCount = withinSpec.length;
  return {
    windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    sampleCount,
    averageScore: Math.round(total / sampleCount),
    minScore: min,
    maxScore: max,
    successRate: Number((successes / sampleCount).toFixed(3)),
    failureRate: Number((failures / sampleCount).toFixed(3)),
    cancelledRate: Number((cancelled / sampleCount).toFixed(3)),
    flagFrequencies: countByFlag(withinSpec),
    oldestSampleAt: oldest,
    newestSampleAt: newest,
  };
}

export function groupByAgent(records: readonly PersistedRunScore[]): Map<string, PersistedRunScore[]> {
  const groups = new Map<string, PersistedRunScore[]>();
  for (const record of records) {
    if (!record.agentId) continue;
    const bucket = groups.get(record.agentId) ?? [];
    bucket.push(record);
    groups.set(record.agentId, bucket);
  }
  return groups;
}
