/**
 * Provider presets for OpenAI-compatible adapters (currently opencode_local).
 * Each preset fills OPENAI_BASE_URL + a sensible default model so users can
 * pick "OpenRouter" or "Kie.ai" and only need to wire their API-key secret.
 */

/**
 * Auth model per adapter type. Drives whether the Adapters page shows a
 * secret-binding picker or a "log in via CLI" hint.
 */
export type AdapterAuthMode = "cli_login" | "api_key" | "none";

export interface AdapterAuthInfo {
  mode: AdapterAuthMode;
  loginCommand?: string;
  description: string;
  apiKeyEnvVar?: string;
}

export const ADAPTER_AUTH: Record<string, AdapterAuthInfo> = {
  claude_local: {
    mode: "cli_login",
    loginCommand: "claude login",
    description: "Logt in via je Claude Code (Anthropic) account. Geen secret nodig.",
  },
  codex_local: {
    mode: "cli_login",
    loginCommand: "codex login",
    description: "Logt in via je ChatGPT/OpenAI account (Codex CLI). Geen secret nodig.",
  },
  gemini_local: {
    mode: "cli_login",
    loginCommand: "gemini auth login",
    description: "Logt in via je Google-account (Gemini CLI). Geen secret nodig.",
  },
  cursor: {
    mode: "cli_login",
    description: "Auth via Cursor desktop app. Geen secret nodig.",
  },
  opencode_local: {
    mode: "api_key",
    apiKeyEnvVar: "OPENAI_API_KEY",
    description:
      "OpenAI-compatible HTTP. Vereist een API-key secret. Met preset koppel je OpenAI, OpenRouter of Kie.ai.",
  },
  hermes_local: {
    mode: "api_key",
    apiKeyEnvVar: "HERMES_API_KEY",
    description: "Hermes API. Vereist een API-key secret.",
  },
  openclaw_gateway: {
    mode: "api_key",
    apiKeyEnvVar: "OPENCLAW_GATEWAY_KEY",
    description: "OpenClaw Gateway. Vereist een gateway-key secret.",
  },
  pi_local: {
    mode: "api_key",
    apiKeyEnvVar: "PI_API_KEY",
    description: "Pi API. Vereist een API-key secret.",
  },
  process: {
    mode: "none",
    description: "Generieke process-runner. Configureer naar wens via env-bindings.",
  },
  http: {
    mode: "none",
    description: "Generieke HTTP-runner. Configureer endpoint en headers.",
  },
};

export function authForAdapter(adapterType: string): AdapterAuthInfo {
  return (
    ADAPTER_AUTH[adapterType] ?? {
      mode: "none",
      description: "Onbekend adapter-type.",
    }
  );
}

export function apiKeyEnvForAdapter(adapterType: string): string | null {
  return authForAdapter(adapterType).apiKeyEnvVar ?? null;
}

/**
 * Heuristic: auto-pick a secret if its name (or an alias) matches the env-var.
 * Used to suggest a default binding when nothing is set yet.
 */
export function suggestSecretForEnvVar(
  envVar: string,
  secrets: ReadonlyArray<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const target = envVar.toLowerCase();
  const exact = secrets.find((s) => s.name.toLowerCase() === target);
  if (exact) return exact;
  // Fuzzy: secret name contains the provider prefix (e.g. "openai" matches OPENAI_API_KEY)
  const prefix = envVar.split("_")[0]?.toLowerCase();
  if (!prefix) return null;
  return secrets.find((s) => s.name.toLowerCase().includes(prefix)) ?? null;
}

export interface AdapterProviderPreset {
  id: string;
  label: string;
  baseUrl: string | null;
  defaultModel: string;
  apiKeyEnvVar: string;
  docsUrl: string;
  hint: string;
  sampleModels: string[];
}

export const OPENCODE_PRESETS: AdapterProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI (default)",
    baseUrl: null,
    defaultModel: "openai/gpt-4o",
    apiKeyEnvVar: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/docs",
    hint: "Standaard OpenAI endpoint. Maak een secret OPENAI_API_KEY.",
    sampleModels: ["openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-4-turbo"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    apiKeyEnvVar: "OPENAI_API_KEY",
    docsUrl: "https://openrouter.ai/docs",
    hint:
      "OpenRouter routes naar Anthropic, Mistral, Llama enz. Maak een secret met je OpenRouter-key en bind die aan OPENAI_API_KEY.",
    sampleModels: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-pro-1.5",
      "meta-llama/llama-3.1-70b-instruct",
    ],
  },
  {
    id: "kie_ai",
    label: "Kie.ai",
    baseUrl: "https://api.kie.ai/v1",
    defaultModel: "openai/gpt-4o-mini",
    apiKeyEnvVar: "OPENAI_API_KEY",
    docsUrl: "https://kie.ai/docs",
    hint:
      "Kie.ai biedt OpenAI-compatible toegang tot meerdere modellen. Bind je Kie.ai key aan OPENAI_API_KEY.",
    sampleModels: ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
  },
];

export const PRESETS_BY_ADAPTER: Record<string, AdapterProviderPreset[]> = {
  opencode_local: OPENCODE_PRESETS,
};

export function presetsForAdapter(adapterType: string): AdapterProviderPreset[] {
  return PRESETS_BY_ADAPTER[adapterType] ?? [];
}

export function detectPresetFromConfig(
  adapterType: string,
  config: Record<string, unknown>,
): AdapterProviderPreset | null {
  const presets = presetsForAdapter(adapterType);
  if (presets.length === 0) return null;
  const env = (config?.env ?? {}) as Record<string, unknown>;
  const baseUrlBinding = env.OPENAI_BASE_URL as { value?: string } | undefined;
  const baseUrl = baseUrlBinding?.value ?? null;
  if (baseUrl === null) {
    return presets.find((p) => p.baseUrl === null) ?? null;
  }
  return presets.find((p) => p.baseUrl === baseUrl) ?? null;
}

export function buildPresetConfig(
  preset: AdapterProviderPreset,
  existingConfig: Record<string, unknown>,
): Record<string, unknown> {
  const existingEnv = (existingConfig?.env ?? {}) as Record<string, unknown>;
  const nextEnv: Record<string, unknown> = { ...existingEnv };
  if (preset.baseUrl) {
    nextEnv.OPENAI_BASE_URL = { type: "plain", value: preset.baseUrl };
  } else {
    delete nextEnv.OPENAI_BASE_URL;
  }
  return { ...existingConfig, env: nextEnv };
}
