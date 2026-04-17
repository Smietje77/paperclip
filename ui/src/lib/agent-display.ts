import type { Agent, CostByAgent } from "@paperclipai/shared";

export const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "OpenAI",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  openrouter_local: "OpenRouter",
  kie_local: "Kie.ai",
  hermes_local: "Hermes",
  openclaw_gateway: "OpenClaw Gateway",
  pi_local: "Pi",
  process: "Process",
  http: "HTTP",
};

export const adapterOptions: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  adapterLabels,
).map(([value, label]) => ({ value, label }));

export function adapterLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return adapterLabels[type] ?? type;
}

export function formatModel(adapterConfig: Agent["adapterConfig"] | null | undefined): string {
  if (!adapterConfig || typeof adapterConfig !== "object") return "—";
  const model = (adapterConfig as Record<string, unknown>).model;
  if (typeof model !== "string" || model.trim() === "") return "—";
  return model;
}

export function getAgentSpendCents(
  agentId: string,
  costs: ReadonlyArray<CostByAgent> | undefined,
): number {
  if (!costs) return 0;
  const row = costs.find((c) => c.agentId === agentId);
  return row?.costCents ?? 0;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
