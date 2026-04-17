import { and, eq, gte, lte, isNotNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentWakeupRequests,
  issues,
  pluginJobs,
  pluginJobRuns,
  plugins,
  routineRuns,
  routineTriggers,
  routines,
} from "@paperclipai/db";
import type {
  CalendarEvent,
  CalendarEventStatus,
  CalendarEventType,
} from "@paperclipai/shared";
import { parseCron, nextCronTick, validateCron } from "./cron.js";
import { nextCronTickInTimeZone } from "./routines.js";
import { logger } from "../middleware/logger.js";

export const CALENDAR_MAX_WINDOW_DAYS = 93;
const PROJECTION_CAP_PER_TRIGGER = 200;

export interface ListCalendarEventsInput {
  companyId: string;
  from: Date;
  to: Date;
  types?: ReadonlyArray<CalendarEventType>;
}

function includeType(
  type: CalendarEventType,
  filter: ReadonlyArray<CalendarEventType> | undefined,
): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.includes(type);
}

function mapRoutineRunStatus(status: string): CalendarEventStatus {
  switch (status) {
    case "issue_created":
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "coalesced":
      return "coalesced";
    case "received":
    case "processing":
      return "running";
    default:
      return "scheduled";
  }
}

function mapPluginRunStatus(status: string): CalendarEventStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
    default:
      return "scheduled";
  }
}

