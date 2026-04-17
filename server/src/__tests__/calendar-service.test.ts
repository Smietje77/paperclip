import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  issues,
  projects,
  routineRuns,
  routineTriggers,
  routines,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { calendarService } from "../services/calendar.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres calendar service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("calendar service", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-calendar-service-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const projectId = randomUUID();
    const routineId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Test Co",
      issuePrefix: "TST",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Bot",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "P",
      status: "in_progress",
    });
    await db.insert(routines).values({
      id: routineId,
      companyId,
      projectId,
      title: "Daily sync",
      assigneeAgentId: agentId,
      status: "active",
    });

    return { companyId, agentId, projectId, routineId };
  }

  it("projects daily scheduled routine runs inside the window", async () => {
    const { companyId, routineId } = await seed();
    await db.insert(routineTriggers).values({
      companyId,
      routineId,
      kind: "schedule",
      enabled: true,
      cronExpression: "0 9 * * *",
      timezone: "UTC",
    });

    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

    const svc = calendarService(db);
    const events = await svc.listEvents({ companyId, from, to });

    const scheduled = events.filter((e) => e.type === "routine_scheduled");
    expect(scheduled.length).toBeGreaterThanOrEqual(6);
    expect(scheduled.length).toBeLessThanOrEqual(8);
    for (const event of scheduled) {
      expect(event.title).toBe("Daily sync");
      expect(new Date(event.start).getUTCHours()).toBe(9);
      expect(new Date(event.start).getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(new Date(event.start).getTime()).toBeLessThanOrEqual(to.getTime());
    }
  });

  it("returns historical routine runs and issue lifecycle events inside the window", async () => {
    const { companyId, routineId, projectId } = await seed();
    const triggeredAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const completedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(routineRuns).values({
      companyId,
      routineId,
      source: "manual",
      status: "issue_created",
      triggeredAt,
      completedAt,
    });

    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      title: "Finish the task",
      status: "done",
      priority: "medium",
      identifier: "TST-1",
      startedAt: new Date(Date.now() - 90 * 60 * 1000),
      completedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const svc = calendarService(db);
    const events = await svc.listEvents({ companyId, from, to });

    const runEvents = events.filter((e) => e.type === "routine_run");
    expect(runEvents).toHaveLength(1);
    expect(runEvents[0]?.status).toBe("succeeded");
    expect(runEvents[0]?.end).toBe(completedAt.toISOString());

    const startedEvents = events.filter((e) => e.type === "issue_started");
    const completedEvents = events.filter((e) => e.type === "issue_completed");
    expect(startedEvents).toHaveLength(1);
    expect(completedEvents).toHaveLength(1);
    expect(startedEvents[0]?.title).toContain("TST-1");
  });

  it("filters by event types when requested", async () => {
    const { companyId, routineId } = await seed();
    await db.insert(routineTriggers).values({
      companyId,
      routineId,
      kind: "schedule",
      enabled: true,
      cronExpression: "0 9 * * *",
      timezone: "UTC",
    });

    const from = new Date();
    const to = new Date(from.getTime() + 3 * 24 * 60 * 60 * 1000);

    const svc = calendarService(db);
    const onlyScheduled = await svc.listEvents({
      companyId,
      from,
      to,
      types: ["routine_scheduled"],
    });

    expect(onlyScheduled.every((e) => e.type === "routine_scheduled")).toBe(true);
    expect(onlyScheduled.length).toBeGreaterThan(0);

    const onlyIssues = await svc.listEvents({
      companyId,
      from,
      to,
      types: ["issue_started"],
    });
    expect(onlyIssues).toHaveLength(0);
  });

  it("ignores disabled routine triggers", async () => {
    const { companyId, routineId } = await seed();
    await db.insert(routineTriggers).values({
      companyId,
      routineId,
      kind: "schedule",
      enabled: false,
      cronExpression: "0 9 * * *",
      timezone: "UTC",
    });

    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

    const svc = calendarService(db);
    const events = await svc.listEvents({ companyId, from, to });
    expect(events.filter((e) => e.type === "routine_scheduled")).toHaveLength(0);
  });
});
