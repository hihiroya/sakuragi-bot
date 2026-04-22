import type { AgendaEvent } from "./domain.js";
import {
  DEFAULT_MESSAGE_TEMPLATE,
  renderTemplate,
  type MessageTemplate
} from "./messageTemplate.js";

export const TZ = "Asia/Tokyo";

export type EventFormatOptions = {
  includeLocationAddress?: boolean;
};

export type EventLayout = "compact" | "expanded";

type EventDisplayKind =
  | "singleAllDay"
  | "multiDayAllDay"
  | "singleTimed"
  | "multiDayTimed"
  | "untimed";

type EventSpan = {
  dateRange: string;
  dayIndex: number;
  totalDays: number;
  remainingDays: number;
};

type EventDisplayModel = {
  title: string;
  kind: EventDisplayKind;
  dateLabel?: string;
  dateTime?: string;
  timeLabel?: string;
  dateTimeRangeLabel?: string;
  span?: EventSpan;
  location?: string;
  description?: string;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

/**
 * 通常予定を Discord 投稿用に整形する。
 *
 * compact は複数予定向けの 1 行表示、expanded は通常予定が 1 件だけの日に使う詳細表示です。
 */
export function formatAgendaEvent(
  event: AgendaEvent,
  {
    dateLabel,
    layout = "compact",
    template = DEFAULT_MESSAGE_TEMPLATE,
    options = {}
  }: {
    dateLabel?: string;
    layout?: EventLayout;
    template?: MessageTemplate;
    options?: EventFormatOptions;
  } = {}
): string {
  const model = toEventDisplayModel(event, dateLabel, options);
  return layout === "expanded"
    ? renderExpandedEvent(model, template)
    : renderCompactEvent(model, template);
}

function toEventDisplayModel(
  event: AgendaEvent,
  dateLabel: string | undefined,
  options: EventFormatOptions
): EventDisplayModel {
  const location = event.location
    ? normalizeLocation(event.location, options)
    : undefined;
  const description = event.description
    ? truncateDescription(event.description)
    : undefined;
  const allDaySpan = event.startDate
    ? buildAllDaySpan(event.startDate, event.endDate, dateLabel)
    : undefined;

  if (allDaySpan && allDaySpan.totalDays > 1) {
    return {
      title: event.title,
      kind: "multiDayAllDay",
      span: allDaySpan,
      location,
      description
    };
  }

  if (event.startDate) {
    return {
      title: event.title,
      kind: "singleAllDay",
      dateLabel: formatMonthDay(event.startDate),
      location,
      description
    };
  }

  if (event.startDateTime) {
    const dateTimeRange = buildDateTimeRange(event.startDateTime, event.endDateTime);
    return {
      title: event.title,
      kind: dateTimeRange.isMultiDay ? "multiDayTimed" : "singleTimed",
      dateTime: event.startDateTime,
      timeLabel: TIME_FORMATTER.format(new Date(event.startDateTime)),
      dateTimeRangeLabel: dateTimeRange.label,
      location,
      description
    };
  }

  return {
    title: event.title,
    kind: "untimed",
    location,
    description
  };
}

function renderCompactEvent(model: EventDisplayModel, template: MessageTemplate): string {
  const details = renderCompactDetails(model, template);

  switch (model.kind) {
    case "multiDayAllDay":
      return renderTemplate(template.multiDayAllDayEventLine, {
        title: model.title,
        dateRange: model.span!.dateRange,
        details
      });
    case "singleAllDay":
      return renderTemplate(template.allDayEventLine, {
        title: model.title,
        details
      });
    case "singleTimed":
      return renderTemplate(template.timedEventLine, {
        title: model.title,
        details,
        time: DATE_TIME_FORMATTER.format(new Date(model.dateTime!))
      });
    case "multiDayTimed":
      return renderTemplate(template.multiDayTimedEventLine, {
        title: model.title,
        dateTimeRange: model.dateTimeRangeLabel!,
        details
      });
    case "untimed":
      return renderTemplate(template.untimedEventLine, {
        title: model.title,
        details
      });
  }
}

function renderExpandedEvent(model: EventDisplayModel, template: MessageTemplate): string {
  const lines: string[] = [];

  switch (model.kind) {
    case "multiDayAllDay":
      lines.push(renderTemplate(template.expandedAllDayEventTitleLine, { title: model.title }));
      lines.push(renderTemplate(getProgressLineTemplate(model, template), {
        dayIndex: model.span!.dayIndex,
        totalDays: model.span!.totalDays,
        remainingDays: model.span!.remainingDays
      }));
      lines.push(renderTemplate(template.expandedDateRangeLine, { dateRange: model.span!.dateRange }));
      break;
    case "singleAllDay":
      lines.push(renderTemplate(template.expandedAllDayEventTitleLine, { title: model.title }));
      lines.push(renderTemplate(template.expandedDateLine, { date: model.dateLabel! }));
      break;
    case "singleTimed":
      lines.push(renderTemplate(template.expandedTimedEventTitleLine, { title: model.title }));
      lines.push(renderTemplate(template.expandedTimeLine, { time: model.timeLabel! }));
      break;
    case "multiDayTimed":
      lines.push(renderTemplate(template.expandedTimedEventTitleLine, { title: model.title }));
      lines.push(renderTemplate(template.expandedDateTimeRangeLine, {
        dateTimeRange: model.dateTimeRangeLabel!
      }));
      break;
    case "untimed":
      lines.push(renderTemplate(template.expandedUntimedEventTitleLine, { title: model.title }));
      break;
  }

  if (model.location) {
    lines.push(renderTemplate(template.expandedLocationLine, { location: model.location }));
  }
  if (model.description) {
    lines.push(renderTemplate(template.expandedDescriptionLine, { description: model.description }));
  }

  return lines.join("\n");
}

function getProgressLineTemplate(model: EventDisplayModel, template: MessageTemplate): string {
  return model.span!.remainingDays === 1
    ? template.expandedFinalDayProgressLine
    : template.expandedProgressLine;
}

function renderCompactDetails(model: EventDisplayModel, template: MessageTemplate): string {
  let details = "";
  if (model.location) {
    details += renderTemplate(template.locationDetail, { location: model.location });
  }
  if (model.description) {
    details += renderTemplate(template.descriptionDetail, { description: model.description });
  }
  return details;
}

function buildAllDaySpan(
  startDate: string,
  endDate: string | undefined,
  targetDate: string | undefined
): EventSpan | undefined {
  const rawInclusiveEndDate = toInclusiveAllDayEndDate(endDate);
  const inclusiveEndDate = rawInclusiveEndDate && daysBetween(startDate, rawInclusiveEndDate) >= 0
    ? rawInclusiveEndDate
    : startDate;
  const totalDays = daysBetween(startDate, inclusiveEndDate) + 1;
  const currentDate = targetDate ?? startDate;
  const dayIndex = clamp(daysBetween(startDate, currentDate) + 1, 1, totalDays);
  const remainingDays = clamp(daysBetween(currentDate, inclusiveEndDate) + 1, 1, totalDays);

  return {
    dateRange: `${formatMonthDay(startDate)}〜${formatMonthDay(inclusiveEndDate)}`,
    dayIndex,
    totalDays,
    remainingDays
  };
}

function buildDateTimeRange(startDateTime: string, endDateTime: string | undefined) {
  if (!endDateTime) {
    return {
      isMultiDay: false,
      label: startDateTime
    };
  }

  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const startDate = toJstDateLabel(start);
  const endDate = toJstDateLabel(end);

  if (startDate === endDate) {
    return {
      isMultiDay: false,
      label: startDateTime
    };
  }

  return {
    isMultiDay: true,
    label: `${formatMonthDay(startDate)} ${TIME_FORMATTER.format(start)}〜${formatMonthDay(endDate)} ${TIME_FORMATTER.format(end)}`
  };
}

function toInclusiveAllDayEndDate(endDate: string | undefined): string | undefined {
  if (!endDate) {
    return undefined;
  }

  const date = parseDateLabelAsUtc(endDate);
  date.setUTCDate(date.getUTCDate() - 1);
  return toUtcDateLabel(date);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = parseDateLabelAsUtc(startDate);
  const end = parseDateLabelAsUtc(endDate);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function formatMonthDay(dateLabel: string): string {
  const [, month, day] = dateLabel.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function toJstDateLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find(part => part.type === "year")!.value;
  const month = parts.find(part => part.type === "month")!.value;
  const day = parts.find(part => part.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

function parseDateLabelAsUtc(dateLabel: string): Date {
  return new Date(`${dateLabel}T00:00:00.000Z`);
}

function toUtcDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeLocation(location: string, options: EventFormatOptions): string {
  return options.includeLocationAddress
    ? location
    : removeJapaneseAddressSuffix(location);
}

function truncateDescription(description: string): string {
  return description.length > 100
    ? description.substring(0, 100) + "..."
    : description;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function removeJapaneseAddressSuffix(location: string): string {
  for (const separator of location.matchAll(/[,，]/g)) {
    const suffix = location.slice(separator.index + separator[0].length).trim();
    const place = location.slice(0, separator.index).trim();
    if (place && isJapaneseAddressSuffix(suffix)) {
      return place;
    }
  }
  return location;
}

const JAPANESE_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県"
];

const POSTAL_CODE_PATTERN = /^(?:日本[、，]?\s*〒?\d{3}-?\d{4}|〒\d{3}-?\d{4})/;

function isJapaneseAddressSuffix(value: string): boolean {
  if (POSTAL_CODE_PATTERN.test(value)) {
    return true;
  }

  const withoutCountry = value.replace(/^日本[、，]?\s*/, "");
  return JAPANESE_PREFECTURES.some(prefecture => withoutCountry.startsWith(prefecture));
}
