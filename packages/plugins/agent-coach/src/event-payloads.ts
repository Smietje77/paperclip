/**
 * Shape of the `agent.run.*` plugin event payloads emitted by the server
 * heartbeat service.
 *
 * These events are produced from `activity-log.logActivity` when a
 * `heartbeat_runs` row transitions to a terminal status. The payload mirrors
 * the `details` object supplied to `logActivity`, plus the shared `runId` and
 * `agentId` fields appended by the activity-log writer.
 *
 * Keep this module free of runtime dependencies so it can be shared with
 * tests that construct synthetic events.
 */

import type { RunStatus } from "./scoring.js";

export interface AgentRunEventPayload {
  readonly agentId: string | null;
  readonly runId: string | null;
  readonly status: string;
  readonly invocationSource: string | null;
  readonly triggerDetail: string | null;
  readonly error: string | null;
  readonly errorCode: string | null;
  readonly exitCode: number | null;
  readonly processLossRetryCount: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
}

/**
 * Narrow a raw event payload to {@link AgentRunEventPayload}. Returns null
 * when the payload is malformed — callers should treat this as "skip the
 * event" rather than throwing to avoid poisoning the event bus.
 */
export function parseAgentRunEventPayload(raw: unknown): AgentRunEventPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (typeof status !== "string" || status.length === 0) return null;
  return {
    agentId: typeof record.agentId === "string" ? record.agentId : null,
    runId: typeof record.runId === "string" ? record.runId : null,
    status,
    invocationSource: typeof record.invocationSource === "string" ? record.invocationSource : null,
    triggerDetail: typeof record.triggerDetail === "string" ? record.triggerDetail : null,
    error: typeof record.error === "string" ? record.error : null,
    errorCode: typeof record.errorCode === "string" ? record.errorCode : null,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    processLossRetryCount:
      typeof record.processLossRetryCount === "number" ? record.processLossRetryCount : 0,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    finishedAt: typeof record.finishedAt === "string" ? record.finishedAt : null,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
  };
}

/**
 * Map a raw heartbeat run status string to the scoring module's internal
 * {@link RunStatus} enum. Unknown statuses fall back to "error" so the coach
 * errs on the side of flagging the run rather than silently ignoring it.
 */
export function toScoringStatus(status: string): RunStatus {
  switch (status) {
    case "success":
      return "success";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "error":
    default:
      return "error";
  }
}
