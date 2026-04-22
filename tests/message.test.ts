import { describe, expect, it } from "vitest";
import {
  buildMessage,
  formatBirthday,
  formatEvent,
  getDateRange,
  getTodayRange,
  MAX_DISCORD_CONTENT
} from "../src/message.js";
import { DEFAULT_MESSAGE_TEMPLATE } from "../src/messageTemplate.js";

describe("getTodayRange", () => {
  it("JST の日付境界で当日範囲を返す", () => {
    const range = getTodayRange(new Date("2026-04-18T15:30:00.000Z"));

    expect(range).toEqual({
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z",
      label: "2026-04-19"
    });
  });
});

describe("getDateRange", () => {
  it("JST の指定日範囲を返す", () => {
    expect(getDateRange("2026-04-22")).toEqual({
      timeMin: "2026-04-21T15:00:00.000Z",
      timeMax: "2026-04-22T15:00:00.000Z",
      label: "2026-04-22"
    });
  });

  it("YYYY-MM-DD ではない日付指定はエラーを投げる", () => {
    expect(() => getDateRange("2026/04/22"))
      .toThrow("--date は YYYY-MM-DD 形式で指定してください。");
  });

  it("存在しない日付はエラーを投げる", () => {
    expect(() => getDateRange("2026-02-30"))
      .toThrow("--date に有効な日付を指定してください。");
  });
});

describe("formatEvent", () => {
  it("終日イベントを表示できる", () => {
    expect(formatEvent({
      title: "チーム休暇",
      startDate: "2026-04-19",
      isBirthday: false
    })).toBe("・📅 チーム休暇");
  });

  it("時刻付きイベントに場所と 100 文字で省略したコメントを含める", () => {
    const description = "あ".repeat(101);
    const line = formatEvent({
      title: "朝会",
      location: "会議室A",
      description,
      startDateTime: "2026-04-19T09:30:00+09:00",
      isBirthday: false
    });

    expect(line).toContain("朝会 (📍: 会議室A)");
    expect(line).toContain(`(💬: ${"あ".repeat(100)}...)`);
    expect(line).toMatch(/09:30/);
  });

  it("既定では Google Calendar が場所に付けた日本の住所を表示しない", () => {
    const line = formatEvent({
      title: "カフェコラボ",
      location: "アニメイトカフェスタンド池袋4号店, 日本、〒170-0013 東京都豊島区東池袋１丁目２３−５ オトメイトビル 1F",
      startDate: "2026-04-22",
      isBirthday: false
    });

    expect(line).toContain("(📍: アニメイトカフェスタンド池袋4号店)");
    expect(line).not.toContain("〒170-0013");
    expect(line).not.toContain("東京都豊島区");
  });

  it("郵便番号がない都道府県形式の住所も表示しない", () => {
    const line = formatEvent({
      title: "イベント",
      location: "イベントホール，東京都千代田区丸の内１丁目",
      startDate: "2026-04-22",
      isBirthday: false
    });

    expect(line).toContain("(📍: イベントホール)");
    expect(line).not.toContain("東京都千代田区");
  });

  it("includeLocationAddress が true の場合は場所の住所をそのまま表示する", () => {
    const line = formatEvent({
      title: "カフェコラボ",
      location: "アニメイトカフェスタンド池袋4号店, 日本、〒170-0013 東京都豊島区東池袋１丁目２３−５",
      startDate: "2026-04-22",
      isBirthday: false
    }, DEFAULT_MESSAGE_TEMPLATE, { includeLocationAddress: true });

    expect(line).toContain("アニメイトカフェスタンド池袋4号店, 日本、〒170-0013 東京都豊島区東池袋１丁目２３−５");
  });

  it("住所と判定できないカンマ区切りの場所補足は消さない", () => {
    const line = formatEvent({
      title: "打ち合わせ",
      location: "Zoom, 第2会議室",
      startDateTime: "2026-04-19T09:30:00+09:00",
      isBirthday: false
    });

    expect(line).toContain("(📍: Zoom, 第2会議室)");
  });

  it("テンプレートで通常予定の行を差し替えられる", () => {
    expect(formatEvent({
      title: "朝会",
      startDateTime: "2026-04-19T09:30:00+09:00",
      isBirthday: false
    }, {
      ...DEFAULT_MESSAGE_TEMPLATE,
      timedEventLine: "[{{time}}] {{title}}{{details}}"
    })).toMatch(/^\[.*09:30\] 朝会$/);
  });

  it("開始日時がないイベントもタイトルだけで表示する", () => {
    expect(formatEvent({ title: "無題", isBirthday: false })).toBe("・無題");
  });
});

