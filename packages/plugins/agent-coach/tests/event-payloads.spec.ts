import { describe, expect, it } from "vitest";
import { parseAgentRunEventPayload, toScoringStatus } from "../src/event-payloads.js";

describe("parseAgentRunEventPayload", () => {
  it("parses a well-formed payload", () => {
    const result = parseAgentRunEventPayload({
      agentId: "agent-1",
      runId: "run-1",
      status: "success",
      invocationSource: "wakeup",
      triggerDetail: "timer",
      error: null,
      errorCode: null,
      exitCode: 0,
      processLossRetryCount: 0,
      startedAt: "2026-04-15T10:00:00.000Z",
      finishedAt: "2026-04-15T10:01:00.000Z",
      durationMs: 60_000,
    });
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("agent-1");
    expect(result?.status).toBe("success");
    expect(result?.durationMs).toBe(60_000);
  });

  it("returns null for non-objects", () => {
    expect(parseAgentRunEventPayload(null)).toBeNull();
    expect(parseAgentRunEventPayload(undefined)).toBeNull();
    expect(parseAgentRunEventPayload("nope")).toBeNull();
    expect(parseAgentRunEventPayload(42)).toBeNull();
  });

  it("returns null when status is missing or empty", () => {
    expect(parseAgentRunEventPayload({ agentId: "a", runId: "r" })).toBeNull();
    expect(parseAgentRunEventPayload({ status: "" })).toBeNull();
  });

  it("defaults retry count to zero when absent", () => {
    const result = parseAgentRunEventPayload({ status: "failed" });
    expect(result?.processLossRetryCount).toBe(0);
  });

  it("coerces wrong-typed optional fields to null", () => {
    const result = parseAgentRunEventPayload({
      status: "failed",
      agentId: 123,
      exitCode: "bad",
      durationMs: "bad",
    });
    expect(result?.agentId).toBeNull();
    expect(result?.exitCode).toBeNull();
    expect(result?.durationMs).toBeNull();
  });
});

describe("toScoringStatus", () => {
  it("passes success through", () => {
    expect(toScoringStatus("success")).toBe("success");
  });

  it("passes cancelled through", () => {
    expect(toScoringStatus("cancelled")).toBe("cancelled");
  });

  it("maps failed and error to error", () => {
    expect(toScoringStatus("failed")).toBe("error");
    expect(toScoringStatus("error")).toBe("error");
  });

  it("falls back to error for unknown statuses", () => {
    expect(toScoringStatus("exploded")).toBe("error");
    expect(toScoringStatus("")).toBe("error");
  });
});
