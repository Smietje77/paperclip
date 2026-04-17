import type { UIAdapterModule } from "../types";
import { parseOpenRouterStdoutLine } from "@paperclipai/adapter-openrouter-local/ui";
import { buildOpenRouterLocalConfig } from "@paperclipai/adapter-openrouter-local/ui";
import { OpenCodeLocalConfigFields } from "../opencode-local/config-fields";

export const openRouterLocalUIAdapter: UIAdapterModule = {
  type: "openrouter_local",
  label: "OpenRouter",
  parseStdoutLine: parseOpenRouterStdoutLine,
  ConfigFields: OpenCodeLocalConfigFields,
  buildAdapterConfig: buildOpenRouterLocalConfig,
};
