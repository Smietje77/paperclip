export const type = "openrouter_local";
export const label = "OpenRouter";

export const DEFAULT_OPENROUTER_LOCAL_MODEL = "anthropic/claude-3.5-sonnet";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const models: Array<{ id: string; label: string }> = [
  { id: DEFAULT_OPENROUTER_LOCAL_MODEL, label: "Claude 3.5 Sonnet (Anthropic)" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (Anthropic)" },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (OpenAI)" },
  { id: "google/gemini-pro-1.5", label: "Gemini 1.5 Pro (Google)" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B (Meta)" },
  { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B (Meta)" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
  { id: "qwen/qwen-2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B" },
  { id: "mistralai/mistral-large", label: "Mistral Large" },
];

export const agentConfigurationDoc = `# openrouter_local agent configuration

Adapter: openrouter_local

Use when:
- You want to route model calls through OpenRouter for multi-provider model selection
- You want unified billing for Anthropic, OpenAI, Google, Meta, Mistral and other models
- You have an OpenRouter API key and the OpenCode CLI installed locally

Don't use when:
- You only need a single provider (use that provider's adapter directly)
- OpenCode CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback
- instructionsFilePath (string, optional): absolute path to a markdown instructions file
- model (string, required): OpenRouter model id in provider/model format (e.g. anthropic/claude-3.5-sonnet)
- variant (string, optional): provider-specific reasoning variant when supported
- dangerouslySkipPermissions (boolean, optional): headless runs without approval prompts; defaults true
- env (object, optional): extra KEY=VALUE bindings. Paperclip injects OPENAI_BASE_URL=${OPENROUTER_BASE_URL} automatically. Bind your OpenRouter API key to OPENAI_API_KEY.

Notes:
- This adapter wraps the OpenCode CLI and injects the OpenRouter base URL automatically.
- Bind your OpenRouter API key as the OPENAI_API_KEY env var (the CLI reads this).
- See https://openrouter.ai/models for the full model catalog.
`;
