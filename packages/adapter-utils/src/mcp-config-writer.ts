import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolved MCP server config ready to be written to an adapter's CLI
 * config file. Mirrors `ResolvedMcpServer` from `@paperclipai/shared`,
 * duplicated here to keep `adapter-utils` free of a shared dependency.
 */
export interface McpServerInput {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

/**
 * Extract the resolved MCP server list from an `AdapterExecutionContext.context`
 * map. Returns an empty array when the key is missing or malformed so adapters
 * can always call this unconditionally.
 */
export function readMcpServersFromContext(context: Record<string, unknown>): McpServerInput[] {
  const raw = context.paperclipMcpServers;
  if (!Array.isArray(raw)) return [];
  const out: McpServerInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const transport =
      obj.transport === "stdio" || obj.transport === "http" || obj.transport === "sse"
        ? obj.transport
        : null;
    if (!name || !transport) continue;
    const server: McpServerInput = {
      id: typeof obj.id === "string" ? obj.id : name,
      name,
      transport,
    };
    if (typeof obj.command === "string") server.command = obj.command;
    if (Array.isArray(obj.args)) {
      server.args = obj.args.filter((v): v is string => typeof v === "string");
    }
    if (typeof obj.url === "string") server.url = obj.url;
    if (obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)) {
      server.headers = Object.fromEntries(
        Object.entries(obj.headers as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
    }
    if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
      server.env = Object.fromEntries(
        Object.entries(obj.env as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
    }
    out.push(server);
  }
  return out;
}

function buildClaudeMcpConfig(servers: McpServerInput[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const server of servers) {
    if (server.transport === "stdio") {
      if (!server.command) continue;
      const entry: Record<string, unknown> = {
        type: "stdio",
        command: server.command,
      };
      if (server.args && server.args.length > 0) entry.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) entry.env = server.env;
      mcpServers[server.name] = entry;
    } else {
      if (!server.url) continue;
      const entry: Record<string, unknown> = {
        type: server.transport,
        url: server.url,
      };
      if (server.headers && Object.keys(server.headers).length > 0) entry.headers = server.headers;
      mcpServers[server.name] = entry;
    }
  }
  return { mcpServers };
}

function buildGeminiMcpConfig(servers: McpServerInput[]): Record<string, unknown> {
  // Gemini CLI uses the same high-level `mcpServers` shape as Claude Code.
  return buildClaudeMcpConfig(servers);
}

function buildCodexMcpConfigToml(servers: McpServerInput[]): string {
  const lines: string[] = [];
  for (const server of servers) {
    if (server.transport !== "stdio" || !server.command) continue;
    lines.push(`[mcp_servers.${server.name}]`);
    lines.push(`command = ${JSON.stringify(server.command)}`);
    if (server.args && server.args.length > 0) {
      const args = server.args.map((a) => JSON.stringify(a)).join(", ");
      lines.push(`args = [${args}]`);
    }
    if (server.env && Object.keys(server.env).length > 0) {
      const envBody = Object.entries(server.env)
        .map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`)
        .join(", ");
      lines.push(`env = { ${envBody} }`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Write `.mcp.json` into `workDir` in Claude Code's expected format. Returns
 * the absolute file path (or null when no writable servers are provided).
 */
export async function writeClaudeMcpJson(
  servers: McpServerInput[],
  workDir: string,
): Promise<string | null> {
  if (servers.length === 0) return null;
  const config = buildClaudeMcpConfig(servers);
  if (Object.keys((config as { mcpServers: Record<string, unknown> }).mcpServers).length === 0) {
    return null;
  }
  await fs.mkdir(workDir, { recursive: true });
  const target = path.join(workDir, ".mcp.json");
  await fs.writeFile(target, JSON.stringify(config, null, 2), "utf8");
  return target;
}

/**
 * Write a Gemini CLI mcp config (`.gemini/settings.json` style) into `workDir`.
 */
export async function writeGeminiMcpJson(
  servers: McpServerInput[],
  workDir: string,
): Promise<string | null> {
  if (servers.length === 0) return null;
  const config = buildGeminiMcpConfig(servers);
  if (Object.keys((config as { mcpServers: Record<string, unknown> }).mcpServers).length === 0) {
    return null;
  }
  const dir = path.join(workDir, ".gemini");
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, "settings.json");
  await fs.writeFile(target, JSON.stringify(config, null, 2), "utf8");
  return target;
}

/**
 * Write a Codex CLI MCP config fragment as TOML into `workDir/.codex/config.toml`.
 * Codex expects the config under `$CODEX_HOME/config.toml`; callers can point
 * `CODEX_HOME` at this directory before spawning the CLI.
 */
export async function writeCodexMcpConfigToml(
  servers: McpServerInput[],
  workDir: string,
): Promise<string | null> {
  if (servers.length === 0) return null;
  const body = buildCodexMcpConfigToml(servers);
  if (body.trim().length === 0) return null;
  const dir = path.join(workDir, ".codex");
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, "config.toml");
  await fs.writeFile(target, body, "utf8");
  return target;
}

const PAPERCLIP_MANAGED_BEGIN = "# >>> paperclip-managed mcp_servers >>>";
const PAPERCLIP_MANAGED_END = "# <<< paperclip-managed mcp_servers <<<";

/**
 * Merge paperclip-managed MCP server entries into an existing Codex
 * `config.toml` file. Previous managed sections (delimited by sentinels)
 * are stripped first; unrelated content is preserved verbatim. If the
 * file does not exist it is created. Returns the absolute file path.
 */
export async function mergeCodexMcpServersIntoConfig(
  servers: McpServerInput[],
  configPath: string,
): Promise<string | null> {
  const existing = await fs.readFile(configPath, "utf8").catch(() => "");
  const stripped = stripManagedBlock(existing);

  if (servers.length === 0) {
    if (existing === stripped) return null;
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, stripped, "utf8");
    return configPath;
  }

  const body = buildCodexMcpConfigToml(servers);
  if (body.trim().length === 0) {
    if (existing === stripped) return null;
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, stripped, "utf8");
    return configPath;
  }

  const prefix = stripped.length > 0 && !stripped.endsWith("\n") ? `${stripped}\n` : stripped;
  const merged = `${prefix}${PAPERCLIP_MANAGED_BEGIN}\n${body.trimEnd()}\n${PAPERCLIP_MANAGED_END}\n`;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, merged, "utf8");
  return configPath;
}

function stripManagedBlock(contents: string): string {
  if (!contents.includes(PAPERCLIP_MANAGED_BEGIN)) return contents;
  const lines = contents.split(/\r?\n/);
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!inside && line.trim() === PAPERCLIP_MANAGED_BEGIN) {
      inside = true;
      continue;
    }
    if (inside && line.trim() === PAPERCLIP_MANAGED_END) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.length > 0 ? `${out.join("\n")}\n` : "";
}

/**
 * Merge paperclip-managed MCP servers into a Gemini CLI `settings.json`
 * file. Preserves all existing keys; only rewrites the `mcpServers` entry
 * with the provided list. Returns the absolute file path (or null when no
 * change was required).
 */
export async function mergeGeminiMcpServersIntoSettings(
  servers: McpServerInput[],
  settingsPath: string,
): Promise<string | null> {
  const existingRaw = await fs.readFile(settingsPath, "utf8").catch(() => "");
  let existing: Record<string, unknown> = {};
  if (existingRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt or non-JSON settings — leave untouched.
      return null;
    }
  }

  const next = { ...existing };
  if (servers.length === 0) {
    if (!("mcpServers" in next)) return null;
    delete next.mcpServers;
  } else {
    const config = buildGeminiMcpConfig(servers) as { mcpServers: Record<string, unknown> };
    if (Object.keys(config.mcpServers).length === 0) return null;
    next.mcpServers = config.mcpServers;
  }

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return settingsPath;
}
