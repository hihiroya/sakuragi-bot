import type { AgendaEvent, TodayRange } from "./domain.js";

export const TZ = "Asia/Tokyo";
export const MAX_DISCORD_CONTENT = 2000;

/**
 * JST における今日の開始・終了時刻を返す。
 */
export function getTodayRange(now = new Date()): TodayRange {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  const start = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    label: `${y}-${m}-${d}`
  };
}

const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

/**
 * 通常予定を Discord 投稿用の 1 行へ整形する。
 */
export function formatEvent(event: AgendaEvent): string {
  const fullTitle = appendEventDetails(event.title, event);

  if (event.startDate) {
    return `・📅 ${fullTitle}`;
  }
  if (event.startDateTime) {
    const t = formatter.format(new Date(event.startDateTime));
    return `・🕒️ ${t}: ${fullTitle}`;
  }
  return `・${fullTitle}`;
}

/**
 * 誕生日予定を祝福文つきの 1 行へ整形する。
 */
export function formatBirthday(event: AgendaEvent): string {
  return `・🎂 ${appendEventDetails(event.title, event)} おめでとうございます`;
}

/**
 * Discord webhook の文字数制限に収まる予定投稿を生成する。
 */
export function buildMessage(
  events: AgendaEvent[],
  label: string
): string {
  if (events.length === 0) {
    return `おはようございます。\n${label} の予定はありません。`;
  }

  const baseLines: string[] = [
    "おはようございます。",
    `${label} の予定です。`
  ];

  return buildLimitedMessage(baseLines, buildSections(events));
}

function buildSections(events: AgendaEvent[]) {
  const birthdays = events
    .filter(event => event.isBirthday)
    .map(formatBirthday);
  const normals = events
    .filter(event => !event.isBirthday)
    .map(formatEvent);

  return [
    { header: "🎉 本日の誕生日", lines: birthdays },
    { header: "📅 本日の予定", lines: normals }
  ];
}

function buildLimitedMessage(
  baseLines: string[],
  sections: Array<{ header: string; lines: string[] }>
): string {
  const outputLines = [...baseLines];
  const includedEventLineIndexes: number[] = [];
  let omitted = 0;

  for (const section of sections) {
    let headerAdded = false;

    for (const line of section.lines) {
      const nextLines = headerAdded ? [line] : ["", section.header, line];

      if (canAppend(outputLines, nextLines)) {
        if (!headerAdded) {
          outputLines.push("", section.header);
          headerAdded = true;
        }
        includedEventLineIndexes.push(outputLines.length);
        outputLines.push(line);
      } else {
        omitted += 1;
      }
    }
  }

  if (omitted > 0) {
    appendOmissionLine(outputLines, includedEventLineIndexes, omitted);
  }

  return outputLines.join("\n");
}

function appendEventDetails(title: string, event: AgendaEvent): string {
  let details = "";
  if (event.location) details += ` (📍: ${event.location})`;
  if (event.description) {
    const comment = event.description.length > 100 ? event.description.substring(0, 100) + "..." : event.description;
    details += ` (💬: ${comment})`;
  }
  return title + details;
}

function appendOmissionLine(
  outputLines: string[],
  includedEventLineIndexes: number[],
  initialOmitted: number
) {
  let omitted = initialOmitted;
  let omissionLine = buildOmissionLine(omitted);

  // 省略表示そのものが上限を超えないよう、末尾の予定を削って枠を空ける。
  while (!canAppend(outputLines, [omissionLine]) && includedEventLineIndexes.length > 0) {
    const index = includedEventLineIndexes.pop()!;
    outputLines.splice(index, 1);
    omitted += 1;
    omissionLine = buildOmissionLine(omitted);
  }

  if (canAppend(outputLines, [omissionLine])) {
    outputLines.push(omissionLine);
  }
}

function canAppend(lines: string[], nextLines: string[]): boolean {
  return [...lines, ...nextLines].join("\n").length <= MAX_DISCORD_CONTENT;
}

function buildOmissionLine(count: number): string {
  return `...他 ${count} 件の予定があります`;
}
