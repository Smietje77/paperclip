import type { CalendarEvent, CalendarEventType } from "@paperclipai/shared";
import { api } from "./client";

export interface ListCalendarParams {
  from: string;
  to: string;
  types?: readonly CalendarEventType[];
}

export const calendarApi = {
  list: (companyId: string, params: ListCalendarParams) => {
    const search = new URLSearchParams();
    search.set("from", params.from);
    search.set("to", params.to);
    if (params.types && params.types.length > 0) {
      search.set("types", params.types.join(","));
    }
    return api.get<CalendarEvent[]>(
      `/companies/${companyId}/calendar?${search.toString()}`,
    );
  },
};
