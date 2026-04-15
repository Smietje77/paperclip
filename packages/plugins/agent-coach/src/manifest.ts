import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  JOB_KEYS,
  PLUGIN_ID,
  PLUGIN_VERSION,
  UI_EXPORT_NAMES,
  UI_ROUTES,
  UI_SLOT_IDS,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Agent Coach",
  description:
    "Observes agent runs, scores outcomes, and proposes or applies config improvements. Every automatic change is recorded as a config revision and activity log entry.",
  author: "Paperclip",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "agents.read",
    "jobs.schedule",
    "ui.page.register",
    "http.outbound",
    "secrets.read-ref",
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      evaluator: {
        type: "string",
        enum: ["none", "anthropic"],
        default: "none",
        title: "LLM evaluator",
      },
      anthropicModel: {
        type: "string",
        default: "claude-haiku-4-5-20251001",
        title: "Anthropic model ID",
      },
      anthropicKeyRef: {
        type: "string",
        title: "Anthropic API key (secret reference)",
      },
    },
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: UI_SLOT_IDS.page,
        displayName: "Agent Coach",
        exportName: UI_EXPORT_NAMES.page,
        routePath: UI_ROUTES.page,
      },
    ],
  },
  jobs: [
    {
      jobKey: JOB_KEYS.aggregateMetrics,
      displayName: "Aggregate agent metrics",
      description: "Rolls up per-run scores into 7d/30d windows per agent.",
      schedule: "0 3 * * *",
    },
    {
      jobKey: JOB_KEYS.proposeImprovements,
      displayName: "Propose agent improvements",
      description: "Analyses rolling metrics and produces config improvement suggestions.",
      schedule: "0 4 * * 1",
    },
  ],
};

export default manifest;
