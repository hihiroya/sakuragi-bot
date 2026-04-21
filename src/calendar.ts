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
    description: normalizeCalendarDescription(event.description),
    isBirthday: title.includes("誕生日")
  };
}

/**
 * Google Calendar の description を Discord 投稿向けのプレーンテキストへ整える。
 */
export function normalizeCalendarDescription(description: string | null | undefined): string | undefined {
  if (!description) {
    return undefined;
  }

  const decoded = decodeHtmlEntities(description);
  const withoutTags = stripHtmlTags(decoded);
  const normalizedLinks = normalizeGoogleRedirectLinks(withoutTags);
  const normalizedWhitespace = normalizedLinks
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalizedWhitespace.length > 0 ? normalizedWhitespace : undefined;
}

export function normalizeGoogleRedirectLinks(text: string): string {
  return text.replace(/https:\/\/www\.google\.com\/url\?[^\s<>"')]+/g, match => {
    try {
      const url = new URL(match);
      const target = url.searchParams.get("q");
      return target || match;
    } catch {
      return match;
    }
  });
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}
