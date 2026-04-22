import { describe, expect, it, vi } from "vitest";
import {
  type CalendarClient,
  createGoogleCalendarClient,
  listAgendaEvents,
  listGoogleCalendarEvents,
  normalizeCalendarDescription,
  normalizeGoogleRedirectLinks,
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
                description: "<b>祝う</b>",
                start: { date: "2026-04-19" },
                end: { date: "2026-04-20" }
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
        endDate: "2026-04-20",
        startDateTime: undefined,
        endDateTime: undefined,
        location: "体育館",
        description: "祝う",
        isBirthday: true
      }
    ]);
  });
});

describe("normalizeGoogleRedirectLinks", () => {
  it("Google redirect URL から q パラメータの元 URL を取り出す", () => {
    expect(normalizeGoogleRedirectLinks(
      "詳細 https://www.google.com/url?q=https://www.animatecafe.jp/event/ac000755&sa=D&source=calendar"
    )).toBe("詳細 https://www.animatecafe.jp/event/ac000755");
  });

  it("q パラメータがない Google URL はそのまま残す", () => {
    expect(normalizeGoogleRedirectLinks("https://www.google.com/url?sa=D"))
      .toBe("https://www.google.com/url?sa=D");
  });
});

describe("normalizeCalendarDescription", () => {
  it("HTML entity を復号し、タグを除去して、Google redirect URL を正規化する", () => {
    expect(normalizeCalendarDescription(
      "<p>詳細はこちら<br><a href=\"https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fevent%3Fa%3D1%26b%3D2&amp;sa=D\">リンク</a></p>"
    )).toBe("詳細はこちら\nリンク");
  });

  it("プレーンテキスト内の Google redirect URL も正規化する", () => {
    expect(normalizeCalendarDescription(
      "URL: https://www.google.com/url?q=https://www.animatecafe.jp/event/ac000755&amp;sa=D&amp;source=calendar"
    )).toBe("URL: https://www.animatecafe.jp/event/ac000755");
  });

  it("空文字やタグだけの場合は undefined を返す", () => {
    expect(normalizeCalendarDescription(" <br> ")).toBeUndefined();
    expect(normalizeCalendarDescription(undefined)).toBeUndefined();
  });
});

describe("toAgendaEvent", () => {
  it("summary がない予定は無題として扱う", () => {
    expect(toAgendaEvent({})).toEqual({
      title: "無題",
      startDate: undefined,
      endDate: undefined,
      startDateTime: undefined,
      endDateTime: undefined,
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
      endDate: undefined,
      startDateTime: "2026-04-19T09:30:00+09:00",
      endDateTime: undefined,
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
