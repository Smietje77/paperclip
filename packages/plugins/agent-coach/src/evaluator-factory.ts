/**
 * Factory that materialises a `RubricEvaluator` from plugin configuration.
 *
 * The factory separates transport selection and secret resolution from the
 * scoring flow, so `handleRunEvent` can always await `evaluator.evaluate(...)`
 * without worrying about whether the feature is on or how to wire it.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  AnthropicRubricEvaluator,
  NullRubricEvaluator,
  type RubricEvaluator,
} from "./evaluator.js";

export interface CoachConfig {
  readonly evaluator?: "anthropic" | "none";
  readonly anthropicModel?: string;
  readonly anthropicKeyRef?: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

function coerceConfig(raw: unknown): CoachConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as CoachConfig;
}

/**
 * Resolve a `RubricEvaluator` for the current plugin context. Falls back to
 * {@link NullRubricEvaluator} whenever the evaluator is disabled, mis-
 * configured, or when secret resolution fails — the scoring flow should
 * continue to produce a heuristic score even when the LLM path is broken.
 */
export async function createRubricEvaluator(
  ctx: PluginContext,
  rawConfig?: unknown,
): Promise<RubricEvaluator> {
  const cfg =
    rawConfig === undefined ? coerceConfig(await ctx.config.get()) : coerceConfig(rawConfig);
  if (cfg.evaluator !== "anthropic") return new NullRubricEvaluator();

  const keyRef = cfg.anthropicKeyRef?.trim();
  if (!keyRef) {
    ctx.logger.warn("agent-coach: evaluator=anthropic but anthropicKeyRef is empty; disabling LLM evaluation");
    return new NullRubricEvaluator();
  }

  let apiKey: string | null = null;
  try {
    apiKey = await ctx.secrets.resolve(keyRef);
  } catch (error: unknown) {
    ctx.logger.warn("agent-coach: failed to resolve Anthropic API key; disabling LLM evaluation", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NullRubricEvaluator();
  }
  if (!apiKey) {
    ctx.logger.warn("agent-coach: Anthropic API key resolved to empty; disabling LLM evaluation");
    return new NullRubricEvaluator();
  }

  return new AnthropicRubricEvaluator({
    httpFetch: (url, init) => ctx.http.fetch(url, init),
    apiKey,
    model: cfg.anthropicModel?.trim() || DEFAULT_MODEL,
  });
}
