import { describe, expect, it } from "vitest";
import {
  RUBRIC_SYSTEM_PROMPT,
  buildRubricPrompt,
  parseRubricResponse,
  rubricInputFromPayload,
} from "../src/rubric.js";

describe("buildRubricPrompt", () => {
  it("includes the fixed system prompt", () => {
    const prompt = buildRubricPrompt({
      runId: "r",
      agentId: "a",
      status: "success",
      durationMs: 1000,
      processLossRetryCount: 0,
      error: null,
      errorCode: null,
      flags: [],
    });
    expect(prompt.system).toBe(RUBRIC_SYSTEM_PROMPT);
  });

  it("includes status, duration, and flags in the user message", () => {
    const prompt = buildRubricPrompt({
      runId: "run-1",
      agentId: "agent-1",
      status: "failed",
      durationMs: 125_000,
      processLossRetryCount: 1,
      error: null,
      errorCode: null,
      flags: ["retried", "slow"],
    });
    expect(prompt.user).toContain("run-1");
    expect(prompt.user).toContain("agent-1");
    expect(prompt.user).toContain("failed");
    expect(prompt.user).toContain("2.1m");
    expect(prompt.user).toContain("retried, slow");
  });

  it("omits error fields when none are present", () => {
    const prompt = buildRubricPrompt({
      runId: "r",
      agentId: "a",
      status: "success",
      durationMs: 500,
      processLossRetryCount: 0,
      error: null,
      errorCode: null,
      flags: [],
    });
    expect(prompt.user).not.toContain("Error code");
  });

  it("includes error fields when the run failed", () => {
    const prompt = buildRubricPrompt({
      runId: "r",
      agentId: "a",
      status: "failed",
      durationMs: 500,
      processLossRetryCount: 0,
      error: "kaboom",
      errorCode: "adapter_failed",
      flags: [],
    });
    expect(prompt.user).toContain("adapter_failed");
    expect(prompt.user).toContain("kaboom");
  });

  it("truncates transcripts that exceed the maximum length", () => {
    const excerpt = "x".repeat(5_000);
    const prompt = buildRubricPrompt({
      runId: "r",
      agentId: "a",
      status: "success",
      durationMs: 500,
      processLossRetryCount: 0,
      error: null,
      errorCode: null,
      flags: [],
      transcriptExcerpt: excerpt,
    });
    expect(prompt.user).toContain("truncated");
    expect(prompt.user.length).toBeLessThan(5_500);
  });
});

describe("parseRubricResponse", () => {
  it("parses strict JSON responses", () => {
    const outcome = parseRubricResponse(
      '{"score": 85, "rationale": "solid outcome", "suggestions": ["reduce retries"]}',
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.score).toBe(85);
    expect(outcome.result.rationale).toBe("solid outcome");
    expect(outcome.result.suggestions).toEqual(["reduce retries"]);
  });

  it("extracts the JSON block when surrounded by prose", () => {
    const outcome = parseRubricResponse(
      'Here is my assessment:\n{"score": 42, "rationale": "needs work", "suggestions": []}\nThanks!',
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.score).toBe(42);
  });

  it("clamps out-of-range scores", () => {
    const low = parseRubricResponse('{"score": -10, "rationale": "", "suggestions": []}');
    const high = parseRubricResponse('{"score": 250, "rationale": "", "suggestions": []}');
    expect(low.ok && low.result.score).toBe(0);
    expect(high.ok && high.result.score).toBe(100);
  });

  it("rejects responses without a JSON object", () => {
    const outcome = parseRubricResponse("no JSON here at all");
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(/no JSON object/);
  });

  it("rejects malformed JSON", () => {
    const outcome = parseRubricResponse("{not valid json}");
    expect(outcome.ok).toBe(false);
  });

  it("rejects when score is missing or not a number", () => {
    const missing = parseRubricResponse('{"rationale": "hi", "suggestions": []}');
    const wrong = parseRubricResponse('{"score": "high", "rationale": "", "suggestions": []}');
    expect(missing.ok).toBe(false);
    expect(wrong.ok).toBe(false);
  });

  it("drops non-string suggestions and caps length", () => {
    const outcome = parseRubricResponse(
      '{"score": 50, "rationale": "x", "suggestions": ["a", 1, null, "b", "   ", "c"]}',
    );
    if (outcome.ok) expect(outcome.result.suggestions).toEqual(["a", "b", "c"]);
  });
});

describe("rubricInputFromPayload", () => {
  it("maps payload fields onto the rubric input shape", () => {
    const input = rubricInputFromPayload(
      {
        agentId: "agent-a",
        runId: "run-1",
        status: "failed",
        invocationSource: null,
        triggerDetail: null,
        error: "boom",
        errorCode: "adapter_failed",
        exitCode: 1,
        processLossRetryCount: 2,
        startedAt: null,
        finishedAt: null,
        durationMs: 5_000,
      },
      "partial transcript",
    );
    expect(input.runId).toBe("run-1");
    expect(input.agentId).toBe("agent-a");
    expect(input.status).toBe("failed");
    expect(input.processLossRetryCount).toBe(2);
    expect(input.transcriptExcerpt).toBe("partial transcript");
  });
});
