import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCalendarService = vi.hoisted(() => ({
  listEvents: vi.fn(),
}));

function registerRouteMocks() {
  vi.doMock("../services/calendar.js", () => ({
    calendarService: () => mockCalendarService,
    CALENDAR_MAX_WINDOW_DAYS: 93,
  }));
}

async function createApp() {
  const [{ errorHandler }, { calendarRoutes }] = await Promise.all([
    import("../middleware/index.js"),
    import("../routes/calendar.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", calendarRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("calendar routes", () => {
  beforeEach(() => {
    vi.resetModules();
    registerRouteMocks();
    vi.clearAllMocks();
  });

  it("returns events for an authorized company", async () => {
    mockCalendarService.listEvents.mockResolvedValue([
      {
        id: "routine_scheduled:t1:2026-04-20T09:00:00.000Z",
        type: "routine_scheduled",
        title: "Morning standup",
        start: "2026-04-20T09:00:00.000Z",
        status: "scheduled",
        entityKind: "routine",
        entityId: "r1",
      },
    ]);

    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=2026-04-20T00:00:00.000Z&to=2026-04-27T00:00:00.000Z",
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockCalendarService.listEvents).toHaveBeenCalledWith({
      companyId: "company-1",
      from: new Date("2026-04-20T00:00:00.000Z"),
      to: new Date("2026-04-27T00:00:00.000Z"),
      types: undefined,
    });
  });

  it("rejects requests for a company the caller cannot access", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-2/calendar?from=2026-04-20T00:00:00.000Z&to=2026-04-27T00:00:00.000Z",
    );

    expect(res.status).toBe(403);
    expect(mockCalendarService.listEvents).not.toHaveBeenCalled();
  });

  it("rejects missing from/to params", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/calendar");

    expect(res.status).toBe(400);
    expect(mockCalendarService.listEvents).not.toHaveBeenCalled();
  });

  it("rejects invalid ISO dates", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=not-a-date&to=2026-04-27T00:00:00.000Z",
    );

    expect(res.status).toBe(400);
  });

  it("rejects windows exceeding the max", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=2026-01-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z",
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Calendar window must be 93 days or fewer/);
  });

  it("rejects to < from", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=2026-04-27T00:00:00.000Z&to=2026-04-20T00:00:00.000Z",
    );

    expect(res.status).toBe(400);
  });

  it("parses comma-separated types and forwards them", async () => {
    mockCalendarService.listEvents.mockResolvedValue([]);
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=2026-04-20T00:00:00.000Z&to=2026-04-27T00:00:00.000Z&types=routine_scheduled,issue_started",
    );

    expect(res.status).toBe(200);
    expect(mockCalendarService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ["routine_scheduled", "issue_started"],
      }),
    );
  });

  it("rejects unknown event types", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/calendar?from=2026-04-20T00:00:00.000Z&to=2026-04-27T00:00:00.000Z&types=routine_scheduled,bogus_type",
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bogus_type/);
    expect(mockCalendarService.listEvents).not.toHaveBeenCalled();
  });
});
