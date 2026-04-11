import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMcpServers } from "@paperclipai/db";
import type {
  CompanyMcpServer,
  CreateMcpServer,
  EnvBinding,
  McpTransport,
  ResolvedMcpServer,
  UpdateMcpServer,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";

type McpBindingRecord = Record<string, EnvBinding>;

function castBindings(value: unknown): McpBindingRecord | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as McpBindingRecord;
}

function rowToModel(row: typeof companyMcpServers.$inferSelect): CompanyMcpServer {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    transport: row.transport as McpTransport,
    command: row.command,
    args: (row.args as string[] | null) ?? null,
    url: row.url,
    headers: castBindings(row.headers),
    env: castBindings(row.env),
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveBindingMap(
  svc: ReturnType<typeof secretService>,
  companyId: string,
  bindings: McpBindingRecord | null,
): Promise<Record<string, string> | undefined> {
  if (!bindings) return undefined;
  const out: Record<string, string> = {};
  for (const [key, binding] of Object.entries(bindings)) {
    if (typeof binding === "string") {
      out[key] = binding;
      continue;
    }
    if (binding.type === "plain") {
      out[key] = binding.value;
      continue;
    }
    out[key] = await svc.resolveSecretValue(
      companyId,
      binding.secretId,
      binding.version ?? "latest",
      binding.field ?? null,
    );
  }
  return out;
}

export function mcpServerService(db: Db) {
  const secrets = secretService(db);

  async function getById(id: string): Promise<CompanyMcpServer | null> {
    const row = await db
      .select()
      .from(companyMcpServers)
      .where(eq(companyMcpServers.id, id))
      .then((rows) => rows[0] ?? null);
    return row ? rowToModel(row) : null;
  }

  async function getByName(companyId: string, name: string): Promise<CompanyMcpServer | null> {
    const row = await db
      .select()
      .from(companyMcpServers)
      .where(and(eq(companyMcpServers.companyId, companyId), eq(companyMcpServers.name, name)))
      .then((rows) => rows[0] ?? null);
    return row ? rowToModel(row) : null;
  }

  async function list(companyId: string): Promise<CompanyMcpServer[]> {
    const rows = await db
      .select()
      .from(companyMcpServers)
      .where(eq(companyMcpServers.companyId, companyId))
      .orderBy(asc(companyMcpServers.name));
    return rows.map(rowToModel);
  }

  async function create(
    companyId: string,
    input: CreateMcpServer,
  ): Promise<CompanyMcpServer> {
    const existing = await getByName(companyId, input.name);
    if (existing) throw conflict(`MCP server already exists: ${input.name}`);

    const inserted = await db
      .insert(companyMcpServers)
      .values({
        companyId,
        name: input.name,
        description: input.description ?? null,
        transport: input.transport,
        command: input.command ?? null,
        args: input.args ?? null,
        url: input.url ?? null,
        headers: (input.headers ?? null) as Record<string, unknown> | null,
        env: (input.env ?? null) as Record<string, unknown> | null,
        enabled: input.enabled ?? true,
      })
      .returning()
      .then((rows) => rows[0]);
    if (!inserted) throw unprocessable("Failed to create MCP server");
    return rowToModel(inserted);
  }

  async function update(id: string, patch: UpdateMcpServer): Promise<CompanyMcpServer> {
    const current = await getById(id);
    if (!current) throw notFound("MCP server not found");

    if (patch.name && patch.name !== current.name) {
      const duplicate = await getByName(current.companyId, patch.name);
      if (duplicate && duplicate.id !== id) {
        throw conflict(`MCP server already exists: ${patch.name}`);
      }
    }

    const updated = await db
      .update(companyMcpServers)
      .set({
        name: patch.name ?? current.name,
        description: patch.description === undefined ? current.description : patch.description,
        transport: patch.transport ?? current.transport,
        command: patch.command === undefined ? current.command : patch.command,
        args: patch.args === undefined ? current.args : (patch.args ?? null),
        url: patch.url === undefined ? current.url : patch.url,
        headers:
          patch.headers === undefined
            ? (current.headers as Record<string, unknown> | null)
            : ((patch.headers ?? null) as Record<string, unknown> | null),
        env:
          patch.env === undefined
            ? (current.env as Record<string, unknown> | null)
            : ((patch.env ?? null) as Record<string, unknown> | null),
        enabled: patch.enabled === undefined ? current.enabled : patch.enabled,
        updatedAt: new Date(),
      })
      .where(eq(companyMcpServers.id, id))
      .returning()
      .then((rows) => rows[0]);
    if (!updated) throw notFound("MCP server not found");
    return rowToModel(updated);
  }

  async function remove(id: string): Promise<CompanyMcpServer | null> {
    const current = await getById(id);
    if (!current) return null;
    await db.delete(companyMcpServers).where(eq(companyMcpServers.id, id));
    return current;
  }

  /**
   * Resolve the given MCP server IDs for runtime injection into an
   * adapter. Filters by company + enabled flag, then hydrates every
   * binding via `secretService.resolveSecretValue`. The returned
   * objects contain plaintext credentials and must never be logged.
   */
  async function resolveForAgent(
    companyId: string,
    mcpServerIds: string[],
  ): Promise<ResolvedMcpServer[]> {
    if (mcpServerIds.length === 0) return [];

    const rows = await db
      .select()
      .from(companyMcpServers)
      .where(
        and(
          eq(companyMcpServers.companyId, companyId),
          eq(companyMcpServers.enabled, true),
          inArray(companyMcpServers.id, mcpServerIds),
        ),
      );

    const resolved: ResolvedMcpServer[] = [];
    for (const row of rows) {
      const model = rowToModel(row);
      const env = await resolveBindingMap(secrets, companyId, model.env);
      const headers = await resolveBindingMap(secrets, companyId, model.headers);

      const entry: ResolvedMcpServer = {
        id: model.id,
        name: model.name,
        transport: model.transport,
      };
      if (model.command) entry.command = model.command;
      if (model.args && model.args.length > 0) entry.args = model.args;
      if (model.url) entry.url = model.url;
      if (env && Object.keys(env).length > 0) entry.env = env;
      if (headers && Object.keys(headers).length > 0) entry.headers = headers;
      resolved.push(entry);
    }
    return resolved;
  }

  return {
    list,
    getById,
    getByName,
    create,
    update,
    remove,
    resolveForAgent,
  };
}
