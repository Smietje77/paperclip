/**
 * Pure helpers for aggregating flags across a batch of scored runs.
 * Kept separate from the React component so the logic is unit-testable
 * without a DOM renderer.
 */

import type { PersistedRunScore } from "../persistence.js";

export interface FlagTally {
  readonly flag: string;
  readonly count: number;
}

export function tallyFlags(records: readonly PersistedRunScore[]): FlagTally[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const flag of record.flags) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count || a.flag.localeCompare(b.flag));
}

export interface ScoreStats {
  readonly sampleCount: number;
  readonly average: number;
  readonly min: number;
  readonly max: number;
}

export function computeScoreStats(records: readonly PersistedRunScore[]): ScoreStats | null {
  if (records.length === 0) return null;
  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    total += record.score;
    if (record.score < min) min = record.score;
    if (record.score > max) max = record.score;
  }
  return {
    sampleCount: records.length,
    average: Math.round(total / records.length),
    min,
    max,
  };
}
