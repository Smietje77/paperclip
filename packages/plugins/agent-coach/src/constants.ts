export const PLUGIN_ID = "paperclip.agent-coach";
export const PLUGIN_VERSION = "0.1.0";

export const STATE_KEYS = {
  latestScore: "latest-score",
  rolling7d: "rolling-7d",
  rolling30d: "rolling-30d",
  coachConfig: "coach-config",
} as const;

export const JOB_KEYS = {
  aggregateMetrics: "aggregate-metrics",
  proposeImprovements: "propose-improvements",
} as const;

export const UI_SLOT_IDS = {
  page: "agent-coach-page",
} as const;

export const UI_EXPORT_NAMES = {
  page: "AgentCoachPage",
} as const;

export const UI_ROUTES = {
  page: "agent-coach",
} as const;
