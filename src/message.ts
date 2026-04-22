import type { AgendaEvent, TodayRange } from "./domain.js";
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

const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

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
  const details = appendEventDetails(event, template, options);

  if (event.startDate) {
    return renderTemplate(template.allDayEventLine, {
      title: event.title,
      details
    });
  }
  if (event.startDateTime) {
    const t = formatter.format(new Date(event.startDateTime));
    return renderTemplate(template.timedEventLine, {
      title: event.title,
      details,
      time: t
    });
  }
  return renderTemplate(template.untimedEventLine, {
    title: event.title,
    details
  });
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

  return buildLimitedMessage(baseLines, buildSections(events, template, options), template);
}

function buildSections(events: AgendaEvent[], template: MessageTemplate, options: MessageOptions) {
  const birthdays = events
    .filter(event => event.isBirthday)
    .map(event => formatBirthday(event, template, options));
  const normals = events
    .filter(event => !event.isBirthday)
    .map(event => formatEvent(event, template, options));

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
