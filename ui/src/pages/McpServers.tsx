import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  Check,
  MoreHorizontal,
  Package,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  CompanyMcpServer,
  CompanySecret,
  CreateMcpServer,
  EnvBinding,
  McpCatalogCategory,
  McpCatalogEntry,
  McpTransport,
} from "@paperclipai/shared";
import { mcpServersApi } from "../api/mcp-servers";
import { secretsApi } from "../api/secrets";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type BindingKind = "plain" | "secret_ref";

interface BindingRow {
  id: string;
  key: string;
  kind: BindingKind;
  plainValue: string;
  secretId: string;
  secretField: string;
}

interface FormState {
  name: string;
  description: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  enabled: boolean;
  envRows: BindingRow[];
  headerRows: BindingRow[];
}

let bindingRowIdCounter = 0;
function makeBindingRow(): BindingRow {
  bindingRowIdCounter += 1;
  return {
    id: `binding-${bindingRowIdCounter}`,
    key: "",
    kind: "plain",
    plainValue: "",
    secretId: "",
    secretField: "",
  };
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    enabled: true,
    envRows: [],
    headerRows: [],
  };
}

function bindingsToRows(bindings: Record<string, EnvBinding> | null | undefined): BindingRow[] {
  if (!bindings) return [];
  return Object.entries(bindings).map(([key, binding]) => {
    const row = makeBindingRow();
    row.key = key;
    if (typeof binding === "string") {
      row.kind = "plain";
      row.plainValue = binding;
    } else if (binding.type === "plain") {
      row.kind = "plain";
      row.plainValue = binding.value;
    } else {
      row.kind = "secret_ref";
      row.secretId = binding.secretId;
      row.secretField = binding.field ?? "";
    }
    return row;
  });
}

function serverToForm(server: CompanyMcpServer): FormState {
  return {
    name: server.name,
    description: server.description ?? "",
    transport: server.transport,
    command: server.command ?? "",
    args: (server.args ?? []).join(" "),
    url: server.url ?? "",
    enabled: server.enabled,
    envRows: bindingsToRows(server.env),
    headerRows: bindingsToRows(server.headers),
  };
}

function rowsToBindings(
  rows: BindingRow[],
): { bindings: Record<string, EnvBinding> | null; error: string | null } {
  if (rows.length === 0) return { bindings: null, error: null };
  const result: Record<string, EnvBinding> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && row.kind === "plain" && !row.plainValue && !row.secretId) continue;
    if (!key) return { bindings: null, error: "Every binding needs a key" };
    if (seen.has(key)) return { bindings: null, error: `Duplicate key: ${key}` };
    seen.add(key);
    if (row.kind === "plain") {
      if (!row.plainValue) return { bindings: null, error: `Value required for ${key}` };
      result[key] = { type: "plain", value: row.plainValue };
    } else {
      if (!row.secretId) return { bindings: null, error: `Secret required for ${key}` };
      result[key] = {
        type: "secret_ref",
        secretId: row.secretId,
        ...(row.secretField.trim() ? { field: row.secretField.trim() } : {}),
      };
    }
  }
  if (Object.keys(result).length === 0) return { bindings: null, error: null };
  return { bindings: result, error: null };
}

