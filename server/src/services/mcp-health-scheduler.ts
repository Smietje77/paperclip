import type { Db } from "@paperclipai/db";
import type { Logger } from "pino";
import { mcpServerService } from "./mcp-servers.js";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const CONCURRENCY = 5;

export interface McpHealthScheduler {
  start(): void;
  stop(): void;
  runOnce(): Promise<void>;
}

/**
 * Periodically runs health-checks against every `enabled` MCP server so the
 * UI status dot reflects real connectivity without the user having to click
 * "Test connection" manually. Disabled via `PAPERCLIP_DISABLE_MCP_HEALTH_SCHEDULER=1`.
 */
export function createMcpHealthScheduler(
  db: Db,
  logger: Logger,
  opts: { intervalMs?: number } = {},
): McpHealthScheduler {
  const svc = mcpServerService(db);
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let handle: NodeJS.Timeout | null = null;
  let running = false;

  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const servers = await svc.listEnabled();
      if (servers.length === 0) return;

      // Simple worker-pool with CONCURRENCY slots.
      const queue = [...servers];
      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i += 1) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              const next = queue.shift();
              if (!next) return;
              try {
                await svc.testConnection(next.id);
              } catch (err) {
                logger.warn({ err, mcpServerId: next.id }, "MCP health check failed");
              }
            }
          })(),
        );
      }
      await Promise.all(workers);
    } catch (err) {
      logger.error({ err }, "MCP health scheduler tick failed");
    } finally {
      running = false;
    }
  }

  function start(): void {
    if (process.env.PAPERCLIP_DISABLE_MCP_HEALTH_SCHEDULER === "1") {
      logger.info("MCP health scheduler disabled via env");
      return;
    }
    if (handle) return;
    // First tick after 30s so server startup stays fast.
    handle = setTimeout(async function tick() {
      await runOnce();
      handle = setTimeout(tick, intervalMs);
    }, 30_000);
  }

  function stop(): void {
    if (handle) {
      clearTimeout(handle);
      handle = null;
    }
  }

  return { start, stop, runOnce };
}
