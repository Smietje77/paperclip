import type { AgentAdapterType } from "../constants.js";

export interface AdapterUsage {
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  costCents: number;
  runs: number;
}

export type AdapterTestStatus = "ok" | "error";

export interface CompanyAdapterSetting {
  adapterType: AgentAdapterType;
  enabled: boolean;
  configured: boolean;
  defaultModel: string | null;
  defaultAdapterConfig: Record<string, unknown>;
  lastTestStatus: AdapterTestStatus | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  usage: AdapterUsage;
}

export interface InstanceAdapterUsage {
  adapterType: AgentAdapterType;
  usage: AdapterUsage;
  companyCount: number;
}
