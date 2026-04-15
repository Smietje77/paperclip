import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import type { Agent, CompanySecret } from "@paperclipai/shared";
import { secretsApi } from "../api/secrets";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

interface FieldRow {
  id: string;
  name: string;
  value: string;
  show: boolean;
}

interface Preset {
  label: string;
  description: string;
  fields: string[];
}

const PRESETS: Record<string, Preset> = {
  simple: {
    label: "Simple (single value)",
    description: "One secret value — API keys, tokens, passwords. Field name 'value' is fine for a single key.",
    fields: ["value"],
  },
  login: {
    label: "Login (email + password)",
    description: "Classic username/password credentials",
    fields: ["email", "password"],
  },
  supabase: {
    label: "Supabase",
    description: "URL, anon key, and service-role key",
    fields: ["url", "anonKey", "serviceKey"],
  },
  postgres: {
    label: "Postgres",
    description: "Host, port, user, password, database",
    fields: ["host", "port", "user", "password", "database"],
  },
  smtp: {
    label: "SMTP",
    description: "Host, port, user, password",
    fields: ["host", "port", "user", "password"],
  },
  oauth: {
    label: "OAuth client",
    description: "Client ID and secret",
    fields: ["clientId", "clientSecret"],
  },
};

let fieldRowIdCounter = 0;
function makeRow(name = "", value = ""): FieldRow {
  fieldRowIdCounter += 1;
  return { id: `field-${fieldRowIdCounter}`, name, value, show: false };
}

function buildSecretUsageMap(agents: Agent[] | undefined): Map<string, Agent[]> {
  const map = new Map<string, Agent[]>();
  if (!agents) return map;
  for (const agent of agents) {
    const adapterConfig = agent.adapterConfig as { env?: unknown } | null | undefined;
    const env = adapterConfig?.env;
    if (!env || typeof env !== "object") continue;
    for (const binding of Object.values(env as Record<string, unknown>)) {
      if (
        binding &&
        typeof binding === "object" &&
        (binding as { type?: unknown }).type === "secret_ref"
      ) {
        const secretId = (binding as { secretId?: unknown }).secretId;
        if (typeof secretId !== "string") continue;
        const list = map.get(secretId) ?? [];
        list.push(agent);
        map.set(secretId, list);
      }
    }
  }
  return map;
}

function formatCreatedBy(secret: CompanySecret): string | null {
  if (secret.createdByUserId) return `user: ${secret.createdByUserId}`;
  if (secret.createdByAgentId) return `agent: ${secret.createdByAgentId}`;
  return null;
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString();
}

function rowsToFieldsMap(rows: FieldRow[]): { fields: Record<string, string>; error: string | null } {
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    if (!name) return { fields: {}, error: "Every field needs a name" };
    if (!FIELD_NAME_RE.test(name)) {
      return {
        fields: {},
        error: `Invalid field name "${name}" — must start with a letter and use only letters, digits, underscores`,
      };
    }
    if (seen.has(name)) return { fields: {}, error: `Duplicate field name: ${name}` };
    seen.add(name);
    if (!row.value) return { fields: {}, error: `Field "${name}" needs a value` };
    fields[name] = row.value;
  }
  if (Object.keys(fields).length === 0) return { fields: {}, error: "At least one field required" };
  return { fields, error: null };
}

interface FieldRepeaterProps {
  rows: FieldRow[];
  onRowsChange: (rows: FieldRow[]) => void;
  allowRename?: boolean;
}

function FieldRepeater({ rows, onRowsChange, allowRename = true }: FieldRepeaterProps) {
  function updateRow(index: number, patch: Partial<FieldRow>) {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    onRowsChange(next.length === 0 ? [makeRow()] : next);
  }

  function addRow() {
    onRowsChange([...rows, makeRow()]);
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && allowRename && (
        <div className="flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <div className="flex-[2]">Field name</div>
          <div className="flex-[3]">Field value (paste API key, password…)</div>
          <div className="w-8 shrink-0" />
        </div>
      )}
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-start gap-2">
          <Input
            className="flex-[2] font-mono"
            placeholder="e.g. apiKey"
            value={row.name}
            onChange={(event) => updateRow(index, { name: event.target.value })}
            disabled={!allowRename}
            aria-label={`Field ${index + 1} name`}
          />
          <div className="relative flex-[3]">
            <Input
              type={row.show ? "text" : "password"}
              placeholder="paste the secret value here"
              value={row.value}
              onChange={(event) => updateRow(index, { value: event.target.value })}
              className="pr-10"
              aria-label={`Field ${index + 1} value`}
            />
            <button
              type="button"
              onClick={() => updateRow(index, { show: !row.show })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={row.show ? "Hide value" : "Show value"}
            >
              {row.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {allowRename ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeRow(index)}
              aria-label={`Remove field ${index + 1}`}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <div className="mt-0.5 w-8 shrink-0" />
          )}
        </div>
      ))}
      {allowRename ? (
        <Button type="button" variant="ghost" size="sm" onClick={addRow} className="h-8">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add field
        </Button>
      ) : null}
    </div>
  );
}

