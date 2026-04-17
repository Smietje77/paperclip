import type { AgentAdapterType } from "./constants.js";

/**
 * Maps a cost-event provider id to the adapter types that route through it.
 * Used to attribute usage from the cost_events table back to per-adapter cards.
 */
export const PROVIDER_TO_ADAPTER_TYPES: Record<string, AgentAdapterType[]> = {
  anthropic: ["claude_local"],
  openai: ["codex_local", "opencode_local"],
  google: ["gemini_local"],
  gemini: ["gemini_local"],
  openclaw: ["openclaw_gateway"],
  hermes: ["hermes_local"],
  pi: ["pi_local"],
  openrouter: ["openrouter_local"],
  kie: ["kie_local"],
  "kie.ai": ["kie_local"],
};

export function providerToAdapterTypes(providerId: string | null | undefined): AgentAdapterType[] {
  if (!providerId) return [];
  return PROVIDER_TO_ADAPTER_TYPES[providerId.toLowerCase()] ?? [];
}
