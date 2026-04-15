import { useState } from "react";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { AgentScoreCard } from "./AgentScoreCard.js";
import { AgentScoreHistory } from "./AgentScoreHistory.js";
import { AgentScoreTrend } from "./AgentScoreTrend.js";
import { AgentSelector } from "./AgentSelector.js";

const pageStyle: React.CSSProperties = {
  padding: "1.5rem",
  display: "grid",
  gap: "1rem",
  maxWidth: "72rem",
};

const manualInputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  minWidth: "24rem",
};

const placeholderStyle: React.CSSProperties = {
  padding: "1rem",
  borderRadius: "0.5rem",
  background: "#f3f4f6",
  color: "#6b7280",
  fontSize: "0.875rem",
};

/**
 * Agent Coach dashboard page.
 *
 * When the host provides a `companyId`, render a dropdown of agents populated
 * from `ctx.agents.list`. Otherwise fall back to a manual UUID input so the
 * page stays usable in contexts without a scoped company (e.g. instance-wide
 * launchers).
 */
export function AgentCoachPage({ context }: PluginPageProps) {
  const [agentId, setAgentId] = useState<string>("");
  const trimmed = agentId.trim();
  const companyId = context.companyId ?? null;

  return (
    <section aria-label="Agent Coach dashboard" style={pageStyle}>
      <header>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>Agent Coach</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#6b7280" }}>
          Per-agent run scores, rolling trends, and (soon) improvement suggestions.
        </p>
      </header>

      <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.875rem" }}>
        <span>Agent</span>
        {companyId ? (
          <AgentSelector companyId={companyId} value={agentId} onChange={setAgentId} />
        ) : (
          <input
            type="text"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="Paste an agent UUID"
            style={manualInputStyle}
          />
        )}
      </label>

      {trimmed ? (
        <>
          <AgentScoreCard agentId={trimmed} />
          <AgentScoreTrend agentId={trimmed} />
          <AgentScoreHistory agentId={trimmed} />
        </>
      ) : (
        <div style={placeholderStyle}>Select an agent to see its scores.</div>
      )}
    </section>
  );
}
