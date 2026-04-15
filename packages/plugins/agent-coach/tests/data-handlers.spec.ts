import { describe, expect, it, beforeEach } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { DATA_KEYS, registerDataHandlers } from "../src/data-handlers.js";
import { persistRunScore } from "../src/persistence.js";
import type { AgentRunEventPayload } from "../src/event-payloads.js";
import type { PersistedRunScore } from "../src/persistence.js";
import { scoreRun } from "../src/scoring.js";

function samplePayload(
  overrides?: Partial<AgentRunEventPayload>,
): AgentRunEventPayload & { agentId: string; runId: string } {
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

function successResult() {
  return scoreRun({
    status: "success",
    durationMs: 1_000,
    processLossRetryCount: 0,
    costCents: 0,
  });
}

describe("data-handlers", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    registerDataHandlers(harness.ctx);
  });

  describe(DATA_KEYS.latestScore, () => {
    it("returns null when no score has been persisted", async () => {
      const result = await harness.getData(DATA_KEYS.latestScore, { agentId: "agent-alpha" });
      expect(result).toBeNull();
    });

    it("returns the most recently persisted score", async () => {
      await persistRunScore(
        harness.ctx,
        samplePayload({ runId: "run-1" }),
        successResult(),
        new Date("2026-04-15T10:01:00.000Z"),
      );
      await persistRunScore(
        harness.ctx,
        samplePayload({ runId: "run-2" }),
        successResult(),
        new Date("2026-04-15T10:05:00.000Z"),
      );

      const result = (await harness.getData(DATA_KEYS.latestScore, {
        agentId: "agent-alpha",
      })) as PersistedRunScore | null;

      expect(result?.runId).toBe("run-2");
      expect(result?.score).toBe(100);
    });

    it("throws when agentId is missing", async () => {
      await expect(harness.getData(DATA_KEYS.latestScore, {})).rejects.toThrow(/agentId/);
    });

    it("throws when agentId is not a non-empty string", async () => {
      await expect(harness.getData(DATA_KEYS.latestScore, { agentId: "" })).rejects.toThrow(
        /agentId/,
      );
      await expect(harness.getData(DATA_KEYS.latestScore, { agentId: 42 })).rejects.toThrow(
        /agentId/,
      );
    });
  });

  describe(DATA_KEYS.scoreHistory, () => {
    it("returns an empty array when no entities exist", async () => {
      const result = (await harness.getData(DATA_KEYS.scoreHistory, {
        agentId: "agent-alpha",
      })) as PersistedRunScore[];
      expect(result).toEqual([]);
    });

    it("returns all persisted scores for the agent, newest first", async () => {
      await persistRunScore(
        harness.ctx,
        samplePayload({ runId: "run-1" }),
        successResult(),
        new Date("2026-04-15T10:01:00.000Z"),
      );
      await persistRunScore(
        harness.ctx,
        samplePayload({ runId: "run-2" }),
        successResult(),
        new Date("2026-04-15T10:05:00.000Z"),
      );
      await persistRunScore(
        harness.ctx,
        samplePayload({ runId: "run-3" }),
        successResult(),
        new Date("2026-04-15T10:03:00.000Z"),
      );

      const result = (await harness.getData(DATA_KEYS.scoreHistory, {
        agentId: "agent-alpha",
      })) as PersistedRunScore[];

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.runId)).toEqual(["run-2", "run-3", "run-1"]);
    });

    it("deduplicates by runId when the same run is persisted multiple times", async () => {
      const payload = samplePayload({ runId: "run-repeat" });
      await persistRunScore(harness.ctx, payload, successResult());
      await persistRunScore(harness.ctx, payload, successResult());
      await persistRunScore(harness.ctx, payload, successResult());

      const result = (await harness.getData(DATA_KEYS.scoreHistory, {
        agentId: "agent-alpha",
      })) as PersistedRunScore[];

      expect(result).toHaveLength(1);
    });

    it("isolates scores between agents", async () => {
      await persistRunScore(
        harness.ctx,
        samplePayload({ agentId: "agent-alpha", runId: "run-a" }),
        successResult(),
      );
      await persistRunScore(
        harness.ctx,
        samplePayload({ agentId: "agent-beta", runId: "run-b" }),
        successResult(),
      );

      const alpha = (await harness.getData(DATA_KEYS.scoreHistory, {
        agentId: "agent-alpha",
      })) as PersistedRunScore[];
      const beta = (await harness.getData(DATA_KEYS.scoreHistory, {
        agentId: "agent-beta",
      })) as PersistedRunScore[];

      expect(alpha.map((r) => r.runId)).toEqual(["run-a"]);
      expect(beta.map((r) => r.runId)).toEqual(["run-b"]);
    });

    it("rejects a non-positive limit", async () => {
      await expect(
        harness.getData(DATA_KEYS.scoreHistory, { agentId: "agent-alpha", limit: 0 }),
      ).rejects.toThrow(/limit/);
      await expect(
        harness.getData(DATA_KEYS.scoreHistory, { agentId: "agent-alpha", limit: -5 }),
      ).rejects.toThrow(/limit/);
    });
  });
});