function parseArgs(args: string): string[] {
  const trimmed = args.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (const ch of trimmed) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function formToPayload(form: FormState): { payload: CreateMcpServer | null; error: string | null } {
  const name = form.name.trim();
  if (!name) return { payload: null, error: "Name is required" };

  const { bindings: env, error: envError } = rowsToBindings(form.envRows);
  if (envError) return { payload: null, error: envError };
  const { bindings: headers, error: headerError } = rowsToBindings(form.headerRows);
  if (headerError) return { payload: null, error: headerError };

  if (form.transport === "stdio") {
    if (!form.command.trim()) return { payload: null, error: "stdio transport requires a command" };
  } else {
    if (!form.url.trim()) return { payload: null, error: `${form.transport} transport requires a URL` };
  }

  const payload: CreateMcpServer = {
    name,
    description: form.description.trim() || null,
    transport: form.transport,
    command: form.transport === "stdio" ? form.command.trim() : null,
    args: form.transport === "stdio" ? parseArgs(form.args) : null,
    url: form.transport !== "stdio" ? form.url.trim() : null,
    headers: form.transport !== "stdio" ? headers : null,
    env: form.transport === "stdio" ? env : null,
    enabled: form.enabled,
  };
  return { payload, error: null };
}

interface BindingRepeaterProps {
  label: string;
  rows: BindingRow[];
  onRowsChange: (rows: BindingRow[]) => void;
  secrets: CompanySecret[] | undefined;
}

function BindingRepeater({ label, rows, onRowsChange, secrets }: BindingRepeaterProps) {
  function updateRow(index: number, patch: Partial<BindingRow>) {
    onRowsChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    onRowsChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onRowsChange([...rows, makeBindingRow()]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No entries — click Add to create one.</p>
      ) : null}
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-1 rounded border border-border/60 p-2">
          <div className="flex gap-2">
            <Input
              className="flex-[2]"
              placeholder="KEY"
              value={row.key}
              onChange={(event) => updateRow(index, { key: event.target.value })}
            />
            <Select
              value={row.kind}
              onValueChange={(value) => updateRow(index, { kind: value as BindingKind })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">Plain value</SelectItem>
                <SelectItem value="secret_ref">Secret reference</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(index)}
              aria-label="Remove binding"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {row.kind === "plain" ? (
            <Input
              type="password"
              placeholder="value"
              value={row.plainValue}
              onChange={(event) => updateRow(index, { plainValue: event.target.value })}
            />
          ) : (
            <div className="flex gap-2">
              <Select
                value={row.secretId}
                onValueChange={(value) => updateRow(index, { secretId: value })}
              >
                <SelectTrigger className="flex-[2]">
                  <SelectValue placeholder="Select a secret" />
                </SelectTrigger>
                <SelectContent>
                  {(secrets ?? []).map((secret) => (
                    <SelectItem key={secret.id} value={secret.id}>
                      {secret.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder="field (optional)"
                value={row.secretField}
                onChange={(event) => updateRow(index, { secretField: event.target.value })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface ServerFormDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  form: FormState;
  setForm: (next: FormState) => void;
  error: string | null;
  secrets: CompanySecret[] | undefined;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function ServerFormDialog(props: ServerFormDialogProps) {
  const { form, setForm, error, secrets, onClose, onSubmit, isPending } = props;

  return (
    <Dialog open={props.open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>
            Configure a Model Context Protocol server that agents in this company can opt into.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="github"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Transport</label>
              <Select
                value={form.transport}
                onValueChange={(value) => setForm({ ...form, transport: value as McpTransport })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio (spawn a process)</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              rows={2}
              placeholder="What this server provides"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>

          {form.transport === "stdio" ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">Command</label>
                <Input
                  placeholder="npx"
                  value={form.command}
                  onChange={(event) => setForm({ ...form, command: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Arguments</label>
                <Input
                  placeholder='-y "@modelcontextprotocol/server-github"'
                  value={form.args}
                  onChange={(event) => setForm({ ...form, args: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated. Wrap values with spaces in quotes.
                </p>
              </div>
              <BindingRepeater
                label="Environment variables"
                rows={form.envRows}
                onRowsChange={(rows) => setForm({ ...form, envRows: rows })}
                secrets={secrets}
              />
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">URL</label>
                <Input
                  placeholder="https://mcp.example.com"
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                />
              </div>
              <BindingRepeater
                label="Headers"
                rows={form.headerRows}
                onRowsChange={(rows) => setForm({ ...form, headerRows: rows })}
                secrets={secrets}
              />
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              id="mcp-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
            <label htmlFor="mcp-enabled" className="text-sm">
              Enabled (available for agents to opt into)
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Saving…" : props.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDot({ server }: { server: CompanyMcpServer }) {
  let color: string;
  let label: string;
  if (!server.enabled) {
    color = "bg-muted-foreground/40";
    label = "Disabled";
  } else if (server.healthStatus === "healthy") {
    color = "bg-green-500";
    label = "Healthy";
  } else if (server.healthStatus === "unhealthy") {
    color = "bg-red-500";
    label = "Unhealthy";
  } else if (server.healthStatus === "checking") {
    color = "bg-blue-500 animate-pulse";
    label = "Checking…";
  } else {
    color = "bg-amber-400";
    label = "Untested";
  }
  const tooltipParts = [label];
  if (server.lastHealthError) tooltipParts.push(server.lastHealthError);
  if (server.lastHealthCheckAt) {
    const checkedAt = new Date(server.lastHealthCheckAt);
    tooltipParts.push(`Checked: ${checkedAt.toLocaleString()}`);
  }
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      title={tooltipParts.join(" — ")}
      aria-label={label}
    />
  );
}

const CATEGORY_LABELS: Record<McpCatalogCategory, string> = {
  analytics: "Analytics",
  advertising: "Advertising",
  social: "Social",
  content: "Content",
  design: "Design",
  email: "Email",
  seo: "SEO",
  crm: "CRM",
  ops: "Operations",
};

const CATEGORY_ORDER: McpCatalogCategory[] = [
  "analytics",
  "advertising",
  "social",
  "content",
  "design",
  "email",
  "seo",
  "crm",
  "ops",
];

interface McpCatalogSectionProps {
  catalog: McpCatalogEntry[];
  installedKeys: Set<string>;
  onInstall: (catalogKey: string) => void;
  onInstallStarter: () => void;
  installingKey: string | null;
  isStarterPending: boolean;
}

function McpCatalogSection({
  catalog,
  installedKeys,
  onInstall,
  onInstallStarter,
  installingKey,
  isStarterPending,
}: McpCatalogSectionProps) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<McpCatalogCategory, McpCatalogEntry[]>();
    for (const entry of catalog) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [catalog]);

  const starterCount = catalog.filter((c) => c.isStarterPack).length;
  const installedStarterCount = catalog.filter((c) => c.isStarterPack && installedKeys.has(c.key)).length;
  const starterFullyInstalled = starterCount > 0 && installedStarterCount >= starterCount;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="font-medium">Marketing MCP Catalog</span>
              <Badge variant="outline" className="text-xs">
                {catalog.length} servers
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Preconfigured marketing MCPs. Install an entry to create a disabled server row; add
              your API secrets and then enable it.
            </p>
          </div>
          <Button
            onClick={onInstallStarter}
            disabled={isStarterPending || starterFullyInstalled}
          >
            {starterFullyInstalled
              ? "Starter pack installed"
              : isStarterPending
                ? "Installing…"
                : `Install Starter Pack (${starterCount})`}
          </Button>
        </div>

        <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Hide catalog" : "Browse full catalog"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            {CATEGORY_ORDER.map((category) => {
              const entries = grouped.get(category);
              if (!entries || entries.length === 0) return null;
              return (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {entries.map((entry) => {
                      const installed = installedKeys.has(entry.key);
                      const installing = installingKey === entry.key;
                      return (
                        <div
                          key={entry.key}
                          className="flex items-start justify-between gap-3 rounded-md border p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">{entry.name}</span>
                              {entry.isStarterPack ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  starter
                                </Badge>
                              ) : null}
                              {entry.status === "experimental" ? (
                                <Badge variant="outline" className="text-[10px]">
                                  experimental
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-[10px]">
                                {entry.transport}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {entry.description}
                            </p>
                            <a
                              href={entry.docsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-[11px] text-primary underline"
                            >
                              docs
                            </a>
                          </div>
                          <Button
                            size="sm"
                            variant={installed ? "outline" : "default"}
                            disabled={installed || installing}
                            onClick={() => onInstall(entry.key)}
                          >
                            {installed ? (
                              <>
                                <Check className="mr-1 h-3 w-3" />
                                Installed
                              </>
                            ) : installing ? (
                              "Installing…"
                            ) : (
                              "Install"
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function McpServers() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(() => emptyForm());
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<CompanyMcpServer | null>(null);
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm());
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CompanyMcpServer | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "MCP Servers" }]);
  }, [setBreadcrumbs]);

  const { data: servers, isLoading, error } = useQuery({
    queryKey: queryKeys.mcpServers.list(selectedCompanyId!),
    queryFn: () => mcpServersApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: secrets } = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId!),
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.list(selectedCompanyId!) });

  const { data: catalog } = useQuery({
    queryKey: queryKeys.mcpServers.catalog,
    queryFn: () => mcpServersApi.listCatalog(),
  });

  const installedCatalogKeys = useMemo(() => {
    const set = new Set<string>();
    for (const server of servers ?? []) {
      if (server.catalogKey) set.add(server.catalogKey);
    }
    return set;
  }, [servers]);

  const installCatalogMutation = useMutation({
    mutationFn: (catalogKey: string) =>
      mcpServersApi.installFromCatalog(selectedCompanyId!, catalogKey),
    onSuccess: (created) => {
      pushToast({ title: `Installed ${created.name}`, body: "Set your secrets and enable it.", tone: "success" });
      void invalidate();
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Install failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: (id: string) => mcpServersApi.testConnection(id),
    onSuccess: (result, id) => {
      if (result.status === "healthy") {
        pushToast({ title: "Connection healthy", tone: "success" });
      } else {
        pushToast({
          title: "Connection failed",
          body: result.error ?? "Unknown error",
          tone: "error",
        });
      }
      void invalidate();
      void id;
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Test failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const starterPackMutation = useMutation({
    mutationFn: () => mcpServersApi.installStarterPack(selectedCompanyId!),
    onSuccess: (result) => {
      const installedCount = result.installed.length;
      const skippedCount = result.skipped.length;
      pushToast({
        title: `Starter pack installed: ${installedCount} added`,
        body: skippedCount > 0 ? `${skippedCount} already present, skipped.` : "Configure their secrets to enable.",
        tone: "success",
      });
      void invalidate();
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Starter pack install failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const { payload, error: validationError } = formToPayload(createForm);
      if (validationError) throw new Error(validationError);
      return mcpServersApi.create(selectedCompanyId!, payload!);
    },
    onSuccess: () => {
      pushToast({ title: "MCP server created", tone: "success" });
      setCreateOpen(false);
      setCreateForm(emptyForm());
      setCreateError(null);
      void invalidate();
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof Error ? err.message : String(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      const { payload, error: validationError } = formToPayload(editForm);
      if (validationError) throw new Error(validationError);
      return mcpServersApi.update(editTarget.id, payload!);
    },
    onSuccess: () => {
      pushToast({ title: "MCP server updated", tone: "success" });
      setEditTarget(null);
      setEditError(null);
      void invalidate();
    },
    onError: (err: unknown) => {
      setEditError(err instanceof Error ? err.message : String(err));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => mcpServersApi.remove(id),
    onSuccess: () => {
      pushToast({ title: "MCP server deleted", tone: "success" });
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err: unknown) => {
      pushToast({ title: "Failed to delete", body: err instanceof Error ? err.message : String(err), tone: "error" });
    },
  });

  const sortedServers = useMemo(() => {
    if (!servers) return [];
    return [...servers].sort((a, b) => a.name.localeCompare(b.name));
  }, [servers]);

  if (!selectedCompanyId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <p className="p-4 text-sm text-destructive">
        Failed to load MCP servers: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MCP Servers</h1>
          <p className="text-sm text-muted-foreground">
            Central registry of Model Context Protocol servers. Agents opt in per-agent from their
            config page.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateForm(emptyForm());
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New MCP server
        </Button>
      </div>

      {catalog && catalog.length > 0 ? (
        <McpCatalogSection
          catalog={catalog}
          installedKeys={installedCatalogKeys}
          onInstall={(key) => installCatalogMutation.mutate(key)}
          onInstallStarter={() => starterPackMutation.mutate()}
          installingKey={installCatalogMutation.isPending ? installCatalogMutation.variables ?? null : null}
          isStarterPending={starterPackMutation.isPending}
        />
      ) : null}

      {sortedServers.length === 0 ? (
        <EmptyState
          icon={Plug}
          message="No MCP servers yet. Add your first server to make MCP tools available to agents in this company."
          action="New MCP server"
          onAction={() => {
            setCreateForm(emptyForm());
            setCreateError(null);
            setCreateOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-3">
          {sortedServers.map((server) => (
            <Card key={server.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusDot server={server} />
                    <span className="font-medium">{server.name}</span>
                    <Badge variant="outline">{server.transport}</Badge>
                    {server.enabled ? (
                      <Badge variant="secondary">enabled</Badge>
                    ) : (
                      <Badge variant="outline">disabled</Badge>
                    )}
                    {server.catalogKey ? (
                      <Badge variant="outline" className="text-xs">
                        <Package className="mr-1 h-3 w-3" />
                        catalog
                      </Badge>
                    ) : null}
                  </div>
                  {server.description ? (
                    <p className="text-sm text-muted-foreground">{server.description}</p>
                  ) : null}
                  <p className="font-mono text-xs text-muted-foreground">
                    {server.transport === "stdio"
                      ? `${server.command ?? ""}${server.args && server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}`
                      : server.url ?? ""}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={testConnectionMutation.isPending}
                      onClick={() => testConnectionMutation.mutate(server.id)}
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      Test connection
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditTarget(server);
                        setEditForm(serverToForm(server));
                        setEditError(null);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteTarget(server)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ServerFormDialog
        open={createOpen}
        title="New MCP server"
        submitLabel="Create"
        form={createForm}
        setForm={setCreateForm}
        error={createError}
        secrets={secrets}
        onClose={() => setCreateOpen(false)}
        onSubmit={() => createMutation.mutate()}
        isPending={createMutation.isPending}
      />

      <ServerFormDialog
        open={!!editTarget}
        title={`Edit ${editTarget?.name ?? ""}`}
        submitLabel="Save"
        form={editForm}
        setForm={setEditForm}
        error={editError}
        secrets={secrets}
        onClose={() => setEditTarget(null)}
        onSubmit={() => updateMutation.mutate()}
        isPending={updateMutation.isPending}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => (v ? undefined : setDeleteTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MCP server?</DialogTitle>
            <DialogDescription>
              This removes <span className="font-medium">{deleteTarget?.name}</span>. Agents that
              currently opt in will no longer see it on their next run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && removeMutation.mutate(deleteTarget.id)}
              disabled={removeMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
