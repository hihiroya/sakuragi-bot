import { describe, expect, it, vi } from "vitest";
import {
  type CalendarClient,
  createGoogleCalendarClient,
  listAgendaEvents,
  listGoogleCalendarEvents,
  toAgendaEvent
} from "../src/calendar.js";

describe("listGoogleCalendarEvents", () => {
  it("JST の当日範囲で Google Calendar から予定を取得する", async () => {
    const events = [{ summary: "朝会" }];
    const list = vi.fn(async () => ({ data: { items: events } }));
    const calendar: CalendarClient = { events: { list } };

    await expect(listGoogleCalendarEvents(calendar, {
      calendarId: "calendar-id",
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z"
    })).resolves.toEqual(events);

    expect(list).toHaveBeenCalledWith({
      calendarId: "calendar-id",
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z",
      singleEvents: true,
      orderBy: "startTime"
    });
  });

  it("Google Calendar の予定が undefined の場合は空配列を返す", async () => {
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: {} }))
      }
    };

    await expect(listGoogleCalendarEvents(calendar, {
      calendarId: "calendar-id",
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z"
    })).resolves.toEqual([]);
  });
});

describe("listAgendaEvents", () => {
  it("Google Calendar の予定をアプリ内部の予定型へ変換して返す", async () => {
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({
          data: {
            items: [
              {
                summary: "花道 誕生日",
                location: "体育館",
                description: "祝う",
                start: { date: "2026-04-19" }
              }
            ]
          }
        }))
      }
    };

    await expect(listAgendaEvents(calendar, "calendar-id", {
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z"
    })).resolves.toEqual([
      {
        title: "花道 誕生日",
        startDate: "2026-04-19",
        startDateTime: undefined,
        location: "体育館",
        description: "祝う",
        isBirthday: true
      }
    ]);
  });
});

describe("toAgendaEvent", () => {
  it("summary がない予定は無題として扱う", () => {
    expect(toAgendaEvent({})).toEqual({
      title: "無題",
      startDate: undefined,
      startDateTime: undefined,
      location: undefined,
      description: undefined,
      isBirthday: false
    });
  });

  it("誕生日を含む予定を誕生日イベントとして扱う", () => {
    expect(toAgendaEvent({
      summary: "佐倉さん 誕生日",
      start: { dateTime: "2026-04-19T09:30:00+09:00" }
    })).toEqual({
      title: "佐倉さん 誕生日",
      startDate: undefined,
      startDateTime: "2026-04-19T09:30:00+09:00",
      location: undefined,
      description: undefined,
      isBirthday: true
    });
  });
});

describe("createGoogleCalendarClient", () => {
  it("Google Calendar client を生成する", () => {
    const calendar = createGoogleCalendarClient({
      clientEmail: "bot@example.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n"
    });

    expect(calendar.events.list).toEqual(expect.any(Function));
  });
});
