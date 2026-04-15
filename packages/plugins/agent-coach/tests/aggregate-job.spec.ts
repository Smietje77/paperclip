import { describe, expect, it, beforeEach } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { STATE_KEYS } from "../src/constants.js";
import { runAggregateMetrics } from "../src/aggregate-job.js";
import { persistRunScore } from "../src/persistence.js";
import type { AgentRunEventPayload } from "../src/event-payloads.js";
import type { RollingMetrics } from "../src/rolling-metrics.js";
import { scoreRun } from "../src/scoring.js";

function payloadFor(overrides: Partial<AgentRunEventPayload>): AgentRunEventPayload & {
  agentId: string;
  runId: string;
} {
  return {
    agentId: "agent-alpha",
    runId: "run-0001",
    status: "success",
    invocationSource: "wakeup",
    triggerDetail: null,
    error: null,
    errorCode: null,
    exitCode: 0,
    processLossRetryCount: 0,
    startedAt: null,
    finishedAt: null,
    durationMs: 1000,
    ...overrides,
  } as AgentRunEventPayload & { agentId: string; runId: string };
}

function resultFor(status: "success" | "error" | "cancelled") {
  return scoreRun({ status, durationMs: 1000, processLossRetryCount: 0, costCents: 0 });
}

describe("runAggregateMetrics", () => {
  let harness: TestHarness;
  const now = new Date("2026-04-15T12:00:00.000Z");

  beforeEach(() => {
    harness = createTestHarness({ manifest });
  });

  it("returns zero counts when no scores are persisted", async () => {
    const summary = await runAggregateMetrics(harness.ctx, now);
    expect(summary).toMatchObject({ agentCount: 0, recordCount: 0 });
  });

  it("writes rolling7d and rolling30d state per agent", async () => {
    await persistRunScore(
      harness.ctx,
      payloadFor({ agentId: "agent-alpha", runId: "r1" }),
      resultFor("success"),
      new Date("2026-04-15T11:00:00.000Z"),
    );
    await persistRunScore(
      harness.ctx,
      payloadFor({ agentId: "agent-beta", runId: "r2", status: "failed" }),
      resultFor("error"),
      new Date("2026-04-15T11:00:00.000Z"),
    );

    const summary = await runAggregateMetrics(harness.ctx, now);
    expect(summary.agentCount).toBe(2);
    expect(summary.recordCount).toBe(2);

    const alpha7d = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-alpha",
      stateKey: STATE_KEYS.rolling7d,
    }) as RollingMetrics | null;
    expect(alpha7d?.sampleCount).toBe(1);
    expect(alpha7d?.averageScore).toBe(100);

    const beta30d = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-beta",
      stateKey: STATE_KEYS.rolling30d,
    }) as RollingMetrics | null;
    expect(beta30d?.sampleCount).toBe(1);
    expect(beta30d?.failureRate).toBeCloseTo(1, 3);
  });

  it("excludes records outside the 7d window but keeps them in the 30d window", async () => {
    await persistRunScore(
      harness.ctx,
      payloadFor({ runId: "recent" }),
      resultFor("success"),
      new Date("2026-04-15T11:00:00.000Z"),
    );
    await persistRunScore(
      harness.ctx,
      payloadFor({ runId: "older" }),
      resultFor("success"),
      new Date("2026-04-01T11:00:00.000Z"),
    );

    await runAggregateMetrics(harness.ctx, now);

    const seven = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-alpha",
      stateKey: STATE_KEYS.rolling7d,
    }) as RollingMetrics;
    const thirty = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-alpha",
      stateKey: STATE_KEYS.rolling30d,
    }) as RollingMetrics;

    expect(seven.sampleCount).toBe(1);
    expect(thirty.sampleCount).toBe(2);
  });
});
