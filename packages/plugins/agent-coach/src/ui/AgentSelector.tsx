import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS, type AgentListEntry } from "../data-handlers.js";

interface AgentSelectorProps {
  readonly companyId: string;
  readonly value: string;
  readonly onChange: (agentId: string) => void;
}

const selectStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  minWidth: "24rem",
  background: "white",
};

function formatOption(agent: AgentListEntry): string {
  const parts = [agent.name];
  if (agent.role) parts.push(`· ${agent.role}`);
  if (agent.status && agent.status !== "idle") parts.push(`· ${agent.status}`);
  return parts.join(" ");
}

export function AgentSelector({ companyId, value, onChange }: AgentSelectorProps) {
  const { data, loading, error } = usePluginData<AgentListEntry[]>(DATA_KEYS.agentList, {
    companyId,
  });

  if (loading) return <span style={{ fontSize: "0.875rem" }}>Loading agents…</span>;
  if (error) {
    return (
      <span style={{ fontSize: "0.875rem", color: "#b91c1c" }}>
        Failed to load agents: {error.message}
      </span>
    );
  }
  const agents = data ?? [];
  if (agents.length === 0) {
    return (
      <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
        No agents found in this company.
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={selectStyle}
    >
      <option value="">— Select an agent —</option>
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {formatOption(agent)}
        </option>
      ))}
    </select>
  );
}
