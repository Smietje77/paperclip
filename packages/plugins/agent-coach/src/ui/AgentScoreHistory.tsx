import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS } from "../data-handlers.js";
import type { PersistedRunScore } from "../persistence.js";

interface AgentScoreHistoryProps {
  readonly agentId: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 20;

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
};

const cellStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #f3f4f6",
  textAlign: "left",
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: "#374151",
  background: "#f9fafb",
};

export function AgentScoreHistory({ agentId, limit = DEFAULT_LIMIT }: AgentScoreHistoryProps) {
  const { data, loading, error } = usePluginData<PersistedRunScore[]>(DATA_KEYS.scoreHistory, {
    agentId,
    limit,
  });

  if (loading) return <div>Loading history…</div>;
  if (error) return <div style={{ color: "#b91c1c" }}>Failed to load history: {error.message}</div>;
  if (!data || data.length === 0) return <div>No historical scores recorded.</div>;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", overflow: "hidden" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerCellStyle}>Run</th>
            <th style={headerCellStyle}>Status</th>
            <th style={headerCellStyle}>Score</th>
            <th style={headerCellStyle}>Flags</th>
            <th style={headerCellStyle}>When</th>
          </tr>
        </thead>
        <tbody>
          {data.map((record) => (
            <tr key={record.runId}>
              <td style={cellStyle}>
                <code>{record.runId.slice(0, 8)}</code>
              </td>
              <td style={cellStyle}>{record.status}</td>
              <td style={cellStyle}>{record.score}</td>
              <td style={cellStyle}>{record.flags.join(", ") || "—"}</td>
              <td style={cellStyle}>{new Date(record.recordedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
