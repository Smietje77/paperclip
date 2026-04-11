import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  CompanyMcpServer,
  CompanySecret,
  CreateMcpServer,
  EnvBinding,
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
                    <span className="font-medium">{server.name}</span>
                    <Badge variant="outline">{server.transport}</Badge>
                    {server.enabled ? (
                      <Badge variant="secondary">enabled</Badge>
                    ) : (
                      <Badge variant="outline">disabled</Badge>
                    )}
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
