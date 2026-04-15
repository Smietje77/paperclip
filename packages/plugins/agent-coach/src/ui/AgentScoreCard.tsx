import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS } from "../data-handlers.js";
import type { PersistedRunScore } from "../persistence.js";

interface AgentScoreCardProps {
  readonly agentId: string;
}

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  borderRadius: "0.5rem",
  border: "1px solid #e5e7eb",
  background: "white",
  display: "grid",
  gap: "0.5rem",
};

const metaStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#6b7280",
};

function scoreTone(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 50) return "#b45309";
  return "#b91c1c";
}

export function AgentScoreCard({ agentId }: AgentScoreCardProps) {
  const { data, loading, error } = usePluginData<PersistedRunScore | null>(DATA_KEYS.latestScore, {
    agentId,
  });

  if (loading) {
    return <div style={cardStyle}>Loading latest score…</div>;
  }
  if (error) {
    return (
      <div style={{ ...cardStyle, color: "#b91c1c" }}>
        Failed to load score: {error.message}
      </div>
    );
  }
  if (!data) {
    return <div style={cardStyle}>No scored runs yet for this agent.</div>;
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
        <strong style={{ fontSize: "2rem", color: scoreTone(data.score) }}>{data.score}</strong>
        <span style={metaStyle}>of 100</span>
      </div>
      <div style={{ display: "flex", gap: "1rem", fontSize: "0.875rem" }}>
        <span>Success {data.dimensions.success}</span>
        <span>Reliability {data.dimensions.reliability}</span>
        <span>Cost {data.dimensions.cost}</span>
      </div>
      {data.flags.length > 0 && (
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {data.flags.map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: "0.75rem",
                padding: "0.125rem 0.5rem",
                borderRadius: "0.25rem",
                background: "#fef3c7",
                color: "#92400e",
              }}
            >
              {flag}
            </span>
          ))}
        </div>
      )}
      <div style={metaStyle}>
        Run <code>{data.runId.slice(0, 8)}</code> · status {data.status} ·
        recorded {new Date(data.recordedAt).toLocaleString()}
      </div>
      {data.rubric && (
        <div
          style={{
            marginTop: "0.25rem",
            padding: "0.75rem",
            background: "#f9fafb",
            borderRadius: "0.375rem",
            display: "grid",
            gap: "0.375rem",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <strong style={{ color: scoreTone(data.rubric.score) }}>LLM rubric {data.rubric.score}</strong>
            <span style={metaStyle}>of 100</span>
          </div>
          {data.rubric.rationale && (
            <div style={{ color: "#374151" }}>{data.rubric.rationale}</div>
          )}
          {data.rubric.suggestions.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#374151" }}>
              {data.rubric.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!data.rubric && data.rubricFailure && (
        <div style={{ ...metaStyle, fontStyle: "italic" }}>
          LLM evaluator unavailable: {data.rubricFailure}
        </div>
      )}
    </div>
  );
}
