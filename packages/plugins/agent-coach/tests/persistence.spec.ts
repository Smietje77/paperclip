import { describe, expect, it, beforeEach } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { STATE_KEYS } from "../src/constants.js";
import { RUN_SCORE_ENTITY_TYPE, persistRunScore } from "../src/persistence.js";
import type { AgentRunEventPayload } from "../src/event-payloads.js";
import { scoreRun } from "../src/scoring.js";

function samplePayload(overrides?: Partial<AgentRunEventPayload>): AgentRunEventPayload & {
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
    startedAt: "2026-04-15T10:00:00.000Z",
    finishedAt: "2026-04-15T10:01:00.000Z",
    durationMs: 60_000,
    ...overrides,
  } as AgentRunEventPayload & { agentId: string; runId: string };
}

describe("persistRunScore", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
  });

  it("writes an entity and a state snapshot for a successful run", async () => {
    const payload = samplePayload();
    const result = scoreRun({
      status: "success",
      durationMs: payload.durationMs,
      processLossRetryCount: 0,
      costCents: 0,
    });

    const record = await persistRunScore(harness.ctx, payload, result, new Date("2026-04-15T10:01:30.000Z"));

    expect(record.score).toBe(100);
    expect(record.recordedAt).toBe("2026-04-15T10:01:30.000Z");

    const state = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-alpha",
      stateKey: STATE_KEYS.latestScore,
    });
    expect(state).toMatchObject({ runId: "run-0001", score: 100, status: "success" });

    const entities = await harness.ctx.entities.list({
      entityType: RUN_SCORE_ENTITY_TYPE,
      scopeKind: "agent",
      scopeId: "agent-alpha",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.externalId).toBe("run-0001");
    expect(entities[0]?.status).toBe("success");
    expect(entities[0]?.data).toMatchObject({ score: 100 });
  });

  it("upserts by runId — replays do not duplicate entities", async () => {
    const payload = samplePayload();
    const result = scoreRun({
      status: "success",
      durationMs: 1_000,
      processLossRetryCount: 0,
      costCents: 0,
    });

    await persistRunScore(harness.ctx, payload, result);
    await persistRunScore(harness.ctx, payload, result);
    await persistRunScore(harness.ctx, payload, result);

    const entities = await harness.ctx.entities.list({
      entityType: RUN_SCORE_ENTITY_TYPE,
      scopeKind: "agent",
      scopeId: "agent-alpha",
    });
    expect(entities).toHaveLength(1);
  });

  it("stores a rubric alongside the heuristic score when provided", async () => {
    const payload = samplePayload();
    const result = scoreRun({ status: "success", durationMs: 1000, processLossRetryCount: 0, costCents: 0 });

    const record = await persistRunScore(harness.ctx, payload, result, {
      rubric: { score: 88, rationale: "nice", suggestions: ["keep going"] },
    });

    expect(record.rubric).toEqual({ score: 88, rationale: "nice", suggestions: ["keep going"] });
    expect(record.rubricFailure).toBeNull();
  });

  it("records rubric-failure reason when evaluator returns ok:false", async () => {
    const payload = samplePayload();
    const result = scoreRun({ status: "success", durationMs: 1000, processLossRetryCount: 0, costCents: 0 });

    const record = await persistRunScore(harness.ctx, payload, result, {
      rubric: null,
      rubricFailure: "http 429",
    });

    expect(record.rubric).toBeNull();
    expect(record.rubricFailure).toBe("http 429");
  });

  it("keeps per-agent state isolated", async () => {
    const payloadA = samplePayload({ agentId: "agent-alpha", runId: "run-a" });
    const payloadB = samplePayload({ agentId: "agent-beta", runId: "run-b", status: "failed" });
    const resultA = scoreRun({ status: "success", durationMs: 1_000, processLossRetryCount: 0, costCents: 0 });
    const resultB = scoreRun({ status: "error", durationMs: 1_000, processLossRetryCount: 2, costCents: 400 });

    await persistRunScore(harness.ctx, payloadA, resultA);
    await persistRunScore(harness.ctx, payloadB, resultB);

    const stateA = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-alpha",
      stateKey: STATE_KEYS.latestScore,
    }) as { score: number } | null;
    const stateB = harness.getState({
      scopeKind: "agent",
      scopeId: "agent-beta",
      stateKey: STATE_KEYS.latestScore,
    }) as { score: number } | null;

    expect(stateA?.score).toBe(100);
    expect(stateB?.score).toBeLessThan(100);
    expect(stateA?.score).not.toBe(stateB?.score);
  });
});
