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
import { KIE_BASE_URL } from "../index.js";

function withKieEnv(config: Record<string, unknown>): Record<string, unknown> {
  const envIn = (config?.env ?? {}) as Record<string, unknown>;
  const env: Record<string, unknown> = { ...envIn };
  env.OPENAI_BASE_URL = { type: "plain", value: KIE_BASE_URL };
  return { ...config, env };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  return openCodeExecute({ ...ctx, config: withKieEnv(ctx.config) });
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const result = await openCodeTestEnvironment({
    ...ctx,
    config: withKieEnv(ctx.config),
  });
  return { ...result, adapterType: "kie_local" };
}

export const sessionCodec = openCodeSessionCodec;
export const listSkills = listOpenCodeSkills;
export const syncSkills = syncOpenCodeSkills;
export const listModels = listOpenCodeModels;
export { parseOpenCodeJsonl };
