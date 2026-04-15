import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plug, Play, RotateCcw, Save, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { CompanyAdapterSetting, AgentAdapterType } from "@paperclipai/shared";
import { agentsApi, type AdapterModel } from "../api/agents";
import { companyAdapterSettingsApi } from "../api/companyAdapterSettings";
import { secretsApi } from "../api/secrets";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { listUIAdapters } from "../adapters/registry";
import { adapterLabels, formatCents } from "../lib/agent-display";
import {
  apiKeyEnvForAdapter,
  authForAdapter,
  buildPresetConfig,
  detectPresetFromConfig,
  presetsForAdapter,
  suggestSecretForEnvVar,
} from "../lib/adapter-presets";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";

function StatusPill({ setting }: { setting: CompanyAdapterSetting }) {
  if (setting.configured) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded">
        configured
      </span>
    );
  }
  if (setting.lastTestStatus === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive rounded"
        title={setting.lastTestError ?? undefined}
      >
        error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded">
      untested
    </span>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function AdapterRow({
  setting,
  companyId,
  expanded,
  onToggle,
}: {
  setting: CompanyAdapterSetting;
  companyId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const adapterType = setting.adapterType;

  const [pendingModel, setPendingModel] = useState<string | null>(setting.defaultModel);
  const [pendingEnabled, setPendingEnabled] = useState<boolean>(setting.enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPendingModel(setting.defaultModel);
    setPendingEnabled(setting.enabled);
  }, [setting.defaultModel, setting.enabled]);

  const dirty =
    pendingModel !== setting.defaultModel || pendingEnabled !== setting.enabled;

  const modelsQuery = useQuery({
    queryKey: queryKeys.agents.adapterModels(companyId, adapterType),
    queryFn: () => agentsApi.adapterModels(companyId, adapterType),
    enabled: expanded,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companyAdapterSettings.list(companyId) });
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      companyAdapterSettingsApi.update(companyId, adapterType, {
        defaultModel: pendingModel,
        enabled: pendingEnabled,
      }),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Save failed"),
  });

  const presets = presetsForAdapter(adapterType);
  const activePreset = useMemo(
    () => detectPresetFromConfig(adapterType, setting.defaultAdapterConfig),
    [adapterType, setting.defaultAdapterConfig],
  );

  const applyPresetMutation = useMutation({
    mutationFn: (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`Unknown preset: ${presetId}`);
      const nextConfig = buildPresetConfig(preset, setting.defaultAdapterConfig ?? {});
      return companyAdapterSettingsApi.update(companyId, adapterType, {
        defaultModel: preset.defaultModel,
        defaultAdapterConfig: nextConfig,
      });
    },
    onSuccess: invalidate,
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Preset toepassen mislukt"),
  });

  const testMutation = useMutation({
    mutationFn: () => companyAdapterSettingsApi.test(companyId, adapterType),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Test failed"),
  });

  const resetMutation = useMutation({
    mutationFn: () => companyAdapterSettingsApi.reset(companyId, adapterType),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Reset failed"),
  });

  const auth = authForAdapter(adapterType);
  const apiKeyEnv = apiKeyEnvForAdapter(adapterType);

  const secretsQuery = useQuery({
    queryKey: queryKeys.secrets.list(companyId),
    queryFn: () => secretsApi.list(companyId),
    enabled: expanded && auth.mode === "api_key",
    staleTime: 30_000,
  });

  const currentEnv = (setting.defaultAdapterConfig?.env ?? {}) as Record<string, unknown>;
  const currentBinding = apiKeyEnv
    ? (currentEnv[apiKeyEnv] as { type?: string; secretId?: string; field?: string } | undefined)
    : undefined;
  const boundSecretId =
    currentBinding?.type === "secret_ref" ? currentBinding.secretId ?? null : null;
  const boundField =
    currentBinding?.type === "secret_ref" ? currentBinding.field ?? null : null;

  const bindSecretMutation = useMutation({
    mutationFn: ({
      secretId,
      field,
    }: {
      secretId: string | null;
      field: string | null;
    }) => {
      if (!apiKeyEnv) throw new Error("Adapter has no known API key env var");
      const nextEnv: Record<string, unknown> = { ...currentEnv };
      if (secretId) {
        nextEnv[apiKeyEnv] = {
          type: "secret_ref",
          secretId,
          version: "latest",
          field,
        };
      } else {
        delete nextEnv[apiKeyEnv];
      }
      return companyAdapterSettingsApi.update(companyId, adapterType, {
        defaultAdapterConfig: { ...setting.defaultAdapterConfig, env: nextEnv },
      });
    },
    onSuccess: invalidate,
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Secret koppelen mislukt"),
  });

  const availableSecrets = secretsQuery.data ?? [];
  const suggested = useMemo(() => {
    if (!apiKeyEnv || boundSecretId) return null;
    return suggestSecretForEnvVar(apiKeyEnv, availableSecrets);
  }, [apiKeyEnv, boundSecretId, availableSecrets]);

  const saving =
    updateMutation.isPending ||
    testMutation.isPending ||
    resetMutation.isPending ||
    applyPresetMutation.isPending ||
    bindSecretMutation.isPending;

  const usage = setting.usage;
  const totalTokens = usage.tokensIn + usage.tokensOut;
  const adapterLabel = adapterLabels[adapterType] ?? adapterType;

  const modelOptions = useMemo<AdapterModel[]>(() => {
    const list = modelsQuery.data ?? [];
    if (pendingModel && !list.some((m) => m.id === pendingModel)) {
      return [{ id: pendingModel, label: pendingModel }, ...list];
    }
    return list;
  }, [modelsQuery.data, pendingModel]);

  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/30 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Plug className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{adapterLabel}</span>
            <StatusPill setting={setting} />
            {auth.mode === "cli_login" && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded"
                title={auth.description}
              >
                CLI-login
              </span>
            )}
            {auth.mode === "api_key" && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded"
                title={auth.description}
              >
                API-key vereist
              </span>
            )}
            {!setting.enabled && (
              <span className="text-[10px] uppercase text-muted-foreground">disabled</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {setting.defaultModel || "no default model"}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end text-xs">
          <span className="font-mono">{formatTokens(totalTokens)} tokens</span>
          <span className="font-mono text-muted-foreground">{formatCents(usage.costCents)}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/10">
          {error && (
            <div className="text-xs text-destructive">{error}</div>
          )}

          {presets.length > 0 && (
            <div className="border border-border bg-background p-2 space-y-2">
              <div className="text-xs font-medium">Provider preset</div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => {
                  const isActive = activePreset?.id === p.id;
                  return (
                    <Button
                      key={p.id}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      disabled={saving}
                      onClick={() => applyPresetMutation.mutate(p.id)}
                      className="text-xs h-7"
                      title={p.hint}
                    >
                      {p.label}
                      {isActive && <span className="ml-1 text-[10px]">✓</span>}
                    </Button>
                  );
                })}
              </div>
              {activePreset && (
                <div className="text-[11px] text-muted-foreground">
                  {activePreset.hint}{" "}
                  <a
                    href={activePreset.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    docs
                  </a>
                  . Voorbeeld-modellen:{" "}
                  <span className="font-mono">{activePreset.sampleModels.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Default model</label>
              <Select
                value={pendingModel ?? undefined}
                onValueChange={(v) => setPendingModel(v)}
                disabled={saving}
              >
                <SelectTrigger size="sm" className="h-8 text-xs font-mono w-full">
                  <SelectValue placeholder={modelsQuery.isLoading ? "Loading…" : "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No models available
                    </div>
                  )}
                  {modelOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                      {m.label || m.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id={`enabled-${adapterType}`}
                checked={pendingEnabled}
                onCheckedChange={(v) => setPendingEnabled(v === true)}
                disabled={saving}
              />
              <label htmlFor={`enabled-${adapterType}`} className="text-xs">
                Beschikbaar voor agents in deze company
              </label>
            </div>
          </div>

          {auth.mode === "cli_login" && (
            <div className="border border-blue-500/30 bg-blue-500/5 p-2 space-y-1">
              <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Authenticatie via CLI-login
              </div>
              <p className="text-[11px] text-muted-foreground">{auth.description}</p>
              {auth.loginCommand && (
                <p className="text-[11px] text-muted-foreground">
                  Inloggen: <span className="font-mono bg-muted px-1 py-0.5 rounded">{auth.loginCommand}</span>{" "}
                  in een terminal op de host. Klik daarna "Test connection" hieronder.
                </p>
              )}
            </div>
          )}

          {auth.mode === "api_key" && apiKeyEnv && (
            <div className="border border-border bg-background p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  API-key secret <span className="text-muted-foreground font-mono">→ {apiKeyEnv}</span>
                </div>
                <Link to="/secrets" className="text-[11px] text-muted-foreground underline">
                  beheer secrets
                </Link>
              </div>
              {availableSecrets.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nog geen secrets aangemaakt. Ga naar{" "}
                  <Link to="/secrets" className="underline">
                    Company → Secrets
                  </Link>{" "}
                  en maak er één met een veld voor je API-key.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={boundSecretId ?? "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        bindSecretMutation.mutate({ secretId: null, field: null });
                        return;
                      }
                      const secret = availableSecrets.find((s) => s.id === v);
                      const field = secret?.fieldNames?.[0] ?? null;
                      bindSecretMutation.mutate({ secretId: v, field });
                    }}
                    disabled={saving}
                  >
                    <SelectTrigger size="sm" className="h-8 w-[260px] text-xs">
                      <SelectValue placeholder="Kies een secret" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">
                        — Geen koppeling —
                      </SelectItem>
                      {availableSecrets.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name}
                          {s.fieldNames?.length > 0 && (
                            <span className="text-muted-foreground ml-1">
                              ({s.fieldNames.join(", ")})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {boundSecretId && boundField && (
                    <span className="text-[11px] text-muted-foreground">
                      veld <span className="font-mono">{boundField}</span>
                    </span>
                  )}
                  {!boundSecretId && suggested && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={saving}
                      onClick={() => {
                        const secret = availableSecrets.find((s) => s.id === suggested.id);
                        const field = secret?.fieldNames?.[0] ?? null;
                        bindSecretMutation.mutate({ secretId: suggested.id, field });
                      }}
                    >
                      Suggestie: koppel "{suggested.name}"
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {setting.lastTestedAt && (
              <p>
                Laatste test: {new Date(setting.lastTestedAt).toLocaleString()}
                {setting.lastTestStatus === "error" && setting.lastTestError && (
                  <span className="text-destructive"> — {setting.lastTestError}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={!dirty || saving}
              onClick={() => updateMutation.mutate()}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Opslaan
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => testMutation.mutate()}
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Test connection
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => resetMutation.mutate()}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
            <Link
              to={`/agents/new`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground ml-auto"
            >
              Maak agent met deze adapter <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function CompanyAdapters() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [expandedType, setExpandedType] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Company" }, { label: "Adapters" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompanyId ?? "";

  const settingsQuery = useQuery({
    queryKey: queryKeys.companyAdapterSettings.list(companyId),
    queryFn: () => companyAdapterSettingsApi.list(companyId),
    enabled: !!companyId,
  });

  const instanceUsageQuery = useQuery({
    queryKey: queryKeys.companyAdapterSettings.instanceUsage,
    queryFn: () => companyAdapterSettingsApi.instanceUsage(),
    retry: false,
  });

  const isInstanceAdmin = !instanceUsageQuery.isError && Boolean(instanceUsageQuery.data);

  if (!selectedCompanyId) {
    return <EmptyState icon={Cpu} message="Select a company to manage adapters." />;
  }

  if (settingsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const settings = settingsQuery.data ?? [];
  const knownTypes = new Set(listUIAdapters().map((a) => a.type));
  const ordered = [...settings].sort((a, b) => {
    const aKnown = knownTypes.has(a.adapterType) ? 0 : 1;
    const bKnown = knownTypes.has(b.adapterType) ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;
    return a.adapterType.localeCompare(b.adapterType);
  });

  const companyTotals = settings.reduce(
    (acc, s) => ({
      tokens: acc.tokens + s.usage.tokensIn + s.usage.tokensOut,
      costCents: acc.costCents + s.usage.costCents,
      configured: acc.configured + (s.configured ? 1 : 0),
    }),
    { tokens: 0, costCents: 0, configured: 0 },
  );

  const instanceTotals = (instanceUsageQuery.data ?? []).reduce(
    (acc, s) => ({
      tokens: acc.tokens + s.usage.tokensIn + s.usage.tokensOut,
      costCents: acc.costCents + s.usage.costCents,
    }),
    { tokens: 0, costCents: 0 },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Adapters</h1>
        <p className="text-xs text-muted-foreground">
          Centrale defaults per adapter (model, beschikbaarheid). Verbruik is maand-to-date
          uit cost-events.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="border border-border p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Company tokens MTD</div>
          <div className="text-lg font-mono">{formatTokens(companyTotals.tokens)}</div>
        </div>
        <div className="border border-border p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Company kosten MTD</div>
          <div className="text-lg font-mono">{formatCents(companyTotals.costCents)}</div>
        </div>
        <div className="border border-border p-3">
          <div className="text-[11px] uppercase text-muted-foreground">Configured adapters</div>
          <div className="text-lg font-mono">
            {companyTotals.configured} / {settings.length}
          </div>
        </div>
      </div>

      {isInstanceAdmin && (
        <div className="border border-border p-3 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase text-muted-foreground">Instance-totaal MTD</div>
            <div className="text-xs font-mono text-muted-foreground">
              alle companies samen
            </div>
          </div>
          <div className="flex gap-6 mt-1">
            <div>
              <span className="text-lg font-mono">{formatTokens(instanceTotals.tokens)}</span>
              <span className="text-xs text-muted-foreground ml-1">tokens</span>
            </div>
            <div>
              <span className="text-lg font-mono">{formatCents(instanceTotals.costCents)}</span>
              <span className="text-xs text-muted-foreground ml-1">cost</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ordered.map((s) => (
          <AdapterRow
            key={s.adapterType}
            setting={s}
            companyId={companyId}
            expanded={expandedType === s.adapterType}
            onToggle={() =>
              setExpandedType(expandedType === s.adapterType ? null : s.adapterType)
            }
          />
        ))}
      </div>
    </div>
  );
}

// Suppress unused import warning for AgentAdapterType (re-exported via types for future use).
type _Unused = AgentAdapterType;
