import type { CompanyAdapterSetting, InstanceAdapterUsage } from "@paperclipai/shared";
import { api } from "./client";

export interface UpdateCompanyAdapterSettingInput {
  enabled?: boolean;
  defaultModel?: string | null;
  defaultAdapterConfig?: Record<string, unknown>;
}

export const companyAdapterSettingsApi = {
  list: (companyId: string) =>
    api.get<CompanyAdapterSetting[]>(`/companies/${companyId}/adapter-settings`),
  get: (companyId: string, type: string) =>
    api.get<CompanyAdapterSetting>(
      `/companies/${companyId}/adapter-settings/${encodeURIComponent(type)}`,
    ),
  update: (companyId: string, type: string, data: UpdateCompanyAdapterSettingInput) =>
    api.patch<CompanyAdapterSetting>(
      `/companies/${companyId}/adapter-settings/${encodeURIComponent(type)}`,
      data,
    ),
  test: (companyId: string, type: string) =>
    api.post<CompanyAdapterSetting>(
      `/companies/${companyId}/adapter-settings/${encodeURIComponent(type)}/test`,
      {},
    ),
  reset: (companyId: string, type: string) =>
    api.delete<CompanyAdapterSetting>(
      `/companies/${companyId}/adapter-settings/${encodeURIComponent(type)}`,
    ),
  instanceUsage: () => api.get<InstanceAdapterUsage[]>(`/instance/adapter-usage`),
};
