import { describe, expect, it } from "vitest";
import {
  buildMessage,
  formatBirthday,
  formatEvent,
  getTodayRange,
  MAX_DISCORD_CONTENT
} from "../src/message.js";

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
