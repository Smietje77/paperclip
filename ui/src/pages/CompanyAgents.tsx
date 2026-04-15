import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Trash2, Pause, Play, ExternalLink } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { companyAdapterSettingsApi } from "../api/companyAdapterSettings";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import {
  adapterLabels,
  adapterOptions,
  formatCents,
  formatModel,
  getAgentSpendCents,
} from "../lib/agent-display";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";

function AdapterCell({
  agent,
  onChange,
  saving,
  configuredTypes,
}: {
  agent: Agent;
  onChange: (adapterType: string) => void;
  saving: boolean;
  configuredTypes: Set<string>;
}) {
  return (
    <Select
      value={agent.adapterType}
      onValueChange={onChange}
      disabled={saving}
    >
      <SelectTrigger size="sm" className="h-7 w-[140px] text-xs">
        <SelectValue placeholder="Adapter" />
      </SelectTrigger>
      <SelectContent>
        {adapterOptions.map((opt) => {
          const isCurrent = opt.value === agent.adapterType;
          const isConfigured = configuredTypes.has(opt.value);
          // Always allow current selection so existing agents remain visible.
          const disabled = !isConfigured && !isCurrent;
          return (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-xs"
              disabled={disabled}
              title={disabled ? "Niet geconfigureerd — open Company → Adapters" : undefined}
            >
              {opt.label}
              {!isConfigured && !isCurrent && (
                <span className="ml-1 text-[10px] text-muted-foreground">·  niet geconfigureerd</span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ModelCell({
  agent,
  companyId,
  onChange,
  saving,
}: {
  agent: Agent;
  companyId: string;
  onChange: (model: string) => void;
  saving: boolean;
}) {
  const { data: models, isLoading } = useQuery({
    queryKey: queryKeys.agents.adapterModels(companyId, agent.adapterType),
    queryFn: () => agentsApi.adapterModels(companyId, agent.adapterType),
    enabled: !!companyId && !!agent.adapterType,
    staleTime: 60_000,
  });

  const currentModel = formatModel(agent.adapterConfig);
  const currentValue = currentModel === "—" ? "" : currentModel;

  const options = useMemo(() => {
    const list = models ?? [];
    if (currentValue && !list.some((m) => m.id === currentValue)) {
      return [{ id: currentValue, label: currentValue }, ...list];
    }
    return list;
  }, [models, currentValue]);

  return (
    <Select
      value={currentValue || undefined}
      onValueChange={onChange}
      disabled={saving || isLoading}
    >
      <SelectTrigger size="sm" className="h-7 w-[200px] text-xs font-mono">
        <SelectValue placeholder={isLoading ? "Loading…" : "Select model"} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No models available</div>
        )}
        {options.map((m) => (
          <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
            {m.label || m.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CompanyAgents() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Company" }, { label: "Agents" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompanyId ?? "";

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const costsQuery = useQuery({
    queryKey: queryKeys.costs(companyId),
    queryFn: () => costsApi.byAgent(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const adapterSettingsQuery = useQuery({
    queryKey: queryKeys.companyAdapterSettings.list(companyId),
    queryFn: () => companyAdapterSettingsApi.list(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const configuredTypes = useMemo(() => {
    const set = new Set<string>();
    for (const s of adapterSettingsQuery.data ?? []) {
      if (s.configured && s.enabled) set.add(s.adapterType);
    }
    return set;
  }, [adapterSettingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      agentsApi.update(id, data, companyId),
    onMutate: ({ id }) => setSavingId(id),
    onSettled: () => setSavingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Update failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.remove(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const pauseResumeMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) =>
      action === "pause" ? agentsApi.pause(id, companyId) : agentsApi.resume(id, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to view agents." />;
  }

  if (agentsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const agents = [...(agentsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const costs = costsQuery.data;

  const handleAdapterChange = (agent: Agent, adapterType: string) => {
    if (adapterType === agent.adapterType) return;
    const nextConfig = { ...(agent.adapterConfig as Record<string, unknown>), model: "" };
    updateMutation.mutate({ id: agent.id, data: { adapterType, adapterConfig: nextConfig } });
  };

  const handleModelChange = (agent: Agent, model: string) => {
    const currentConfig = (agent.adapterConfig ?? {}) as Record<string, unknown>;
    if (currentConfig.model === model) return;
    const nextConfig = { ...currentConfig, model };
    updateMutation.mutate({ id: agent.id, data: { adapterConfig: nextConfig } });
  };

  const handleDelete = (agent: Agent) => {
    const confirmed = window.confirm(
      `Delete agent "${agent.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    deleteMutation.mutate(agent.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-xs text-muted-foreground">
            Centraal beheer: adaptertype, LLM-model, status en verbruik per agent.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openNewAgent}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Agent
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {agentsQuery.error && (
        <p className="text-sm text-destructive">{agentsQuery.error.message}</p>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          message="No agents yet."
          action="New Agent"
          onAction={openNewAgent}
        />
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Agent</th>
                <th className="text-left font-medium px-3 py-2">Rol</th>
                <th className="text-left font-medium px-3 py-2">Adapter</th>
                <th className="text-left font-medium px-3 py-2">LLM-model</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Maand spend</th>
                <th className="text-right font-medium px-3 py-2">Acties</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const saving = savingId === agent.id;
                const spend = getAgentSpendCents(agent.id, costs);
                const modelEmpty = formatModel(agent.adapterConfig) === "—";
                const isPaused = agent.status === "paused";
                return (
                  <tr key={agent.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <Link
                        to={agentUrl(agent)}
                        className="font-medium text-foreground hover:underline"
                      >
                        {agent.name}
                      </Link>
                      {agent.title && (
                        <div className="text-xs text-muted-foreground">{agent.title}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{agent.role}</td>
                    <td className="px-3 py-2">
                      <AdapterCell
                        agent={agent}
                        onChange={(t) => handleAdapterChange(agent, t)}
                        saving={saving}
                        configuredTypes={configuredTypes}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ModelCell
                          agent={agent}
                          companyId={companyId}
                          onChange={(m) => handleModelChange(agent, m)}
                          saving={saving}
                        />
                        {modelEmpty && (
                          <span
                            title="Model is niet ingesteld — gebruikt adapter default"
                            className="text-[10px] text-amber-600"
                          >
                            !
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatCents(spend)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={isPaused ? "Resume" : "Pause"}
                          onClick={() =>
                            pauseResumeMutation.mutate({
                              id: agent.id,
                              action: isPaused ? "resume" : "pause",
                            })
                          }
                        >
                          {isPaused ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Open detail"
                          onClick={() => navigate(agentUrl(agent))}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Verwijder agent"
                          onClick={() => handleDelete(agent)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: klik op een agent-naam om verbruik (tokens, kosten, runs) en activiteit te bekijken.
        Adapters:{" "}
        {Object.values(adapterLabels).slice(0, 6).join(" · ")}…
      </p>
    </div>
  );
}
