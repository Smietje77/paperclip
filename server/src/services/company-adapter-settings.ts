import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, companyAdapterSettings, costEvents } from "@paperclipai/db";
import {
  AGENT_ADAPTER_TYPES,
  PROVIDER_TO_ADAPTER_TYPES,
  type AgentAdapterType,
  type AdapterUsage,
  type CompanyAdapterSetting,
  type InstanceAdapterUsage,
} from "@paperclipai/shared";
import { findServerAdapter } from "../adapters/index.js";
import { secretService } from "./secrets.js";
import { notFound } from "../errors.js";
import { registerCompanyScaffoldStep } from "./company-scaffold.js";

const EMPTY_USAGE: AdapterUsage = {
  tokensIn: 0,
  tokensOut: 0,
  cachedTokensIn: 0,
  costCents: 0,
  runs: 0,
};

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function isAdapterAdapterType(value: string): value is AgentAdapterType {
  return (AGENT_ADAPTER_TYPES as readonly string[]).includes(value);
}

interface DbRow {
  adapterType: string;
  enabled: boolean;
  configured: boolean;
  defaultModel: string | null;
  defaultAdapterConfig: Record<string, unknown>;
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastTestedAt: Date | null;
}

function rowToSetting(row: DbRow, usage: AdapterUsage): CompanyAdapterSetting {
  return {
    adapterType: row.adapterType as AgentAdapterType,
    enabled: row.enabled,
    configured: row.configured,
    defaultModel: row.defaultModel,
    defaultAdapterConfig: row.defaultAdapterConfig ?? {},
    lastTestStatus:
      row.lastTestStatus === "ok" || row.lastTestStatus === "error"
        ? row.lastTestStatus
        : null,
    lastTestError: row.lastTestError,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    usage,
  };
}

function emptyRow(adapterType: AgentAdapterType): DbRow {
  return {
    adapterType,
    enabled: true,
    configured: false,
    defaultModel: null,
    defaultAdapterConfig: {},
    lastTestStatus: null,
    lastTestError: null,
    lastTestedAt: null,
  };
}

