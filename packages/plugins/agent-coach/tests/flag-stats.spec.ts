import { describe, expect, it } from "vitest";
import { computeScoreStats, tallyFlags } from "../src/ui/flag-stats.js";
import type { PersistedRunScore } from "../src/persistence.js";

function record(partial: Partial<PersistedRunScore>): PersistedRunScore {
  return {
    runId: "run",
    agentId: "agent",
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

describe("tallyFlags", () => {
  it("returns an empty list for no records", () => {
    expect(tallyFlags([])).toEqual([]);
  });

  it("counts flag occurrences across records", () => {
    const out = tallyFlags([
      record({ flags: ["retried", "expensive"] }),
      record({ flags: ["retried"] }),
      record({ flags: [] }),
      record({ flags: ["retried", "slow"] }),
    ]);
    expect(out).toEqual([
      { flag: "retried", count: 3 },
      { flag: "expensive", count: 1 },
      { flag: "slow", count: 1 },
    ]);
  });

  it("breaks count ties alphabetically", () => {
    const out = tallyFlags([
      record({ flags: ["zzz"] }),
      record({ flags: ["aaa"] }),
      record({ flags: ["mmm"] }),
    ]);
    expect(out.map((entry) => entry.flag)).toEqual(["aaa", "mmm", "zzz"]);
  });
});

describe("computeScoreStats", () => {
  it("returns null when no samples", () => {
    expect(computeScoreStats([])).toBeNull();
  });

  it("computes average, min and max", () => {
    const stats = computeScoreStats([
      record({ score: 100 }),
      record({ score: 50 }),
      record({ score: 70 }),
    ]);
    expect(stats).toEqual({ sampleCount: 3, average: 73, min: 50, max: 100 });
  });

  it("rounds the average", () => {
    const stats = computeScoreStats([record({ score: 100 }), record({ score: 99 })]);
    expect(stats?.average).toBe(100);
  });
});
