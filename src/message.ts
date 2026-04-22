import type { AgendaEvent, TodayRange } from "./domain.js";
import { formatAgendaEvent, removeJapaneseAddressSuffix } from "./eventFormat.js";
import {
  DEFAULT_MESSAGE_TEMPLATE,
  renderTemplate,
  type MessageTemplate
} from "./messageTemplate.js";

export const TZ = "Asia/Tokyo";
export const MAX_DISCORD_CONTENT = 2000;

export type MessageOptions = {
  includeLocationAddress?: boolean;
};

/**
 * JST における今日の開始・終了時刻を返す。
 */
export function getTodayRange(now = new Date()): TodayRange {
  const { y, m, d } = getJstDateParts(now);
  const start = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    label: `${y}-${m}-${d}`
  };
}

/**
 * JST における指定日の開始・終了時刻を返す。
 */
export function getDateRange(dateLabel: string): TodayRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) {
    throw new Error("--date は YYYY-MM-DD 形式で指定してください。");
  }

  const start = new Date(`${dateLabel}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("--date に有効な日付を指定してください。");
  }

  const { y, m, d } = getJstDateParts(start);
  const verified = `${y}-${m}-${d}`;
  if (verified !== dateLabel) {
    throw new Error("--date に有効な日付を指定してください。");
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    label: dateLabel
  };
}

function getJstDateParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  return {
    y: parts.find(p => p.type === "year")!.value,
    m: parts.find(p => p.type === "month")!.value,
    d: parts.find(p => p.type === "day")!.value
  };
}

/**
 * 通常予定を Discord 投稿用の 1 行へ整形する。
 */
export function formatEvent(
  event: AgendaEvent,
  template: MessageTemplate = DEFAULT_MESSAGE_TEMPLATE,
  options: MessageOptions = {}
): string {
  return formatAgendaEvent(event, { template, options });
}

/**
 * 誕生日予定を祝福文つきの 1 行へ整形する。
 */
export function formatBirthday(
  event: AgendaEvent,
  template: MessageTemplate = DEFAULT_MESSAGE_TEMPLATE,
  options: MessageOptions = {}
): string {
  return renderTemplate(template.birthdayLine, {
    title: event.title,
    details: appendEventDetails(event, template, options)
  });
}

/**
 * Discord webhook の文字数制限に収まる予定投稿を生成する。
 */
export function buildMessage(
  events: AgendaEvent[],
  label: string,
  template: MessageTemplate = DEFAULT_MESSAGE_TEMPLATE,
  options: MessageOptions = {}
): string {
  if (events.length === 0) {
    return [
      template.greeting,
      renderTemplate(template.noEventsLine, { date: label })
    ].join("\n");
  }

  const baseLines: string[] = [
    template.greeting,
    renderTemplate(template.agendaLine, { date: label })
  ];

  return buildLimitedMessage(baseLines, buildSections(events, label, template, options), template);
}

function buildSections(
  events: AgendaEvent[],
  label: string,
  template: MessageTemplate,
  options: MessageOptions
) {
  const birthdays = events
    .filter(event => event.isBirthday)
    .map(event => formatBirthday(event, template, options));
  const normalEvents = events.filter(event => !event.isBirthday);
  const normalLayout = normalEvents.length === 1 ? "expanded" : "compact";
  const normals = normalEvents.map(event =>
    formatAgendaEvent(event, {
      dateLabel: label,
      layout: normalLayout,
      template,
      options
    })
  );

  return [
    { header: template.birthdayHeader, lines: birthdays },
    { header: template.agendaHeader, lines: normals }
  ];
}

function buildLimitedMessage(
  baseLines: string[],
  sections: Array<{ header: string; lines: string[] }>,
  template: MessageTemplate
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
    appendOmissionLine(outputLines, includedEventLineIndexes, omitted, template);
  }

  return outputLines.join("\n");
}

function appendEventDetails(
  event: AgendaEvent,
  template: MessageTemplate,
  options: MessageOptions
): string {
  let details = "";
  if (event.location) {
    const location = options.includeLocationAddress
      ? event.location
      : removeJapaneseAddressSuffix(event.location);
    details += renderTemplate(template.locationDetail, { location });
  }
  if (event.description) {
    const comment = event.description.length > 100 ? event.description.substring(0, 100) + "..." : event.description;
    details += renderTemplate(template.descriptionDetail, { description: comment });
  }
  return details;
}

function appendOmissionLine(
  outputLines: string[],
  includedEventLineIndexes: number[],
  initialOmitted: number,
  template: MessageTemplate
) {
  let omitted = initialOmitted;
  let omissionLine = buildOmissionLine(omitted, template);

  // 省略表示そのものが上限を超えないよう、末尾の予定を削って枠を空ける。
  while (!canAppend(outputLines, [omissionLine]) && includedEventLineIndexes.length > 0) {
    const index = includedEventLineIndexes.pop()!;
    outputLines.splice(index, 1);
    omitted += 1;
    omissionLine = buildOmissionLine(omitted, template);
  }

  if (canAppend(outputLines, [omissionLine])) {
    outputLines.push(omissionLine);
  }
}

function canAppend(lines: string[], nextLines: string[]): boolean {
  return [...lines, ...nextLines].join("\n").length <= MAX_DISCORD_CONTENT;
}

function buildOmissionLine(count: number, template: MessageTemplate): string {
  return renderTemplate(template.omissionLine, { count });
}

export { removeJapaneseAddressSuffix } from "./eventFormat.js";
