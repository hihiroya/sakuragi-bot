import { google, type calendar_v3 } from "googleapis";
import type { ServiceAccountCredentials } from "./config.js";
import type { AgendaEvent, TodayRange } from "./domain.js";

export type CalendarClient = {
  events: {
    list(params: calendar_v3.Params$Resource$Events$List): Promise<{
      data: {
        items?: calendar_v3.Schema$Event[];
      };
    }>;
  };
};

/**
 * Google Calendar API クライアントを作成する。
 *
 * Google 固有の認証処理をこのファイルへ閉じ込めることで、日次処理本体を
 * 「予定を取得する」以上の詳細から切り離します。
 */
export function createGoogleCalendarClient(credentials: ServiceAccountCredentials): CalendarClient {
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
  });

  return google.calendar({ version: "v3", auth });
}

/**
 * 指定日の予定を Google Calendar から取得し、アプリ内部の予定型へ変換する。
 *
 * Google API 型から AgendaEvent へ変換して返すことで、呼び出し元は外部 API の
 * nullable なレスポンス形状を意識せずに済みます。
 */
export async function listAgendaEvents(
  calendar: CalendarClient,
  calendarId: string,
  range: Pick<TodayRange, "timeMin" | "timeMax">
): Promise<AgendaEvent[]> {
  const googleEvents = await listGoogleCalendarEvents(calendar, {
    calendarId,
    timeMin: range.timeMin,
    timeMax: range.timeMax
  });

  return googleEvents.map(toAgendaEvent);
}

/**
 * Google Calendar API の list 呼び出しを薄く包む。
 *
 * API パラメータの固定値をここで管理し、テストでは「常に開始時刻順の単発イベント」
 * として取得していることを検証しやすくします。
 */
export async function listGoogleCalendarEvents(
  calendar: CalendarClient,
  {
    calendarId,
    timeMin,
    timeMax
  }: Pick<calendar_v3.Params$Resource$Events$List, "calendarId" | "timeMin" | "timeMax">
): Promise<calendar_v3.Schema$Event[]> {
  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime"
  });
  return response.data.items ?? [];
}

/**
 * Google Calendar の予定を投稿本文用のドメイン型へ変換する。
 *
 * 誕生日判定は現在の運用ルールに合わせ、予定タイトルに「誕生日」を含むかで判定します。
 */
export function toAgendaEvent(event: calendar_v3.Schema$Event): AgendaEvent {
  const title = event.summary ?? "無題";

  return {
    title,
    startDate: event.start?.date ?? undefined,
    startDateTime: event.start?.dateTime ?? undefined,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    isBirthday: title.includes("誕生日")
  };
}