export function Secrets() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: "", description: "" });
  const [createRows, setCreateRows] = useState<FieldRow[]>(() => [makeRow("value", "")]);
  const [createPresetKey, setCreatePresetKey] = useState<string>("simple");
  const [createError, setCreateError] = useState<string | null>(null);

  const [rotateTarget, setRotateTarget] = useState<CompanySecret | null>(null);
  const [rotateRows, setRotateRows] = useState<FieldRow[]>([]);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<CompanySecret | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", description: "" });

  const [deleteTarget, setDeleteTarget] = useState<CompanySecret | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Secrets" }]);
  }, [setBreadcrumbs]);

  const { data: secrets, isLoading, error } = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId!),
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const usageMap = useMemo(() => buildSecretUsageMap(agents), [agents]);

  function resetCreateForm() {
    setCreateDraft({ name: "", description: "" });
    setCreateRows([makeRow("value", "")]);
    setCreatePresetKey("simple");
    setCreateError(null);
  }

  function applyPreset(key: string) {
    setCreatePresetKey(key);
    const preset = PRESETS[key];
    if (!preset) return;
    setCreateRows(preset.fields.map((name) => makeRow(name, "")));
    setCreateError(null);
  }

  const createSecret = useMutation({
    mutationFn: () => {
      const { fields, error: validationError } = rowsToFieldsMap(createRows);
      if (validationError) throw new Error(validationError);
      return secretsApi.create(selectedCompanyId!, {
        name: createDraft.name.trim(),
        fields,
        description: createDraft.description.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets.list(selectedCompanyId!),
      });
      setCreateOpen(false);
      resetCreateForm();
      pushToast({ title: "Secret created", tone: "success" });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : String(err));
      pushToast({
        title: "Failed to create secret",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const rotateSecret = useMutation({
    mutationFn: () => {
      if (!rotateTarget) throw new Error("No secret selected");
      const { fields, error: validationError } = rowsToFieldsMap(rotateRows);
      if (validationError) throw new Error(validationError);
      return secretsApi.rotate(rotateTarget.id, { fields });
    },
    onSuccess: async (secret) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets.list(selectedCompanyId!),
      });
      setRotateTarget(null);
      setRotateRows([]);
      setRotateError(null);
      pushToast({ title: `Rotated to v${secret.latestVersion}`, tone: "success" });
    },
    onError: (err) => {
      setRotateError(err instanceof Error ? err.message : String(err));
      pushToast({
        title: "Failed to rotate secret",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const updateSecret = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No secret selected");
      return secretsApi.update(editTarget.id, {
        name: editDraft.name.trim(),
        description: editDraft.description.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets.list(selectedCompanyId!),
      });
      setEditTarget(null);
      pushToast({ title: "Secret updated", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to update secret",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const deleteSecret = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No secret selected");
      return secretsApi.remove(deleteTarget.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.secrets.list(selectedCompanyId!),
      });
      setDeleteTarget(null);
      setDeleteConfirmed(false);
      pushToast({ title: "Secret deleted", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to delete secret",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  function openRotate(secret: CompanySecret) {
    setRotateTarget(secret);
    setRotateRows(secret.fieldNames.map((name) => makeRow(name, "")));
    setRotateError(null);
  }

  function closeRotate() {
    setRotateTarget(null);
    setRotateRows([]);
    setRotateError(null);
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={KeyRound} message="Select a company to view secrets." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const deleteUsedBy = deleteTarget ? usageMap.get(deleteTarget.id) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
          <p className="text-sm text-muted-foreground">
            Centrally manage API keys, logins, and service credentials. Each secret can hold multiple
            named fields (e.g. url + anonKey + serviceKey). Agents reference secrets and optionally a
            specific field in their env config.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create secret
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load secrets"}
          </CardContent>
        </Card>
      ) : null}

      {(secrets ?? []).length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={KeyRound}
            message="No secrets yet. Create your first secret to start sharing credentials with your agents."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <TooltipProvider>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Fields</th>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Used by</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(secrets ?? []).map((secret) => {
                  const usedBy = usageMap.get(secret.id) ?? [];
                  const createdBy = formatCreatedBy(secret);
                  const isSimple =
                    secret.fieldNames.length === 1 && secret.fieldNames[0] === "value";
                  return (
                    <tr
                      key={secret.id}
                      className="align-middle border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2.5 font-medium">{secret.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {secret.description ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {isSimple ? (
                          <span className="text-xs text-muted-foreground">single value</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-sm underline-offset-2 hover:underline">
                                {secret.fieldNames.length} fields
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{secret.fieldNames.join(", ")}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary">v{secret.latestVersion}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {usedBy.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-sm underline-offset-2 hover:underline">
                                {usedBy.length} agent{usedBy.length === 1 ? "" : "s"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {usedBy.map((a) => a.name).join(", ")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <div>{formatDate(secret.createdAt)}</div>
                        {createdBy ? <div className="text-xs">{createdBy}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${secret.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRotate(secret)}>
                              Rotate values
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(secret);
                                setEditDraft({
                                  name: secret.name,
                                  description: secret.description ?? "",
                                });
                              }}
                            >
                              Edit metadata
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setDeleteTarget(secret);
                                setDeleteConfirmed(false);
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TooltipProvider>
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createSecret.isPending) {
            setCreateOpen(open);
            if (!open) resetCreateForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create secret</DialogTitle>
            <DialogDescription>
              Each secret can hold one or more named fields. Pick a preset for common credential types,
              or define your own fields. Values are encrypted and never shown again after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border border-blue-500/30 bg-blue-500/5 p-2 text-xs space-y-1">
            <div className="font-medium text-blue-700 dark:text-blue-400">
              Heb je echt een secret nodig?
            </div>
            <p className="text-muted-foreground">
              <strong>Geen secret nodig</strong> voor adapters die via CLI-login werken: <span className="font-mono">claude</span> (Claude Code), <span className="font-mono">codex</span>, <span className="font-mono">gemini</span>, <span className="font-mono">cursor</span>. Log in via de CLI op de host (<span className="font-mono">claude login</span>, etc.) en je bent klaar.
            </p>
            <p className="text-muted-foreground">
              <strong>Wel een secret nodig</strong> voor: OpenCode (OpenAI/OpenRouter/Kie.ai), Hermes, OpenClaw Gateway, Pi, MCP-servers (GitHub PAT, Apify, DataForSEO, Resend, …) en eigen integraties.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="secret-name"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Secret name
              </label>
              <Input
                id="secret-name"
                placeholder="e.g. supabase_prod, gmail_support, openai_primary"
                value={createDraft.name}
                onChange={(event) =>
                  setCreateDraft((cur) => ({ ...cur, name: event.target.value }))
                }
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="secret-preset"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Preset
              </label>
              <Select value={createPresetKey} onValueChange={applyPreset}>
                <SelectTrigger id="secret-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PRESETS[createPresetKey]?.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fields
              </label>
              <FieldRepeater rows={createRows} onRowsChange={setCreateRows} />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="secret-description"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Description <span className="font-normal normal-case">(optional)</span>
              </label>
              <Textarea
                id="secret-description"
                placeholder="What is this secret for?"
                value={createDraft.description}
                onChange={(event) =>
                  setCreateDraft((cur) => ({ ...cur, description: event.target.value }))
                }
                rows={2}
              />
            </div>

            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
              disabled={createSecret.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createSecret.mutate()}
              disabled={createSecret.isPending || !createDraft.name.trim()}
            >
              {createSecret.isPending ? "Creating..." : "Create secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate dialog */}
      <Dialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!rotateSecret.isPending && !open) closeRotate();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Rotate {rotateTarget?.name}</DialogTitle>
            <DialogDescription>
              Currently at v{rotateTarget?.latestVersion}. Enter new values for all fields. Agents
              resolve to the latest version on their next run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              New values
            </label>
            <FieldRepeater rows={rotateRows} onRowsChange={setRotateRows} allowRename={false} />
          </div>
          {rotateError ? (
            <p className="text-sm text-destructive">{rotateError}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeRotate}
              disabled={rotateSecret.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => rotateSecret.mutate()}
              disabled={rotateSecret.isPending}
            >
              {rotateSecret.isPending ? "Rotating..." : "Rotate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit metadata dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!updateSecret.isPending && !open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit metadata</DialogTitle>
            <DialogDescription>
              Value rotation is done separately — use "Rotate values" from the actions menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-name"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="edit-name"
                value={editDraft.name}
                onChange={(event) =>
                  setEditDraft((cur) => ({ ...cur, name: event.target.value }))
                }
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="edit-description"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Description <span className="font-normal normal-case">(optional)</span>
              </label>
              <Textarea
                id="edit-description"
                value={editDraft.description}
                onChange={(event) =>
                  setEditDraft((cur) => ({ ...cur, description: event.target.value }))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditTarget(null)}
              disabled={updateSecret.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateSecret.mutate()}
              disabled={updateSecret.isPending || !editDraft.name.trim()}
            >
              {updateSecret.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!deleteSecret.isPending && !open) {
            setDeleteTarget(null);
            setDeleteConfirmed(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the secret. Agents that reference it will break on their next run.
            </DialogDescription>
          </DialogHeader>
          {deleteUsedBy.length > 0 ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Used by {deleteUsedBy.length} agent{deleteUsedBy.length === 1 ? "" : "s"}
              </div>
              <p className="text-xs text-muted-foreground">
                {deleteUsedBy.map((a) => a.name).join(", ")}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmed(false);
              }}
              disabled={deleteSecret.isPending}
            >
              Cancel
            </Button>
            {deleteUsedBy.length > 0 && !deleteConfirmed ? (
              <Button variant="destructive" onClick={() => setDeleteConfirmed(true)}>
                I understand, continue
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => deleteSecret.mutate()}
                disabled={deleteSecret.isPending}
              >
                {deleteSecret.isPending ? "Deleting..." : "Delete secret"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
