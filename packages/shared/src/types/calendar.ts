export type CalendarEventType =
  | "routine_scheduled"
  | "routine_run"
  | "plugin_job_scheduled"
  | "plugin_job_run"
  | "agent_wakeup"
  | "issue_started"
  | "issue_completed";

export type CalendarEventStatus =
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "coalesced";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  start: string;
  end?: string;
  status?: CalendarEventStatus;
  entityKind: "routine" | "plugin_job" | "agent_wakeup" | "issue";
  entityId: string;
  href?: string;
  meta?: Record<string, unknown>;
}

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
  "routine_scheduled",
  "routine_run",
  "plugin_job_scheduled",
  "plugin_job_run",
  "agent_wakeup",
  "issue_started",
  "issue_completed",
] as const;