export function companyAdapterSettingsService(db: Db) {
  const secrets = secretService(db);

  async function seedForCompany(targetDb: Db, companyId: string): Promise<void> {
    const values = AGENT_ADAPTER_TYPES.map((adapterType) => ({
      companyId,
      adapterType,
    }));
    if (values.length === 0) return;
    await targetDb
      .insert(companyAdapterSettings)
      .values(values)
      .onConflictDoNothing({
        target: [companyAdapterSettings.companyId, companyAdapterSettings.adapterType],
      });
  }

  async function aggregateUsageByAdapter(companyId: string): Promise<Map<AgentAdapterType, AdapterUsage>> {
    const since = startOfMonthIso();
    const rows = await db
      .select({
        provider: costEvents.provider,
        inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)`,
        cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)`,
        costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
        runs: sql<number>`count(distinct ${costEvents.heartbeatRunId})`,
      })
      .from(costEvents)
      .where(and(eq(costEvents.companyId, companyId), sql`${costEvents.occurredAt} >= ${since}`))
      .groupBy(costEvents.provider);

    const map = new Map<AgentAdapterType, AdapterUsage>();
    for (const row of rows) {
      const adapterTypes = PROVIDER_TO_ADAPTER_TYPES[row.provider?.toLowerCase() ?? ""] ?? [];
      for (const adapterType of adapterTypes) {
        const existing = map.get(adapterType) ?? { ...EMPTY_USAGE };
        existing.tokensIn += Number(row.inputTokens) || 0;
        existing.cachedTokensIn += Number(row.cachedInputTokens) || 0;
        existing.tokensOut += Number(row.outputTokens) || 0;
        existing.costCents += Number(row.costCents) || 0;
        existing.runs += Number(row.runs) || 0;
        map.set(adapterType, existing);
      }
    }
    return map;
  }

  async function aggregateInstanceUsage(): Promise<Map<AgentAdapterType, AdapterUsage>> {
    const since = startOfMonthIso();
    const rows = await db
      .select({
        provider: costEvents.provider,
        inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)`,
        cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)`,
        costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
        runs: sql<number>`count(distinct ${costEvents.heartbeatRunId})`,
      })
      .from(costEvents)
      .where(sql`${costEvents.occurredAt} >= ${since}`)
      .groupBy(costEvents.provider);

    const map = new Map<AgentAdapterType, AdapterUsage>();
    for (const row of rows) {
      const adapterTypes = PROVIDER_TO_ADAPTER_TYPES[row.provider?.toLowerCase() ?? ""] ?? [];
      for (const adapterType of adapterTypes) {
        const existing = map.get(adapterType) ?? { ...EMPTY_USAGE };
        existing.tokensIn += Number(row.inputTokens) || 0;
        existing.cachedTokensIn += Number(row.cachedInputTokens) || 0;
        existing.tokensOut += Number(row.outputTokens) || 0;
        existing.costCents += Number(row.costCents) || 0;
        existing.runs += Number(row.runs) || 0;
        map.set(adapterType, existing);
      }
    }
    return map;
  }

  async function fetchRows(companyId: string): Promise<Map<string, DbRow>> {
    const rows = await db
      .select({
        adapterType: companyAdapterSettings.adapterType,
        enabled: companyAdapterSettings.enabled,
        configured: companyAdapterSettings.configured,
        defaultModel: companyAdapterSettings.defaultModel,
        defaultAdapterConfig: companyAdapterSettings.defaultAdapterConfig,
        lastTestStatus: companyAdapterSettings.lastTestStatus,
        lastTestError: companyAdapterSettings.lastTestError,
        lastTestedAt: companyAdapterSettings.lastTestedAt,
      })
      .from(companyAdapterSettings)
      .where(eq(companyAdapterSettings.companyId, companyId));
    return new Map(rows.map((r) => [r.adapterType, r]));
  }

  async function list(companyId: string): Promise<CompanyAdapterSetting[]> {
    const [rowMap, usageMap] = await Promise.all([
      fetchRows(companyId),
      aggregateUsageByAdapter(companyId),
    ]);
    return AGENT_ADAPTER_TYPES.map((adapterType) => {
      const row = rowMap.get(adapterType) ?? emptyRow(adapterType);
      const usage = usageMap.get(adapterType) ?? { ...EMPTY_USAGE };
      return rowToSetting(row, usage);
    });
  }

  async function get(companyId: string, adapterType: string): Promise<CompanyAdapterSetting> {
    if (!isAdapterAdapterType(adapterType)) {
      throw notFound(`Unknown adapter type: ${adapterType}`);
    }
    const settings = await list(companyId);
    const found = settings.find((s) => s.adapterType === adapterType);
    if (!found) throw notFound("Adapter setting not found");
    return found;
  }

  function deriveConfigured(input: {
    lastTestStatus: string | null;
    defaultAdapterConfig: Record<string, unknown>;
  }): boolean {
    return input.lastTestStatus === "ok";
  }

  async function ensureRow(companyId: string, adapterType: AgentAdapterType): Promise<void> {
    await db
      .insert(companyAdapterSettings)
      .values({ companyId, adapterType })
      .onConflictDoNothing({
        target: [companyAdapterSettings.companyId, companyAdapterSettings.adapterType],
      });
  }

  async function upsert(
    companyId: string,
    adapterType: string,
    patch: {
      enabled?: boolean;
      defaultModel?: string | null;
      defaultAdapterConfig?: Record<string, unknown>;
    },
  ): Promise<CompanyAdapterSetting> {
    if (!isAdapterAdapterType(adapterType)) {
      throw notFound(`Unknown adapter type: ${adapterType}`);
    }
    await ensureRow(companyId, adapterType);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.enabled !== undefined) updates.enabled = patch.enabled;
    if (patch.defaultModel !== undefined) updates.defaultModel = patch.defaultModel;
    if (patch.defaultAdapterConfig !== undefined) {
      const normalized = await secrets.normalizeAdapterConfigForPersistence(
        companyId,
        patch.defaultAdapterConfig,
      );
      updates.defaultAdapterConfig = normalized;
    }

    await db
      .update(companyAdapterSettings)
      .set(updates)
      .where(
        and(
          eq(companyAdapterSettings.companyId, companyId),
          eq(companyAdapterSettings.adapterType, adapterType),
        ),
      );

    return get(companyId, adapterType);
  }

  async function test(companyId: string, adapterType: string): Promise<CompanyAdapterSetting> {
    if (!isAdapterAdapterType(adapterType)) {
      throw notFound(`Unknown adapter type: ${adapterType}`);
    }
    await ensureRow(companyId, adapterType);
    const current = await get(companyId, adapterType);

    const adapter = findServerAdapter(adapterType);
    if (!adapter) {
      throw notFound(`No server adapter for type: ${adapterType}`);
    }

    let lastTestStatus: "ok" | "error" = "error";
    let lastTestError: string | null = null;
    try {
      const { config: runtimeAdapterConfig } = await secrets.resolveAdapterConfigForRuntime(
        companyId,
        current.defaultAdapterConfig,
      );
      const result = await adapter.testEnvironment({
        companyId,
        adapterType,
        config: runtimeAdapterConfig,
      });
      const ok = (result as { ok?: boolean })?.ok;
      if (ok === false) {
        lastTestStatus = "error";
        lastTestError = (result as { error?: string })?.error ?? "Test failed";
      } else {
        lastTestStatus = "ok";
        lastTestError = null;
      }
    } catch (error) {
      lastTestStatus = "error";
      lastTestError = error instanceof Error ? error.message : String(error);
    }

    const configured = deriveConfigured({
      lastTestStatus,
      defaultAdapterConfig: current.defaultAdapterConfig,
    });

    await db
      .update(companyAdapterSettings)
      .set({
        lastTestStatus,
        lastTestError,
        lastTestedAt: new Date(),
        configured,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companyAdapterSettings.companyId, companyId),
          eq(companyAdapterSettings.adapterType, adapterType),
        ),
      );

    return get(companyId, adapterType);
  }

  async function reset(companyId: string, adapterType: string): Promise<CompanyAdapterSetting> {
    if (!isAdapterAdapterType(adapterType)) {
      throw notFound(`Unknown adapter type: ${adapterType}`);
    }
    await ensureRow(companyId, adapterType);
    await db
      .update(companyAdapterSettings)
      .set({
        defaultModel: null,
        defaultAdapterConfig: {},
        lastTestStatus: null,
        lastTestError: null,
        lastTestedAt: null,
        configured: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companyAdapterSettings.companyId, companyId),
          eq(companyAdapterSettings.adapterType, adapterType),
        ),
      );
    return get(companyId, adapterType);
  }

  async function instanceUsage(): Promise<InstanceAdapterUsage[]> {
    const usageMap = await aggregateInstanceUsage();
    const counts = await db
      .select({
        adapterType: companyAdapterSettings.adapterType,
        count: sql<number>`count(*)`,
      })
      .from(companyAdapterSettings)
      .where(eq(companyAdapterSettings.configured, true))
      .groupBy(companyAdapterSettings.adapterType);
    const countMap = new Map(counts.map((c) => [c.adapterType, Number(c.count) || 0]));
    return AGENT_ADAPTER_TYPES.map((adapterType) => ({
      adapterType,
      usage: usageMap.get(adapterType) ?? { ...EMPTY_USAGE },
      companyCount: countMap.get(adapterType) ?? 0,
    }));
  }

  return {
    seedForCompany,
    list,
    get,
    upsert,
    test,
    reset,
    instanceUsage,
  };
}

let scaffoldRegistered = false;

export function registerAdapterSettingsScaffold(): void {
  if (scaffoldRegistered) return;
  scaffoldRegistered = true;
  registerCompanyScaffoldStep(async (db, companyId) => {
    const svc = companyAdapterSettingsService(db);
    await svc.seedForCompany(db, companyId);
  });
}
