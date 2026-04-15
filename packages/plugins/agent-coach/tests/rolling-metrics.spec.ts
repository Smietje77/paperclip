import { describe, expect, it } from "vitest";
import { computeRollingMetrics, groupByAgent } from "../src/rolling-metrics.js";
import type { PersistedRunScore } from "../src/persistence.js";

function record(partial: Partial<PersistedRunScore>): PersistedRunScore {
  return {
    runId: "run",
    agentId: "agent-a",
    status: "success",
    score: 100,
    dimensions: { success: 100, reliability: 100, cost: 100 },
    flags: [],
    durationMs: 1000,
    startedAt: null,
    finishedAt: null,
    recordedAt: "2026-04-15T10:00:00.000Z",
    ...partial,
  } as PersistedRunScore;
}

describe("computeRollingMetrics", () => {
  const now = new Date("2026-04-15T12:00:00.000Z");

  it("returns empty metrics when no records are present", () => {
    const metrics = computeRollingMetrics([], now, 7);
    expect(metrics.sampleCount).toBe(0);
    expect(metrics.averageScore).toBe(0);
    expect(metrics.oldestSampleAt).toBeNull();
    expect(metrics.flagFrequencies).toEqual([]);
  });

  it("includes only records within the window", () => {
    const metrics = computeRollingMetrics(
      [
        record({ runId: "r1", score: 80, recordedAt: "2026-04-15T11:00:00.000Z" }),
        record({ runId: "r2", score: 50, recordedAt: "2026-04-14T11:00:00.000Z" }),
        record({ runId: "r3", score: 10, recordedAt: "2026-01-01T00:00:00.000Z" }),
      ],
      now,
      7,
    );
    expect(metrics.sampleCount).toBe(2);
    expect(metrics.averageScore).toBe(65);
    expect(metrics.minScore).toBe(50);
    expect(metrics.maxScore).toBe(80);
  });

  it("computes success/failure/cancelled rates rounded to three decimals", () => {
    const metrics = computeRollingMetrics(
      [
        record({ runId: "r1", status: "success", recordedAt: "2026-04-15T11:00:00.000Z" }),
        record({ runId: "r2", status: "failed", recordedAt: "2026-04-15T11:00:00.000Z" }),
        record({ runId: "r3", status: "cancelled", recordedAt: "2026-04-15T11:00:00.000Z" }),
      ],
      now,
      7,
    );
    expect(metrics.successRate).toBeCloseTo(0.333, 3);
    expect(metrics.failureRate).toBeCloseTo(0.333, 3);
    expect(metrics.cancelledRate).toBeCloseTo(0.333, 3);
  });

  it("tallies flag frequencies across the window", () => {
    const metrics = computeRollingMetrics(
      [
        record({ runId: "r1", flags: ["retried", "slow"], recordedAt: "2026-04-15T11:00:00.000Z" }),
        record({ runId: "r2", flags: ["retried"], recordedAt: "2026-04-15T11:00:00.000Z" }),
      ],
      now,
      7,
    );
    expect(metrics.flagFrequencies).toEqual([
      { flag: "retried", count: 2 },
      { flag: "slow", count: 1 },
    ]);
  });

  it("sets window boundaries based on now and windowDays", () => {
    const metrics = computeRollingMetrics([], now, 30);
    expect(metrics.windowEnd).toBe(now.toISOString());
    expect(new Date(metrics.windowStart).getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("skips records with malformed timestamps", () => {
    const metrics = computeRollingMetrics(
      [
        record({ runId: "bad", recordedAt: "not-a-date" }),
        record({ runId: "ok", recordedAt: "2026-04-15T11:00:00.000Z" }),
      ],
      now,
      7,
    );
    expect(metrics.sampleCount).toBe(1);
  });
});

describe("groupByAgent", () => {
  it("buckets records by agentId", () => {
    const groups = groupByAgent([
      record({ runId: "a1", agentId: "agent-a" }),
      record({ runId: "a2", agentId: "agent-a" }),
      record({ runId: "b1", agentId: "agent-b" }),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get("agent-a")).toHaveLength(2);
    expect(groups.get("agent-b")).toHaveLength(1);
  });

  it("skips records without an agentId", () => {
    const groups = groupByAgent([record({ agentId: "" as string })]);
    expect(groups.size).toBe(0);
  });
});
