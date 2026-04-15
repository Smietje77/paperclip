import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS } from "../data-handlers.js";
import type { PersistedRunScore } from "../persistence.js";
import { computeScoreStats, tallyFlags } from "./flag-stats.js";
import { ScoreSparkline } from "./ScoreSparkline.js";

interface AgentScoreTrendProps {
  readonly agentId: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 50;

const containerStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(12rem, 1fr) minmax(12rem, 1fr)",
  padding: "1rem",
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  background: "white",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0.5rem",
  fontSize: "0.875rem",
};

const statLabel: React.CSSProperties = { color: "#6b7280", fontSize: "0.75rem" };

export function AgentScoreTrend({ agentId, limit = DEFAULT_LIMIT }: AgentScoreTrendProps) {
  const { data, loading, error } = usePluginData<PersistedRunScore[]>(DATA_KEYS.scoreHistory, {
    agentId,
    limit,
  });

  if (loading) return <div>Loading trend…</div>;
  if (error) return <div style={{ color: "#b91c1c" }}>Failed to load trend: {error.message}</div>;
  if (!data || data.length === 0) {
    return <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Not enough data for a trend yet.</div>;
  }

  const stats = computeScoreStats(data);
  const flags = tallyFlags(data).slice(0, 5);
  const samples = data.map((record) => ({ recordedAt: record.recordedAt, score: record.score }));

  return (
    <div style={containerStyle}>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <strong style={{ fontSize: "0.875rem" }}>Score trend</strong>
        <ScoreSparkline samples={samples} />
        {stats && (
          <div style={statsGrid}>
            <div>
              <div style={statLabel}>Runs</div>
              <div>{stats.sampleCount}</div>
            </div>
            <div>
              <div style={statLabel}>Average</div>
              <div>{stats.average}</div>
            </div>
            <div>
              <div style={statLabel}>Min</div>
              <div>{stats.min}</div>
            </div>
            <div>
              <div style={statLabel}>Max</div>
              <div>{stats.max}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <strong style={{ fontSize: "0.875rem" }}>Top flags</strong>
        {flags.length === 0 ? (
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>No flags raised.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.25rem" }}>
            {flags.map((entry) => (
              <li
                key={entry.flag}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.875rem",
                  padding: "0.25rem 0.5rem",
                  background: "#f9fafb",
                  borderRadius: "0.25rem",
                }}
              >
                <span>{entry.flag}</span>
                <span style={{ color: "#6b7280" }}>{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
