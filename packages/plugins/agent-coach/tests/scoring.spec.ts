import { describe, expect, it } from "vitest";
import { scoreRun } from "../src/scoring.js";

describe("scoreRun", () => {
  it("awards perfect score for a clean, cheap, fast run", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 0,
      costCents: 0,
    });
    expect(result.score).toBe(100);
    expect(result.dimensions.success).toBe(100);
    expect(result.dimensions.reliability).toBe(100);
    expect(result.dimensions.cost).toBe(100);
    expect(result.flags).toEqual([]);
  });

  it("zeros the success dimension on error", () => {
    const result = scoreRun({
      status: "error",
      durationMs: 2_000,
      processLossRetryCount: 0,
      costCents: 10,
    });
    expect(result.dimensions.success).toBe(0);
    expect(result.flags).toContain("status:error");
  });

  it("penalises process-loss retries", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 2,
      costCents: 0,
    });
    expect(result.dimensions.reliability).toBe(50);
    expect(result.flags).toContain("retried");
  });

  it("caps the reliability penalty at 4+ retries", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 99,
      costCents: 0,
    });
    expect(result.dimensions.reliability).toBe(0);
  });

  it("scores cost against expected baseline when provided", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 0,
      costCents: 200,
      expectedCostCents: 100,
    });
    // 100 / 200 = 0.5 → 50
    expect(result.dimensions.cost).toBe(50);
  });

  it("falls back to fixed budget when no baseline given", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 0,
      costCents: 100,
    });
    // fallback 50 / 100 = 0.5 → 50
    expect(result.dimensions.cost).toBe(50);
  });

  it("flags slow runs", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 2 * 60 * 60 * 1_000,
      processLossRetryCount: 0,
      costCents: 0,
    });
    expect(result.flags).toContain("slow");
  });

  it("flags expensive runs", () => {
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 0,
      costCents: 600,
    });
    expect(result.flags).toContain("expensive");
  });

  it("produces a weighted composite blending all dimensions", () => {
    const result = scoreRun({
      status: "error",
      durationMs: 1_000,
      processLossRetryCount: 1,
      costCents: 25,
      expectedCostCents: 50,
    });
    // success 0 * 0.5 + reliability 75 * 0.3 + cost 100 * 0.2 = 42.5 → 43
    expect(result.score).toBe(43);
  });

  it("handles null duration gracefully", () => {
    const result = scoreRun({
      status: "success",
      durationMs: null,
      processLossRetryCount: 0,
      costCents: 0,
    });
    expect(result.score).toBe(100);
    expect(result.flags).not.toContain("slow");
  });
});
