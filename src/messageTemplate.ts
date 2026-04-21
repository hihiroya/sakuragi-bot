import fs from "fs";
import path from "path";

export type MessageTemplate = {
  greeting: string;
  noEventsLine: string;
  agendaLine: string;
  birthdayHeader: string;
  agendaHeader: string;
  birthdayLine: string;
  allDayEventLine: string;
  timedEventLine: string;
  untimedEventLine: string;
  locationDetail: string;
  descriptionDetail: string;
  omissionLine: string;
};

export const DEFAULT_MESSAGE_TEMPLATE: MessageTemplate = {
  greeting: "おはようございます。",
  noEventsLine: "{{date}} の予定はありません。",
  agendaLine: "{{date}} の予定です。",
  birthdayHeader: "🎉 本日の誕生日",
  agendaHeader: "📅 本日の予定",
  birthdayLine: "・🎂 {{title}}{{details}} おめでとうございます",
  allDayEventLine: "・📅 {{title}}{{details}}",
  timedEventLine: "・🕒️ {{time}}: {{title}}{{details}}",
  untimedEventLine: "・{{title}}{{details}}",
  locationDetail: " (📍: {{location}})",
  descriptionDetail: " (💬: {{description}})",
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

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      template[key] = trimmed;
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
