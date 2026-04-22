import fs from "fs";
import path from "path";

export type MessageTemplate = {
  greeting: string;
  noEventsLine: string;
  agendaLine: string;
  birthdayHeader: string;
  agendaHeader: string;
  birthdayLine: string;
  expandedBirthdayTitleLine: string;
  expandedBirthdayMessageLine: string;
  expandedBirthdayWishLine: string;
  expandedBirthdayLocationLine: string;
  expandedBirthdayDescriptionLine: string;
  allDayEventLine: string;
  multiDayAllDayEventLine: string;
  timedEventLine: string;
  multiDayTimedEventLine: string;
  untimedEventLine: string;
  locationDetail: string;
  descriptionDetail: string;
  expandedAllDayEventTitleLine: string;
  expandedTimedEventTitleLine: string;
  expandedUntimedEventTitleLine: string;
  expandedProgressLine: string;
  expandedFinalDayProgressLine: string;
  expandedDateLine: string;
  expandedDateRangeLine: string;
  expandedTimeLine: string;
  expandedDateTimeRangeLine: string;
  expandedLocationLine: string;
  expandedDescriptionLine: string;
  omissionLine: string;
};

export const DEFAULT_MESSAGE_TEMPLATE: MessageTemplate = {
  greeting: "おはようございます。",
  noEventsLine: "{{date}} の予定はありません。",
  agendaLine: "{{date}} の予定です。",
  birthdayHeader: "🎉🎂 本日の誕生日 🎂🎉",
  agendaHeader: "📅 本日の予定",
  birthdayLine: "・🎂 {{name}}、お誕生日おめでとうございます！ 🎊{{details}}",
  expandedBirthdayTitleLine: "🎂✨ {{name}} ✨🎂",
  expandedBirthdayMessageLine: "　🎊 お誕生日おめでとうございます！",
  expandedBirthdayWishLine: "　🎁 素敵な一年になりますように",
  expandedBirthdayLocationLine: "　📍 {{location}}",
  expandedBirthdayDescriptionLine: "　💬 {{description}}",
  allDayEventLine: "・📅 {{title}}{{details}}",
  multiDayAllDayEventLine: "・📅 {{title}}　📅 {{dateRange}}{{details}}",
  timedEventLine: "・🕒️ {{time}}: {{title}}{{details}}",
  multiDayTimedEventLine: "・🕒️ {{dateTimeRange}}: {{title}}{{details}}",
  untimedEventLine: "・{{title}}{{details}}",
  locationDetail: " (📍: {{location}})",
  descriptionDetail: " (💬: {{description}})",
  expandedAllDayEventTitleLine: "・📅 {{title}}",
  expandedTimedEventTitleLine: "・🕒️ {{title}}",
  expandedUntimedEventTitleLine: "・{{title}}",
  expandedProgressLine: "　⏳ {{dayIndex}}日目 / 全{{totalDays}}日（残り{{remainingDays}}日）",
  expandedFinalDayProgressLine: "　⏳ {{dayIndex}}日目 / 全{{totalDays}}日（最終日）",
  expandedDateLine: "　📅 {{date}}",
  expandedDateRangeLine: "　📅 {{dateRange}}",
  expandedTimeLine: "　🕒 {{time}}",
  expandedDateTimeRangeLine: "　📅 {{dateTimeRange}}",
  expandedLocationLine: "　📍 {{location}}",
  expandedDescriptionLine: "　💬 {{description}}",
  omissionLine: "...他 {{count}} 件の予定があります"
};

export function loadMessageTemplate(
  templatePath = path.resolve(process.cwd(), "message-template.json"),
  fileSystem: Pick<typeof fs, "existsSync" | "readFileSync"> = fs,
  onError?: (error: unknown) => void
): MessageTemplate {
  try {
    if (!fileSystem.existsSync(templatePath)) {
      return DEFAULT_MESSAGE_TEMPLATE;
    }

    const raw = fileSystem.readFileSync(templatePath, "utf-8");
    return validateMessageTemplate(JSON.parse(raw), templatePath);
  } catch (error) {
    onError?.(error);
    return DEFAULT_MESSAGE_TEMPLATE;
  }
}

export function validateMessageTemplate(raw: unknown, name = "message-template.json"): MessageTemplate {
  if (!isRecord(raw)) {
    throw new Error(`${name} は JSON object である必要があります。`);
  }

  const template = { ...DEFAULT_MESSAGE_TEMPLATE };
  for (const key of Object.keys(DEFAULT_MESSAGE_TEMPLATE) as Array<keyof MessageTemplate>) {
    const value = raw[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`${name}.${key} は文字列である必要があります。`);
    }

    if (!isBlankTemplateValue(value)) {
      template[key] = value;
    }
  }

  return template;
}

export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlankTemplateValue(value: string): boolean {
  return value.replace(/[ \t\r\n]+/g, "").length === 0;
}
