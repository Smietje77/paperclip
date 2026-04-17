import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from "@paperclipai/shared";
import { calendarService, CALENDAR_MAX_WINDOW_DAYS } from "../services/calendar.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(raw: unknown, field: string): Date {
  if (typeof raw !== "string" || raw.length === 0) {
    throw badRequest(`Query param "${field}" is required`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`Query param "${field}" must be a valid ISO-8601 date`);
  }
  return date;
}

function parseTypes(raw: unknown): CalendarEventType[] | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw badRequest(`Query param "types" must be a comma-separated string`);
  }
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = new Set<string>(CALENDAR_EVENT_TYPES);
  const invalid = parts.filter((p) => !allowed.has(p));
  if (invalid.length > 0) {
    throw badRequest(`Unknown calendar event type(s): ${invalid.join(", ")}`);
  }
  return parts as CalendarEventType[];
}

export function calendarRoutes(db: Db) {
  const router = Router();
  const svc = calendarService(db);

  router.get("/companies/:companyId/calendar", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const from = parseIsoDate(req.query.from, "from");
    const to = parseIsoDate(req.query.to, "to");
    if (to.getTime() < from.getTime()) {
      throw badRequest(`Query param "to" must be >= "from"`);
    }
    const windowDays = (to.getTime() - from.getTime()) / MS_PER_DAY;
    if (windowDays > CALENDAR_MAX_WINDOW_DAYS) {
      throw badRequest(
        `Calendar window must be ${CALENDAR_MAX_WINDOW_DAYS} days or fewer (got ${windowDays.toFixed(1)})`,
      );
    }
    const types = parseTypes(req.query.types);

    const events = await svc.listEvents({ companyId, from, to, types });
    res.json(events);
  });

  return router;
}
