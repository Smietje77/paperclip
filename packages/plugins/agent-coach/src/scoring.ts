/**
 * Pure scoring utilities for the Agent Coach plugin.
 *
 * Given a captured run (status, timing, reliability signals, cost) produces a
 * composite score 0-100 plus per-dimension breakdown and human-readable flags.
 * No side effects — safe to call from event handlers, jobs, or tests.
 */

export type RunStatus = "success" | "error" | "cancelled" | "timeout";

export interface ScoreInput {
  readonly status: RunStatus;
  readonly durationMs: number | null;
  readonly processLossRetryCount: number;
  readonly costCents: number;
  /** Rolling baseline used for cost scoring. When omitted, a fixed budget is used. */
  readonly expectedCostCents?: number;
}

export interface ScoreDimensions {
  readonly success: number;
  readonly reliability: number;
  readonly cost: number;
}

export interface ScoreResult {
  readonly score: number;
  readonly dimensions: ScoreDimensions;
  readonly flags: readonly string[];
}

const FALLBACK_COST_BUDGET_CENTS = 50;
const SLOW_RUN_THRESHOLD_MS = 30 * 60 * 1000;
const EXPENSIVE_RUN_THRESHOLD_CENTS = 500;

const WEIGHT_SUCCESS = 0.5;
const WEIGHT_RELIABILITY = 0.3;
const WEIGHT_COST = 0.2;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function scoreSuccess(status: RunStatus): number {
  return status === "success" ? 100 : 0;
}

function scoreReliability(processLossRetryCount: number): number {
  const penalty = clamp(processLossRetryCount, 0, 4) * 25;
  return clamp(100 - penalty, 0, 100);
}

function scoreCost(costCents: number, expectedCostCents: number | undefined): number {
  const safeCost = Math.max(costCents, 0);
  const baseline =
    expectedCostCents !== undefined && expectedCostCents > 0
      ? expectedCostCents
      : FALLBACK_COST_BUDGET_CENTS;
  if (safeCost === 0) return 100;
  const ratio = baseline / safeCost;
  return Math.round(clamp(ratio, 0, 1) * 100);
}

function collectFlags(input: ScoreInput): readonly string[] {
  const flags: string[] = [];
  if (input.status !== "success") flags.push(`status:${input.status}`);
  if (input.processLossRetryCount > 0) flags.push("retried");
  if (input.costCents > EXPENSIVE_RUN_THRESHOLD_CENTS) flags.push("expensive");
  if (input.durationMs !== null && input.durationMs > SLOW_RUN_THRESHOLD_MS) flags.push("slow");
  return flags;
}

export function scoreRun(input: ScoreInput): ScoreResult {
  const dimensions: ScoreDimensions = {
    success: scoreSuccess(input.status),
    reliability: scoreReliability(input.processLossRetryCount),
    cost: scoreCost(input.costCents, input.expectedCostCents),
  };
  const composite =
    dimensions.success * WEIGHT_SUCCESS +
    dimensions.reliability * WEIGHT_RELIABILITY +
    dimensions.cost * WEIGHT_COST;
  return {
    score: Math.round(composite),
    dimensions,
    flags: collectFlags(input),
  };
}