describe("formatBirthday", () => {
  it("誕生日イベントを祝福文として表示する", () => {
    expect(formatBirthday({
      title: "佐倉さん 誕生日",
      location: "Slack",
      isBirthday: true
    })).toBe("・🎂 佐倉さん 誕生日 (📍: Slack) おめでとうございます");
  });
});

describe("buildMessage", () => {
  it("予定がない日は予定なしの本文を返す", () => {
    expect(buildMessage([], "2026-04-19"))
      .toBe("おはようございます。\n2026-04-19 の予定はありません。");
  });

  it("テンプレートで予定なし本文を差し替えられる", () => {
    expect(buildMessage([], "2026-04-19", {
      ...DEFAULT_MESSAGE_TEMPLATE,
      greeting: "お疲れさまです。",
      noEventsLine: "{{date}} は予定なしです。"
    })).toBe("お疲れさまです。\n2026-04-19 は予定なしです。");
  });

  it("誕生日と通常予定をセクション分けして表示する", () => {
    const message = buildMessage([
      { title: "花道 誕生日", startDate: "2026-04-19", isBirthday: true },
      { title: "練習", startDateTime: "2026-04-19T18:00:00+09:00", isBirthday: false }
    ], "2026-04-19");

    expect(message).toContain("🎉 本日の誕生日");
    expect(message).toContain("・🎂 花道 誕生日 おめでとうございます");
    expect(message).toContain("📅 本日の予定");
    expect(message).toContain("練習");
  });

  it("通常予定が1件だけの場合は終日予定を詳細表示する", () => {
    expect(buildMessage([{
      title: "チーム休暇",
      startDate: "2026-04-22",
      endDate: "2026-04-23",
      location: "自宅",
      description: "有給",
      isBirthday: false
    }], "2026-04-22")).toContain([
      "📅 本日の予定",
      "・📅 チーム休暇",
      "　📅 4/22",
      "　📍 自宅",
      "　💬 有給"
    ].join("\n"));
  });

  it("通常予定が1件だけの場合は時間付き予定を詳細表示する", () => {
    expect(buildMessage([{
      title: "朝会",
      startDateTime: "2026-04-22T09:30:00+09:00",
      location: "会議室A",
      isBirthday: false
    }], "2026-04-22")).toContain([
      "📅 本日の予定",
      "・🕒️ 朝会",
      "　🕒 09:30",
      "　📍 会議室A"
    ].join("\n"));
  });

  it("通常予定が1件だけの場合は複数日終日予定の進捗と期間を詳細表示する", () => {
    const message = buildMessage([{
      title: "アニメイトカフェコラボ",
      startDate: "2026-04-03",
      endDate: "2026-04-27",
      location: "アニメイトカフェスタンド池袋4号店",
      description: "https://www.animatecafe.jp/event/ac000755",
      isBirthday: false
    }], "2026-04-22");

    expect(message).toContain([
      "・📅 アニメイトカフェコラボ",
      "　⏳ 20日目 / 全24日（残り5日）",
      "　📅 4/3〜4/26",
      "　📍 アニメイトカフェスタンド池袋4号店",
      "　💬 https://www.animatecafe.jp/event/ac000755"
    ].join("\n"));
  });

  it("複数日終日予定の最終日は残り1日ではなく最終日として表示する", () => {
    const message = buildMessage([{
      title: "アニメイトカフェコラボ",
      startDate: "2026-04-03",
      endDate: "2026-04-27",
      isBirthday: false
    }], "2026-04-26");

    expect(message).toContain([
      "・📅 アニメイトカフェコラボ",
      "　⏳ 24日目 / 全24日（最終日）",
      "　📅 4/3〜4/26"
    ].join("\n"));
    expect(message).not.toContain("残り1日");
  });

  it("外部テンプレート読み込み後も詳細表示のインデントを保持する", () => {
    const message = buildMessage([{
      title: "アニメイトカフェコラボ",
      startDate: "2026-04-03",
      endDate: "2026-04-27",
      isBirthday: false
    }], "2026-04-22", {
      ...DEFAULT_MESSAGE_TEMPLATE,
      expandedAllDayEventTitleLine: "・⭐ {{title}}（〜4/26）",
      expandedProgressLine: "　⏳ {{dayIndex}}日目 / 全{{totalDays}}日（残り{{remainingDays}}日）",
      expandedDateRangeLine: "　📅 {{dateRange}}"
    });

    expect(message).toContain([
      "・⭐ アニメイトカフェコラボ（〜4/26）",
      "　⏳ 20日目 / 全24日（残り5日）",
      "　📅 4/3〜4/26"
    ].join("\n"));
  });

  it("通常予定が複数件ある場合は複数日終日予定を1行表示する", () => {
    const message = buildMessage([
      {
        title: "アニメイトカフェコラボ",
        startDate: "2026-04-03",
        endDate: "2026-04-27",
        location: "アニメイトカフェスタンド池袋4号店",
        description: "https://www.animatecafe.jp/event/ac000755",
        isBirthday: false
      },
      {
        title: "朝会",
        startDateTime: "2026-04-22T09:30:00+09:00",
        isBirthday: false
      }
    ], "2026-04-22", {
      ...DEFAULT_MESSAGE_TEMPLATE,
      agendaHeader: "📋 本日の予定",
      allDayEventLine: "・⭐ {{title}}{{details}}",
      multiDayAllDayEventLine: "・⭐ {{title}}　📅 {{dateRange}}{{details}}",
      timedEventLine: "・⏰ {{time}}: {{title}}{{details}}",
      descriptionDetail: "(💬: {{description}})"
    });

    expect(message).toContain("📋 本日の予定");
    expect(message).toContain(
      "・⭐ アニメイトカフェコラボ　📅 4/3〜4/26 (📍: アニメイトカフェスタンド池袋4号店)(💬: https://www.animatecafe.jp/event/ac000755)"
    );
    expect(message).toContain("・⏰ ");
  });

  it("Discord の 2000 文字上限を超える予定は省略表示にする", () => {
    const events = Array.from({ length: 40 }, (_, index) => ({
      title: `長い予定 ${index + 1} ${"x".repeat(120)}`,
      location: "体育館",
      description: "y".repeat(100),
      startDateTime: "2026-04-19T09:00:00+09:00",
      isBirthday: false
    }));

    const message = buildMessage(events, "2026-04-19");

    expect(message.length).toBeLessThanOrEqual(MAX_DISCORD_CONTENT);
    expect(message).toMatch(/\.\.\.他 \d+ 件の予定があります$/);
  });

  it("誕生日イベントが多い場合も 2000 文字上限を守る", () => {
    const events = Array.from({ length: 40 }, (_, index) => ({
      title: `とても長い名前の人 ${index + 1} 誕生日 ${"x".repeat(120)}`,
      description: "z".repeat(100),
      startDate: "2026-04-19",
      isBirthday: true
    }));

    const message = buildMessage(events, "2026-04-19");

    expect(message.length).toBeLessThanOrEqual(MAX_DISCORD_CONTENT);
    expect(message).toMatch(/\.\.\.他 \d+ 件の予定があります$/);
  });

  it("省略表示を入れるために必要なら末尾の予定をさらに削る", () => {
    const message = buildMessage([
      {
        title: `ほぼ上限まで長い予定 ${"x".repeat(1920)}`,
        startDateTime: "2026-04-19T09:00:00+09:00",
        isBirthday: false
      },
      {
        title: `入りきらない予定 ${"y".repeat(4000)}`,
        startDateTime: "2026-04-19T10:00:00+09:00",
        isBirthday: false
      }
    ], "2026-04-19");

    expect(message.length).toBeLessThanOrEqual(MAX_DISCORD_CONTENT);
    expect(message).not.toContain("ほぼ上限まで長い予定");
    expect(message).toContain("...他 2 件の予定があります");
  });
});
