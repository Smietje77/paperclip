import type { UIAdapterModule } from "../types";
import { parseKieStdoutLine } from "@paperclipai/adapter-kie-local/ui";
import { buildKieLocalConfig } from "@paperclipai/adapter-kie-local/ui";
import { OpenCodeLocalConfigFields } from "../opencode-local/config-fields";

export const kieLocalUIAdapter: UIAdapterModule = {
  type: "kie_local",
  label: "Kie.ai",
  parseStdoutLine: parseKieStdoutLine,
  ConfigFields: OpenCodeLocalConfigFields,
  buildAdapterConfig: buildKieLocalConfig,
};
