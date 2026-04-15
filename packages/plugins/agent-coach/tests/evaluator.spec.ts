import { describe, expect, it, vi } from "vitest";
import {
  AnthropicRubricEvaluator,
  NullRubricEvaluator,
  type FetchLike,
} from "../src/evaluator.js";
import type { RubricInput } from "../src/rubric.js";

const sampleInput: RubricInput = {
  runId: "run-1",
  agentId: "agent-1",
  status: "success",
  durationMs: 2000,
  processLossRetryCount: 0,
  error: null,
  errorCode: null,
  flags: [],
};

function makeResponse(init: { status?: number; body?: unknown; throwOnJson?: boolean }): Response {
  const status = init.status ?? 200;
  const body = init.body ?? { content: [{ type: "text", text: "{}" }] };
  const jsonImpl = init.throwOnJson
    ? () => Promise.reject(new Error("bad json"))
    : () => Promise.resolve(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return jsonImpl();
    },
    async text() {
      return JSON.stringify(body);
    },
  } as unknown as Response;
}

describe("NullRubricEvaluator", () => {
  it("always returns a disabled outcome", async () => {
    const result = await new NullRubricEvaluator().evaluate(sampleInput);
    expect(result).toEqual({ ok: false, reason: "evaluator disabled" });
  });
});

describe("AnthropicRubricEvaluator", () => {
  it("returns a parsed rubric result on success", async () => {
    const fetchStub = vi.fn<FetchLike>(async () =>
      makeResponse({
        body: {
          content: [
            {
              type: "text",
              text: '{"score": 90, "rationale": "clean run", "suggestions": ["keep it up"]}',
            },
          ],
        },
      }),
    );

    const evaluator = new AnthropicRubricEvaluator({
      httpFetch: fetchStub,
      apiKey: "sk-test",
      model: "claude-haiku-4-5-20251001",
    });

    const outcome = await evaluator.evaluate(sampleInput);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.score).toBe(90);
      expect(outcome.result.suggestions).toEqual(["keep it up"]);
    }
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0]!;
    expect(url).toContain("anthropic.com");
    expect(init?.headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": expect.any(String),
    });
  });

  it("returns an error reason on non-2xx responses", async () => {
    const fetchStub = vi.fn<FetchLike>(async () => makeResponse({ status: 429 }));
    const evaluator = new AnthropicRubricEvaluator({
      httpFetch: fetchStub,
      apiKey: "x",
      model: "claude-haiku-4-5-20251001",
    });
    const outcome = await evaluator.evaluate(sampleInput);
    expect(outcome).toEqual({ ok: false, reason: "http 429" });
  });

  it("captures fetch throws as typed failures", async () => {
    const fetchStub = vi.fn<FetchLike>(async () => {
      throw new Error("network down");
    });
    const evaluator = new AnthropicRubricEvaluator({
      httpFetch: fetchStub,
      apiKey: "x",
      model: "claude-haiku-4-5-20251001",
    });
    const outcome = await evaluator.evaluate(sampleInput);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toMatch(/network down/);
  });

  it("rejects responses that contain no text blocks", async () => {
    const fetchStub = vi.fn<FetchLike>(async () =>
      makeResponse({ body: { content: [{ type: "image" }] } }),
    );
    const evaluator = new AnthropicRubricEvaluator({
      httpFetch: fetchStub,
      apiKey: "x",
      model: "claude-haiku-4-5-20251001",
    });
    const outcome = await evaluator.evaluate(sampleInput);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toMatch(/no text/);
  });

  it("surfaces rubric-parse errors from the model response", async () => {
    const fetchStub = vi.fn<FetchLike>(async () =>
      makeResponse({
        body: { content: [{ type: "text", text: "not JSON at all" }] },
      }),
    );
    const evaluator = new AnthropicRubricEvaluator({
      httpFetch: fetchStub,
      apiKey: "x",
      model: "claude-haiku-4-5-20251001",
    });
    const outcome = await evaluator.evaluate(sampleInput);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toMatch(/rubric parse/);
  });
});
