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

type MessageLayout = "compact" | "expanded";

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
  return formatBirthdayEvent(event, "compact", template, options);
}

function formatBirthdayEvent(
  event: AgendaEvent,
  layout: MessageLayout,
  template: MessageTemplate,
  options: MessageOptions
): string {
  const name = extractBirthdayName(event.title);
  const values = {
    title: event.title,
    name,
    details: appendEventDetails(event, template, options)
  };

  if (layout === "compact") {
    return renderTemplate(template.birthdayLine, values);
  }

  const lines = [
    renderTemplate(template.expandedBirthdayTitleLine, values),
    renderTemplate(template.expandedBirthdayMessageLine, values),
    renderTemplate(template.expandedBirthdayWishLine, values)
  ];

  const location = getDisplayLocation(event, options);
  if (location) {
    lines.push(renderTemplate(template.expandedBirthdayLocationLine, {
      title: event.title,
      name,
      location
    }));
  }

  const description = getDisplayDescription(event);
  if (description) {
    lines.push(renderTemplate(template.expandedBirthdayDescriptionLine, {
      title: event.title,
      name,
      description
    }));
  }

  return lines.join("\n");
}

function extractBirthdayName(title: string): string {
  const name = title
    .replace(/(?:の)?誕生日/g, "")
    .replace(/\bBirthday\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return name.length > 0 ? name : title;
}

function getDisplayLocation(event: AgendaEvent, options: MessageOptions): string | undefined {
  if (!event.location) {
    return undefined;
  }

  return options.includeLocationAddress
    ? event.location
    : removeJapaneseAddressSuffix(event.location);
}

function getDisplayDescription(event: AgendaEvent): string | undefined {
  if (!event.description) {
    return undefined;
  }

  return event.description.length > 100
    ? event.description.substring(0, 100) + "..."
    : event.description;
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
  const birthdayEvents = events.filter(event => event.isBirthday);
  const birthdayLayout = birthdayEvents.length === 1 ? "expanded" : "compact";
  const birthdays = birthdayEvents.map(event =>
    formatBirthdayEvent(event, birthdayLayout, template, options)
  );
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
  const location = getDisplayLocation(event, options);
  if (location) {
    details += renderTemplate(template.locationDetail, { location });
  }
  const description = getDisplayDescription(event);
  if (description) {
    details += renderTemplate(template.descriptionDetail, { description });
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
