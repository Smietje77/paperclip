import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Per-company MCP server definitions. Each row describes a single
 * Model Context Protocol server (stdio, http or sse transport) that
 * agents running inside the company can opt into. Credential bindings
 * inside `env` / `headers` follow the shared `EnvBinding` union so they
 * can reference records in `company_secrets` by id.
 */
export const companyMcpServers = pgTable(
  "company_mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    transport: text("transport").notNull(),
    command: text("command"),
    args: jsonb("args").$type<string[] | null>(),
    url: text("url"),
    headers: jsonb("headers").$type<Record<string, unknown> | null>(),
    env: jsonb("env").$type<Record<string, unknown> | null>(),
    // DEPRECATED: legacy admin flag; effective availability is now driven by `healthStatus`.
    // Kept for back-compat; always `true` for new rows. Remove in a future cleanup migration.
    enabled: boolean("enabled").notNull().default(true),
    catalogKey: text("catalog_key"),
    healthStatus: text("health_status").notNull().default("untested"),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastHealthError: text("last_health_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_mcp_servers_company_idx").on(table.companyId),
    companyNameUq: uniqueIndex("company_mcp_servers_company_name_uq").on(table.companyId, table.name),
  }),
);
