import { describe, expect, it, beforeEach, vi } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { createRubricEvaluator } from "../src/evaluator-factory.js";
import {
  AnthropicRubricEvaluator,
  NullRubricEvaluator,
} from "../src/evaluator.js";

describe("createRubricEvaluator", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
  });

  it("returns NullRubricEvaluator when evaluator is unset", async () => {
    const evaluator = await createRubricEvaluator(harness.ctx, {});
    expect(evaluator).toBeInstanceOf(NullRubricEvaluator);
  });

  it("returns NullRubricEvaluator when evaluator is 'none'", async () => {
    const evaluator = await createRubricEvaluator(harness.ctx, { evaluator: "none" });
    expect(evaluator).toBeInstanceOf(NullRubricEvaluator);
  });

  it("falls back to Null when anthropicKeyRef is empty", async () => {
    const warn = vi.spyOn(harness.ctx.logger, "warn");
    const evaluator = await createRubricEvaluator(harness.ctx, {
      evaluator: "anthropic",
      anthropicKeyRef: "   ",
    });
    expect(evaluator).toBeInstanceOf(NullRubricEvaluator);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to Null when secret resolution throws", async () => {
    vi.spyOn(harness.ctx.secrets, "resolve").mockRejectedValueOnce(new Error("missing"));
    const warn = vi.spyOn(harness.ctx.logger, "warn");
    const evaluator = await createRubricEvaluator(harness.ctx, {
      evaluator: "anthropic",
      anthropicKeyRef: "ANTHROPIC_API_KEY",
    });
    expect(evaluator).toBeInstanceOf(NullRubricEvaluator);
    expect(warn).toHaveBeenCalled();
  });

  it("builds an AnthropicRubricEvaluator when config and secret resolve", async () => {
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValueOnce("sk-live");
    const evaluator = await createRubricEvaluator(harness.ctx, {
      evaluator: "anthropic",
      anthropicModel: "claude-haiku-4-5-20251001",
      anthropicKeyRef: "ANTHROPIC_API_KEY",
    });
    expect(evaluator).toBeInstanceOf(AnthropicRubricEvaluator);
  });
});
