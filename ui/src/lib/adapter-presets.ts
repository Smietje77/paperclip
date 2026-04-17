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
  apiKeyLabel?: string;
  credentialsPath?: string;
}

export const ADAPTER_AUTH: Record<string, AdapterAuthInfo> = {
  claude_local: {
    mode: "cli_login",
    loginCommand: "claude login",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    credentialsPath: "~/.claude/.credentials.json",
    description:
      "Standaard via Claude Code subscription (CLI-login). Optioneel: koppel een ANTHROPIC_API_KEY secret om in plaats daarvan API-credits te gebruiken.",
  },
  codex_local: {
    mode: "cli_login",
    loginCommand: "codex login",
    apiKeyEnvVar: "OPENAI_API_KEY",
    credentialsPath: "~/.codex/auth.json",
    description:
      "Standaard via ChatGPT-login (vereist ChatGPT Plus/Team/Enterprise voor gpt-5/Codex-modellen). Voor API-billing: run in terminal `echo \"sk-...\" | codex login --with-api-key` — dit vervangt de ChatGPT-token door een OpenAI API-key in `~/.codex/auth.json`. Koppel je secret hieronder alleen als paperclip de key ook via env moet kunnen doorgeven.",
  },
  gemini_local: {
    mode: "cli_login",
    loginCommand: "gemini auth login",
    apiKeyEnvVar: "GEMINI_API_KEY",
    credentialsPath: "~/.gemini/",
    description:
      "Standaard via Google-account (Gemini CLI subscription). Optioneel: koppel een GEMINI_API_KEY of GOOGLE_API_KEY secret voor pay-per-use API.",
  },
  opencode_local: {
    mode: "api_key",
    apiKeyEnvVar: "OPENAI_API_KEY",
    apiKeyLabel: "OpenAI API key",
    description:
      "OpenAI-compatible HTTP via OpenCode CLI. Vereist een OpenAI API-key secret. Voor OpenRouter of Kie.ai: gebruik de losse adapter-tegels.",
  },
  openrouter_local: {
    mode: "api_key",
    apiKeyEnvVar: "OPENAI_API_KEY",
    apiKeyLabel: "OpenRouter API key",
    description:
      "Multi-provider routing via OpenRouter (Anthropic, OpenAI, Google, Meta, Mistral, …). Vereist een OpenRouter API-key secret, gekoppeld aan OPENAI_API_KEY (OpenCode CLI leest deze).",
  },
  kie_local: {
    mode: "api_key",
    apiKeyEnvVar: "OPENAI_API_KEY",
    apiKeyLabel: "Kie.ai API key",
    description:
      "OpenAI-compatible gateway via Kie.ai. Vereist een Kie.ai API-key secret, gekoppeld aan OPENAI_API_KEY.",
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

/**
 * @deprecated OpenCode provider presets were removed in favour of standalone
 * `openrouter_local` and `kie_local` adapters. OpenCode is now OpenAI-only.
 */
export const OPENCODE_PRESETS: AdapterProviderPreset[] = [];

export const PRESETS_BY_ADAPTER: Record<string, AdapterProviderPreset[]> = {};

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
