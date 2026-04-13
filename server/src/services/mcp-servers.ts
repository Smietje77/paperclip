import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMcpServers } from "@paperclipai/db";
import { spawn } from "node:child_process";
import type {
  CompanyMcpServer,
  CreateMcpServer,
  EnvBinding,
  McpCatalogEntry,
  McpHealthStatus,
  McpTransport,
  ResolvedMcpServer,
  UpdateMcpServer,
} from "@paperclipai/shared";
import { getCatalogEntry, getStarterPackEntries } from "@paperclipai/shared";
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
    catalogKey: row.catalogKey ?? null,
    healthStatus: (row.healthStatus as McpHealthStatus) ?? "untested",
    lastHealthCheckAt: row.lastHealthCheckAt ?? null,
    lastHealthError: row.lastHealthError ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const MCP_HANDSHAKE_TIMEOUT_MS = 8000;

async function performStdioHandshake(
  command: string,
  args: string[],
  env: Record<string, string> | undefined,
): Promise<void> {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(env ?? {}) },
    shell: process.platform === "win32",
  });

  try {
    await new Promise<void>((resolve, reject) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let done = false;

      const finish = (err: Error | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      const timer = setTimeout(() => {
        finish(new Error(`handshake timeout after ${MCP_HANDSHAKE_TIMEOUT_MS}ms`));
      }, MCP_HANDSHAKE_TIMEOUT_MS);

      child.on("error", (err) => finish(err));
      child.on("exit", (code) => {
        if (!done) {
          finish(new Error(`process exited (code=${code}) before handshake response; stderr: ${stderrBuf.slice(0, 400)}`));
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as { id?: unknown; result?: { protocolVersion?: unknown }; error?: { message?: string } };
            if (msg.id === 1 && msg.result && typeof msg.result.protocolVersion === "string") {
              finish(null);
              return;
            }
            if (msg.id === 1 && msg.error) {
              finish(new Error(`MCP error: ${msg.error.message ?? "unknown"}`));
              return;
            }
          } catch {
            // ignore non-JSON stdout (some servers log banners before JSON-RPC)
          }
        }
      });

      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "paperclip-healthcheck", version: "0.1.0" },
        },
      };
      child.stdin?.write(JSON.stringify(request) + "\n");
    });
  } finally {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
}

async function performHttpHandshake(
  url: string,
  headers: Record<string, string> | undefined,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_HANDSHAKE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(headers ?? {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "paperclip-healthcheck", version: "0.1.0" },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function buildPlaceholderEnv(keys: ReadonlyArray<{ key: string }> | undefined): Record<string, EnvBinding> | null {
  if (!keys || keys.length === 0) return null;
  const out: Record<string, EnvBinding> = {};
  for (const entry of keys) {
    out[entry.key] = { type: "plain", value: "" };
  }
  return out;
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
    options: { catalogKey?: string | null } = {},
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
        catalogKey: options.catalogKey ?? null,
      })
      .returning()
      .then((rows) => rows[0]);
    if (!inserted) throw unprocessable("Failed to create MCP server");
    return rowToModel(inserted);
  }

  async function getByCatalogKey(companyId: string, catalogKey: string): Promise<CompanyMcpServer | null> {
    const row = await db
      .select()
      .from(companyMcpServers)
      .where(and(eq(companyMcpServers.companyId, companyId), eq(companyMcpServers.catalogKey, catalogKey)))
      .then((rows) => rows[0] ?? null);
    return row ? rowToModel(row) : null;
  }

  function catalogEntryToCreateInput(entry: McpCatalogEntry): CreateMcpServer {
    return {
      name: entry.name,
      description: entry.description,
      transport: entry.transport,
      command: entry.command,
      args: entry.args,
      url: entry.url,
      env: buildPlaceholderEnv(entry.envKeys) ?? undefined,
      headers: buildPlaceholderEnv(entry.headerKeys) ?? undefined,
      enabled: false,
    };
  }

  async function installFromCatalog(companyId: string, catalogKey: string): Promise<CompanyMcpServer> {
    const entry = getCatalogEntry(catalogKey);
    if (!entry) throw notFound(`Unknown catalog entry: ${catalogKey}`);

    const existingByKey = await getByCatalogKey(companyId, catalogKey);
    if (existingByKey) throw conflict(`Catalog entry already installed: ${catalogKey}`);

    const existingByName = await getByName(companyId, entry.name);
    if (existingByName) throw conflict(`MCP server name already in use: ${entry.name}`);

    return create(companyId, catalogEntryToCreateInput(entry), { catalogKey: entry.key });
  }

  async function setHealth(
    id: string,
    status: McpHealthStatus,
    error: string | null,
  ): Promise<void> {
    await db
      .update(companyMcpServers)
      .set({
        healthStatus: status,
        lastHealthCheckAt: new Date(),
        lastHealthError: error,
      })
      .where(eq(companyMcpServers.id, id));
  }

  async function testConnection(id: string): Promise<{ status: McpHealthStatus; error: string | null }> {
    const current = await getById(id);
    if (!current) throw notFound("MCP server not found");

    // mark checking (best-effort, not awaited downstream)
    await db
      .update(companyMcpServers)
      .set({ healthStatus: "checking" })
      .where(eq(companyMcpServers.id, id));

    const env = await resolveBindingMap(secrets, current.companyId, current.env);
    const headers = await resolveBindingMap(secrets, current.companyId, current.headers);

    try {
      if (current.transport === "stdio") {
        if (!current.command) throw new Error("No command configured for stdio transport");
        await performStdioHandshake(current.command, current.args ?? [], env);
      } else {
        if (!current.url) throw new Error("No url configured for http/sse transport");
        await performHttpHandshake(current.url, headers);
      }
      await setHealth(id, "healthy", null);
      return { status: "healthy", error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setHealth(id, "unhealthy", message.slice(0, 2000));
      return { status: "unhealthy", error: message };
    }
  }

  async function listEnabled(): Promise<CompanyMcpServer[]> {
    const rows = await db
      .select()
      .from(companyMcpServers)
      .where(eq(companyMcpServers.enabled, true));
    return rows.map(rowToModel);
  }

  async function installStarterPack(companyId: string): Promise<{
    installed: CompanyMcpServer[];
    skipped: { catalogKey: string; reason: string }[];
  }> {
    const installed: CompanyMcpServer[] = [];
    const skipped: { catalogKey: string; reason: string }[] = [];

    for (const entry of getStarterPackEntries()) {
      const existingByKey = await getByCatalogKey(companyId, entry.key);
      if (existingByKey) {
        skipped.push({ catalogKey: entry.key, reason: "already_installed" });
        continue;
      }
      const existingByName = await getByName(companyId, entry.name);
      if (existingByName) {
        skipped.push({ catalogKey: entry.key, reason: "name_conflict" });
        continue;
      }
      const created = await create(companyId, catalogEntryToCreateInput(entry), { catalogKey: entry.key });
      installed.push(created);
    }
    return { installed, skipped };
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
    getByCatalogKey,
    create,
    update,
    remove,
    installFromCatalog,
    installStarterPack,
    testConnection,
    listEnabled,
    resolveForAgent,
  };
}