function mapWakeupStatus(status: string): CalendarEventStatus {
  switch (status) {
    case "finished":
      return "succeeded";
    case "claimed":
    case "processing":
      return "running";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function projectCronRuns(
  expression: string,
  timezone: string | null,
  from: Date,
  to: Date,
): Date[] {
  const trimmed = expression.trim();
  if (validateCron(trimmed)) return [];

  const starts: Date[] = [];
  let cursor = new Date(Math.max(from.getTime() - 60_000, Date.now() - 60_000));

  for (let i = 0; i < PROJECTION_CAP_PER_TRIGGER; i += 1) {
    const next = timezone
      ? nextCronTickInTimeZone(trimmed, timezone, cursor)
      : nextCronTick(parseCron(trimmed), cursor);
    if (!next) break;
    if (next.getTime() > to.getTime()) break;
    if (next.getTime() >= from.getTime()) {
      starts.push(next);
    }
    cursor = next;
  }

  return starts;
}

export function calendarService(db: Db) {
  return {
    async listEvents(input: ListCalendarEventsInput): Promise<CalendarEvent[]> {
      const { companyId, from, to, types } = input;
      const events: CalendarEvent[] = [];

      // ---- Routines: historical runs ----
      if (includeType("routine_run", types)) {
        const rows = await db
          .select({
            run: routineRuns,
            routine: routines,
          })
          .from(routineRuns)
          .innerJoin(routines, eq(routineRuns.routineId, routines.id))
          .where(
            and(
              eq(routineRuns.companyId, companyId),
              gte(routineRuns.triggeredAt, from),
              lte(routineRuns.triggeredAt, to),
            ),
          );

        for (const row of rows) {
          events.push({
            id: `routine_run:${row.run.id}`,
            type: "routine_run",
            title: row.routine.title,
            start: row.run.triggeredAt.toISOString(),
            end: row.run.completedAt?.toISOString(),
            status: mapRoutineRunStatus(row.run.status),
            entityKind: "routine",
            entityId: row.routine.id,
            href: `/routines/${row.routine.id}`,
            meta: { source: row.run.source, runId: row.run.id },
          });
        }
      }

      // ---- Routines: projected runs ----
      if (includeType("routine_scheduled", types) && to.getTime() >= Date.now()) {
        const rows = await db
          .select({
            trigger: routineTriggers,
            routine: routines,
          })
          .from(routineTriggers)
          .innerJoin(routines, eq(routineTriggers.routineId, routines.id))
          .where(
            and(
              eq(routineTriggers.companyId, companyId),
              eq(routineTriggers.enabled, true),
              eq(routineTriggers.kind, "schedule"),
              isNotNull(routineTriggers.cronExpression),
              isNotNull(routineTriggers.timezone),
            ),
          );

        const projectionStart = new Date(Math.max(from.getTime(), Date.now()));
        for (const row of rows) {
          const cron = row.trigger.cronExpression;
          const tz = row.trigger.timezone;
          if (!cron || !tz) continue;
          try {
            const starts = projectCronRuns(cron, tz, projectionStart, to);
            for (const start of starts) {
              events.push({
                id: `routine_scheduled:${row.trigger.id}:${start.toISOString()}`,
                type: "routine_scheduled",
                title: row.routine.title,
                start: start.toISOString(),
                status: "scheduled",
                entityKind: "routine",
                entityId: row.routine.id,
                href: `/routines/${row.routine.id}`,
                meta: { cron, timezone: tz, triggerId: row.trigger.id },
              });
            }
          } catch (err) {
            logger.warn(
              { err, triggerId: row.trigger.id, cron, tz },
              "calendar: failed to project routine trigger",
            );
          }
        }
      }

      // ---- Plugin jobs: historical runs (instance-level, shown on every company) ----
      if (includeType("plugin_job_run", types)) {
        const rows = await db
          .select({
            run: pluginJobRuns,
            job: pluginJobs,
            plugin: plugins,
          })
          .from(pluginJobRuns)
          .innerJoin(pluginJobs, eq(pluginJobRuns.jobId, pluginJobs.id))
          .innerJoin(plugins, eq(pluginJobs.pluginId, plugins.id))
          .where(
            and(
              isNotNull(pluginJobRuns.startedAt),
              or(
                and(
                  gte(pluginJobRuns.startedAt, from),
                  lte(pluginJobRuns.startedAt, to),
                ),
              ),
            ),
          );

        for (const row of rows) {
          if (!row.run.startedAt) continue;
          events.push({
            id: `plugin_job_run:${row.run.id}`,
            type: "plugin_job_run",
            title: `${row.plugin.pluginKey} · ${row.job.jobKey}`,
            start: row.run.startedAt.toISOString(),
            end: row.run.finishedAt?.toISOString(),
            status: mapPluginRunStatus(row.run.status),
            entityKind: "plugin_job",
            entityId: row.job.id,
            href: `/plugins/${row.plugin.id}`,
            meta: { trigger: row.run.trigger, pluginKey: row.plugin.pluginKey },
          });
        }
      }

      // ---- Plugin jobs: projected runs ----
      if (
        includeType("plugin_job_scheduled", types) &&
        to.getTime() >= Date.now()
      ) {
        const rows = await db
          .select({ job: pluginJobs, plugin: plugins })
          .from(pluginJobs)
          .innerJoin(plugins, eq(pluginJobs.pluginId, plugins.id))
          .where(eq(pluginJobs.status, "active"));

        const projectionStart = new Date(Math.max(from.getTime(), Date.now()));
        for (const row of rows) {
          if (!row.job.schedule) continue;
          try {
            const starts = projectCronRuns(row.job.schedule, null, projectionStart, to);
            for (const start of starts) {
              events.push({
                id: `plugin_job_scheduled:${row.job.id}:${start.toISOString()}`,
                type: "plugin_job_scheduled",
                title: `${row.plugin.pluginKey} · ${row.job.jobKey}`,
                start: start.toISOString(),
                status: "scheduled",
                entityKind: "plugin_job",
                entityId: row.job.id,
                href: `/plugins/${row.plugin.id}`,
                meta: { schedule: row.job.schedule, pluginKey: row.plugin.pluginKey },
              });
            }
          } catch (err) {
            logger.warn(
              { err, jobId: row.job.id, schedule: row.job.schedule },
              "calendar: failed to project plugin job",
            );
          }
        }
      }

      // ---- Agent wakeups ----
      if (includeType("agent_wakeup", types)) {
        const rows = await db
          .select()
          .from(agentWakeupRequests)
          .where(
            and(
              eq(agentWakeupRequests.companyId, companyId),
              gte(agentWakeupRequests.requestedAt, from),
              lte(agentWakeupRequests.requestedAt, to),
            ),
          );

        for (const row of rows) {
          events.push({
            id: `agent_wakeup:${row.id}`,
            type: "agent_wakeup",
            title: row.reason ?? `Wakeup: ${row.source}`,
            start: row.requestedAt.toISOString(),
            end: row.finishedAt?.toISOString() ?? row.claimedAt?.toISOString(),
            status: mapWakeupStatus(row.status),
            entityKind: "agent_wakeup",
            entityId: row.id,
            href: `/agents/${row.agentId}`,
            meta: {
              source: row.source,
              triggerDetail: row.triggerDetail,
              agentId: row.agentId,
            },
          });
        }
      }

      // ---- Issue lifecycle ----
      const needStarted = includeType("issue_started", types);
      const needCompleted = includeType("issue_completed", types);
      if (needStarted || needCompleted) {
        const rows = await db
          .select()
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              or(
                and(
                  isNotNull(issues.startedAt),
                  gte(issues.startedAt, from),
                  lte(issues.startedAt, to),
                ),
                and(
                  isNotNull(issues.completedAt),
                  gte(issues.completedAt, from),
                  lte(issues.completedAt, to),
                ),
              ),
            ),
          );

        for (const row of rows) {
          const identifier = row.identifier ?? row.id.slice(0, 8);
          if (needStarted && row.startedAt && row.startedAt >= from && row.startedAt <= to) {
            events.push({
              id: `issue_started:${row.id}`,
              type: "issue_started",
              title: `${identifier} started`,
              start: row.startedAt.toISOString(),
              status: "running",
              entityKind: "issue",
              entityId: row.id,
              href: `/issues/${row.id}`,
              meta: { issueTitle: row.title, priority: row.priority },
            });
          }
          if (
            needCompleted &&
            row.completedAt &&
            row.completedAt >= from &&
            row.completedAt <= to
          ) {
            events.push({
              id: `issue_completed:${row.id}`,
              type: "issue_completed",
              title: `${identifier} completed`,
              start: row.completedAt.toISOString(),
              status: "succeeded",
              entityKind: "issue",
              entityId: row.id,
              href: `/issues/${row.id}`,
              meta: { issueTitle: row.title, priority: row.priority },
            });
          }
        }
      }

      events.sort((a, b) => a.start.localeCompare(b.start));
      return events;
    },
  };
}

export type CalendarService = ReturnType<typeof calendarService>;
