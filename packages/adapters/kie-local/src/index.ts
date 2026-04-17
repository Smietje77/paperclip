export const type = "kie_local";
export const label = "Kie.ai";

export const DEFAULT_KIE_LOCAL_MODEL = "openai/gpt-4o";

export const KIE_BASE_URL = "https://api.kie.ai/v1";

export const models: Array<{ id: string; label: string }> = [
  { id: DEFAULT_KIE_LOCAL_MODEL, label: "GPT-4o (OpenAI via Kie.ai)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (OpenAI via Kie.ai)" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (Anthropic via Kie.ai)" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (Anthropic via Kie.ai)" },
  { id: "google/gemini-pro-1.5", label: "Gemini 1.5 Pro (Google via Kie.ai)" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (via Kie.ai)" },
];

export const agentConfigurationDoc = `# kie_local agent configuration

Adapter: kie_local

Use when:
- You want to route model calls through Kie.ai's OpenAI-compatible gateway
- You have a Kie.ai API key and the OpenCode CLI installed locally

Don't use when:
- You only need a single provider directly (use that adapter)
- OpenCode CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback
- instructionsFilePath (string, optional): absolute path to a markdown instructions file
- model (string, required): Kie.ai model id in provider/model format
- dangerouslySkipPermissions (boolean, optional): headless runs; defaults true
- env (object, optional): extra KEY=VALUE bindings. Paperclip injects OPENAI_BASE_URL=${KIE_BASE_URL} automatically. Bind your Kie.ai API key to OPENAI_API_KEY.

Notes:
- This adapter wraps the OpenCode CLI and injects the Kie.ai base URL automatically.
- Bind your Kie.ai API key as the OPENAI_API_KEY env var.
`;
