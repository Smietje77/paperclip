import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  execute as openCodeExecute,
  testEnvironment as openCodeTestEnvironment,
  listOpenCodeSkills,
  syncOpenCodeSkills,
  sessionCodec as openCodeSessionCodec,
  listOpenCodeModels,
  parseOpenCodeJsonl,
} from "@paperclipai/adapter-opencode-local/server";
import { OPENROUTER_BASE_URL } from "../index.js";

/**
 * Ensure OPENAI_BASE_URL is pinned to OpenRouter regardless of what the
 * admin has set. Preserves any existing user env (like OPENAI_API_KEY
 * secret_ref binding).
 */
function withOpenRouterEnv(config: Record<string, unknown>): Record<string, unknown> {
  const envIn = (config?.env ?? {}) as Record<string, unknown>;
  const env: Record<string, unknown> = { ...envIn };
  env.OPENAI_BASE_URL = { type: "plain", value: OPENROUTER_BASE_URL };
  return { ...config, env };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  return openCodeExecute({ ...ctx, config: withOpenRouterEnv(ctx.config) });
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const result = await openCodeTestEnvironment({
    ...ctx,
    config: withOpenRouterEnv(ctx.config),
  });
  return { ...result, adapterType: "openrouter_local" };
}

export const sessionCodec = openCodeSessionCodec;
export const listSkills = listOpenCodeSkills;
export const syncSkills = syncOpenCodeSkills;
export const listModels = listOpenCodeModels;
export { parseOpenCodeJsonl };
