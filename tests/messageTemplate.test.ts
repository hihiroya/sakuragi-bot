import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MESSAGE_TEMPLATE,
  loadMessageTemplate,
  renderTemplate,
  validateMessageTemplate
} from "../src/messageTemplate.js";

describe("loadMessageTemplate", () => {
  it("テンプレートファイルがない場合は既定文言を返す", () => {
    const fileSystem = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn()
    };

    expect(loadMessageTemplate("message-template.json", fileSystem))
      .toEqual(DEFAULT_MESSAGE_TEMPLATE);
    expect(fileSystem.readFileSync).not.toHaveBeenCalled();
  });

  it("テンプレートファイルを読み込んで既定文言へ重ねる", () => {
    const fileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => JSON.stringify({
        greeting: "お疲れさまです。",
        agendaHeader: "今日の予定"
      }))
    };

    expect(loadMessageTemplate("custom-template.json", fileSystem))
      .toEqual({
        ...DEFAULT_MESSAGE_TEMPLATE,
        greeting: "お疲れさまです。",
        agendaHeader: "今日の予定"
      });
  });

  it("読み込みや JSON 解析に失敗した場合は onError に渡して既定文言を返す", () => {
    const errorSpy = vi.fn();
    const fileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => "{")
    };

    expect(loadMessageTemplate("message-template.json", fileSystem, errorSpy))
      .toEqual(DEFAULT_MESSAGE_TEMPLATE);
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe("validateMessageTemplate", () => {
  it("未知キーを無視し、空白だけの値は既定文言を使う", () => {
    expect(validateMessageTemplate({
      greeting: " おはようございます！ ",
      agendaLine: "   ",
      unknownKey: "ignored"
    })).toEqual({
      ...DEFAULT_MESSAGE_TEMPLATE,
      greeting: " おはようございます！ "
    });
  });

  it("複数行表示用テンプレートのインデントや Markdown 用スペースは保持する", () => {
    expect(validateMessageTemplate({
      allDayEventLine: "* ⭐ {{title}}",
      expandedProgressLine: "　⏳ {{dayIndex}}日目",
      expandedLocationLine: " 　📍 {{location}} "
    })).toEqual({
      ...DEFAULT_MESSAGE_TEMPLATE,
      allDayEventLine: "* ⭐ {{title}}",
      expandedProgressLine: "　⏳ {{dayIndex}}日目",
      expandedLocationLine: " 　📍 {{location}} "
    });
  });

  it("テンプレートが object ではない場合はエラーを投げる", () => {
    expect(() => validateMessageTemplate([], "message-template.json"))
      .toThrow("message-template.json は JSON object である必要があります。");
  });

  it("既知キーが文字列ではない場合はエラーを投げる", () => {
    expect(() => validateMessageTemplate({
      greeting: 123
    }, "message-template.json")).toThrow("message-template.json.greeting は文字列である必要があります。");
  });
});

describe("renderTemplate", () => {
  it("{{name}} 形式の placeholder を値で置換する", () => {
    expect(renderTemplate("{{date}} の予定: {{count}} 件", {
      date: "2026-04-21",
      count: 3
    })).toBe("2026-04-21 の予定: 3 件");
  });

  it("未指定の placeholder はそのまま残す", () => {
    expect(renderTemplate("{{date}} {{unknown}}", {
      date: "2026-04-21"
    })).toBe("2026-04-21 {{unknown}}");
  });
});
