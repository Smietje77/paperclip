import type { EnvBinding } from "./secrets.js";

export type McpTransport = "stdio" | "http" | "sse";

/**
 * Company-level MCP server definition. Credential-bearing values inside
 * `env` and `headers` use the shared `EnvBinding` union so they can be
 * stored inline or as references to records in the secrets vault.
 */
export interface CompanyMcpServer {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  url: string | null;
  headers: Record<string, EnvBinding> | null;
  env: Record<string, EnvBinding> | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A fully-hydrated MCP server config ready to be written to an adapter's
 * CLI-specific config file. `env` and `headers` contain plaintext values
 * (secret references have been resolved). This type must NEVER be logged.
 */
export interface ResolvedMcpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}
