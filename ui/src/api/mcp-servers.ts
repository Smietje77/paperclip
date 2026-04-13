import type {
  CompanyMcpServer,
  CreateMcpServer,
  McpCatalogEntry,
  McpHealthStatus,
  UpdateMcpServer,
} from "@paperclipai/shared";
import { api } from "./client";

export interface InstallStarterPackResult {
  installed: CompanyMcpServer[];
  skipped: { catalogKey: string; reason: string }[];
}

export interface TestConnectionResult {
  status: McpHealthStatus;
  error: string | null;
}

export const mcpServersApi = {
  list: (companyId: string) =>
    api.get<CompanyMcpServer[]>(`/companies/${companyId}/mcp-servers`),
  create: (companyId: string, data: CreateMcpServer) =>
    api.post<CompanyMcpServer>(`/companies/${companyId}/mcp-servers`, data),
  update: (id: string, data: UpdateMcpServer) =>
    api.patch<CompanyMcpServer>(`/mcp-servers/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/mcp-servers/${id}`),
  listCatalog: () => api.get<McpCatalogEntry[]>(`/mcp-catalog`),
  installFromCatalog: (companyId: string, catalogKey: string) =>
    api.post<CompanyMcpServer>(
      `/companies/${companyId}/mcp-servers/install-from-catalog`,
      { catalogKey },
    ),
  installStarterPack: (companyId: string) =>
    api.post<InstallStarterPackResult>(
      `/companies/${companyId}/mcp-servers/install-starter-pack`,
      {},
    ),
  testConnection: (id: string) =>
    api.post<TestConnectionResult>(`/mcp-servers/${id}/test-connection`, {}),
};
