import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as BigCalendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, subDays } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { CalendarDays } from "lucide-react";
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEvent,
  type CalendarEventType,
} from "@paperclipai/shared";
import { calendarApi } from "../api/calendar";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Link } from "@/lib/router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  routine_scheduled: "Routine (scheduled)",
  routine_run: "Routine run",
  plugin_job_scheduled: "Plugin job (scheduled)",
  plugin_job_run: "Plugin job run",
  agent_wakeup: "Agent wakeup",
  issue_started: "Issue started",
  issue_completed: "Issue completed",
};

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  routine_scheduled: "#2563eb",
  routine_run: "#1d4ed8",
  plugin_job_scheduled: "#9333ea",
  plugin_job_run: "#7e22ce",
  agent_wakeup: "#ea580c",
  issue_started: "#0891b2",
  issue_completed: "#16a34a",
};

interface BigEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: CalendarEvent;
}

function toBigEvent(event: CalendarEvent): BigEvent {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: event.id,
    title: event.title,
    start,
    end,
    resource: event,
  };
}

export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState<Date>(() => new Date());
  const [activeTypes, setActiveTypes] = useState<Set<CalendarEventType>>(
    () => new Set(CALENDAR_EVENT_TYPES),
  );
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Calendar" }]);
  }, [setBreadcrumbs]);

  const range = useMemo(() => {
    const from = subDays(date, 45);
    const to = addDays(date, 45);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [date]);

  const typesArray = useMemo(() => [...activeTypes].sort(), [activeTypes]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.calendar.list(selectedCompanyId!, range.from, range.to, typesArray),
    queryFn: () =>
      calendarApi.list(selectedCompanyId!, {
        from: range.from,
        to: range.to,
        types: typesArray as CalendarEventType[],
      }),
    enabled: !!selectedCompanyId && activeTypes.size > 0,
  });

  const bigEvents = useMemo(() => (data ?? []).map(toBigEvent), [data]);

  function toggleType(type: CalendarEventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message="Select a company to view its calendar." />;
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        {CALENDAR_EVENT_TYPES.map((type) => {
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
              style={{
                borderColor: EVENT_TYPE_COLORS[type],
                color: active ? "white" : EVENT_TYPE_COLORS[type],
                backgroundColor: active ? EVENT_TYPE_COLORS[type] : "transparent",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: active ? "white" : EVENT_TYPE_COLORS[type],
                }}
              />
              {EVENT_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isLoading && !data ? (
        <PageSkeleton variant="list" />
      ) : (
        <div className="flex-1 min-h-0 rounded-md border border-border bg-card p-2">
          <BigCalendar<BigEvent>
            localizer={localizer}
            events={bigEvents}
            startAccessor="start"
            endAccessor="end"
            views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            popup
            style={{ height: "100%", minHeight: 600 }}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: EVENT_TYPE_COLORS[event.resource.type],
                borderColor: EVENT_TYPE_COLORS[event.resource.type],
                color: "white",
                fontSize: "12px",
              },
            })}
            onSelectEvent={(event) => setSelected(event.resource)}
          />
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{EVENT_TYPE_LABELS[selected.type]}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3 text-sm">
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <span className="text-muted-foreground">Start</span>
                  <span>{new Date(selected.start).toLocaleString()}</span>
                  {selected.end && (
                    <>
                      <span className="text-muted-foreground">End</span>
                      <span>{new Date(selected.end).toLocaleString()}</span>
                    </>
                  )}
                  {selected.status && (
                    <>
                      <span className="text-muted-foreground">Status</span>
                      <span>{selected.status}</span>
                    </>
                  )}
                </div>
                {selected.meta && Object.keys(selected.meta).length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Details</div>
                    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                      {JSON.stringify(selected.meta, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.href && (
                  <Link
                    to={selected.href}
                    className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                    onClick={() => setSelected(null)}
                  >
                    Open {selected.entityKind.replace("_", " ")}
                  </Link>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
