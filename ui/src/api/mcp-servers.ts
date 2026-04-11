import type {
  CompanyMcpServer,
  CreateMcpServer,
  UpdateMcpServer,
} from "@paperclipai/shared";
import { api } from "./client";

export const mcpServersApi = {
  list: (companyId: string) =>
    api.get<CompanyMcpServer[]>(`/companies/${companyId}/mcp-servers`),
  create: (companyId: string, data: CreateMcpServer) =>
    api.post<CompanyMcpServer>(`/companies/${companyId}/mcp-servers`, data),
  update: (id: string, data: UpdateMcpServer) =>
    api.patch<CompanyMcpServer>(`/mcp-servers/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/mcp-servers/${id}`),
};
