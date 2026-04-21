import { describe, expect, it, vi } from "vitest";
import {
  getConfigValue,
  getRequiredConfigValue,
  getServiceAccountJson,
  isJsonString,
  loadConfig,
  parseJson,
  resolveRuntimeConfig,
  validateAppConfig,
  validateServiceAccountJson,
  validateUrl
} from "../src/config.js";

describe("loadConfig", () => {
  it("config.json がない場合は空設定を返す", () => {
    const fileSystem = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn()
    };

    expect(loadConfig("config.json", fileSystem)).toEqual({});
    expect(fileSystem.readFileSync).not.toHaveBeenCalled();
  });

  it("config.json を読み込んで設定として返す", () => {
    const fileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => JSON.stringify({
        googleCalendarId: " calendar-id ",
        discordWebhookUrl: "https://example.com/hook",
        messageTemplatePath: " ./message-template.json ",
        memo: "unknown keys are ignored"
      }))
    };

    expect(loadConfig("config.json", fileSystem)).toEqual({
      googleCalendarId: "calendar-id",
      discordWebhookUrl: "https://example.com/hook",
      messageTemplatePath: "./message-template.json"
    });
  });

  it("読み込みや JSON 解析に失敗した場合は onError に渡して空設定を返す", () => {
    const errorSpy = vi.fn();
    const fileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => "{")
    };

    expect(loadConfig("config.json", fileSystem, errorSpy)).toEqual({});
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe("validateAppConfig", () => {
  it("既知キーだけを取り出し、文字列値を trim する", () => {
    expect(validateAppConfig({
      googleCalendarId: " calendar-id ",
      discordWebhookUrl: " https://example.com/webhook ",
      googleServiceAccountPath: " ./service-account.json ",
      messageTemplatePath: " ./message-template.json ",
      unknownKey: "ignored"
    })).toEqual({
      googleCalendarId: "calendar-id",
      discordWebhookUrl: "https://example.com/webhook",
      googleServiceAccountPath: "./service-account.json",
      messageTemplatePath: "./message-template.json"
    });
  });

  it("空白だけの任意値は未設定として扱う", () => {
    expect(validateAppConfig({
      googleCalendarId: "   ",
      discordWebhookUrl: "\t"
    })).toEqual({});
  });

  it("config.json が object ではない場合はエラーを投げる", () => {
    expect(() => validateAppConfig([], "config.json"))
      .toThrow("config.json は JSON object である必要があります。");
  });

  it("既知キーが文字列ではない場合はエラーを投げる", () => {
    expect(() => validateAppConfig({
      googleCalendarId: 123
    })).toThrow("config.googleCalendarId は文字列である必要があります。");
  });
});

describe("設定値の取得", () => {
  it("環境変数を config より優先する", () => {
    expect(getConfigValue("GOOGLE_CALENDAR_ID", "googleCalendarId", {
      env: { GOOGLE_CALENDAR_ID: " env-calendar " },
      config: { googleCalendarId: "file-calendar" }
    })).toBe("env-calendar");
  });

  it("空白だけの環境変数は未設定として扱い config へ fallback する", () => {
    expect(getConfigValue("GOOGLE_CALENDAR_ID", "googleCalendarId", {
      env: { GOOGLE_CALENDAR_ID: "   " },
      config: { googleCalendarId: "file-calendar" }
    })).toBe("file-calendar");
  });

  it("環境変数がない場合は config の値を返す", () => {
    expect(getConfigValue("DISCORD_WEBHOOK_URL", "discordWebhookUrl", {
      env: {},
      config: { discordWebhookUrl: " https://example.com/webhook " }
    })).toBe("https://example.com/webhook");
  });

  it("必須値がない場合は分かりやすいエラーを投げる", () => {
    expect(() => getRequiredConfigValue("GOOGLE_CALENDAR_ID", "googleCalendarId", {
      env: {},
      config: {}
    })).toThrow("Missing configuration: GOOGLE_CALENDAR_ID or config.googleCalendarId");
  });

  it("必須値がある場合はその値を返す", () => {
    expect(getRequiredConfigValue("GOOGLE_CALENDAR_ID", "googleCalendarId", {
      env: {},
      config: { googleCalendarId: "calendar-id" }
    })).toBe("calendar-id");
  });
});

describe("getServiceAccountJson", () => {
  it("GOOGLE_SERVICE_ACCOUNT_JSON の JSON を優先して使う", () => {
    expect(getServiceAccountJson({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        })
      },
      config: { googleServiceAccountPath: "./service-account.json" }
    })).toEqual({
      client_email: "bot@example.com",
      private_key: "secret"
    });
  });

  it("環境変数に JSON がない場合はファイルパスから読み込む", () => {
    const fileSystem = {
      readFileSync: vi.fn(() => JSON.stringify({
        client_email: "file@example.com",
        private_key: "file-secret"
      }))
    };

    expect(getServiceAccountJson({
      env: {},
      config: { googleServiceAccountPath: "credentials/service-account.json" }
    }, fileSystem, "F:\\app")).toEqual({
      client_email: "file@example.com",
      private_key: "file-secret"
    });
    expect(fileSystem.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("credentials"),
      "utf-8"
    );
  });

  it("サービスアカウント設定がない場合はエラーを投げる", () => {
    expect(() => getServiceAccountJson({ env: {}, config: {} }))
      .toThrow("GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_SERVICE_ACCOUNT_PATH");
  });

  it("サービスアカウントファイルの読み込みに失敗した場合は文脈つきでエラーを投げる", () => {
    const fileSystem = {
      readFileSync: vi.fn(() => {
        throw new Error("permission denied");
      })
    };

    expect(() => getServiceAccountJson({
      env: {},
      config: { googleServiceAccountPath: "service-account.json" }
    }, fileSystem, "F:\\app")).toThrow("サービスアカウント JSON の読み込みに失敗しました");
  });
});

describe("resolveRuntimeConfig", () => {
  it("必須設定を検証済みの RuntimeConfig として返す", () => {
    expect(resolveRuntimeConfig({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        GOOGLE_CALENDAR_ID: "calendar-id",
        DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test",
        MESSAGE_TEMPLATE_PATH: "./message-template.json"
      },
      config: {}
    })).toEqual({
      googleCalendarId: "calendar-id",
      discordWebhookUrl: "https://discord.com/api/webhooks/test",
      googleServiceAccount: {
        clientEmail: "bot@example.com",
        privateKey: "secret"
      },
      messageTemplatePath: "./message-template.json"
    });
  });
});

describe("validateServiceAccountJson", () => {
  it("client_email と private_key を camelCase の検証済み値へ変換する", () => {
    expect(validateServiceAccountJson({
      client_email: "bot@example.com",
      private_key: "secret"
    })).toEqual({
      clientEmail: "bot@example.com",
      privateKey: "secret"
    });
  });

  it("client_email がない場合は起動時に分かるエラーを投げる", () => {
    expect(() => validateServiceAccountJson({
      private_key: "secret"
    })).toThrow("client_email がありません");
  });

  it("private_key がない場合は起動時に分かるエラーを投げる", () => {
    expect(() => validateServiceAccountJson({
      client_email: "bot@example.com"
    })).toThrow("private_key がありません");
  });
});

describe("JSON と URL の検証", () => {
  it("JSON 文字列らしい形式だけ true にする", () => {
    expect(isJsonString(" { \"ok\": true } ")).toBe(true);
    expect(isJsonString("service-account.json")).toBe(false);
  });

  it("JSON 解析に失敗した場合は対象名を含むエラーを投げる", () => {
    expect(() => parseJson("{", "GOOGLE_SERVICE_ACCOUNT_JSON"))
      .toThrow("GOOGLE_SERVICE_ACCOUNT_JSON の JSON 解析に失敗しました");
  });

  it("http と https の URL だけ許可する", () => {
    expect(validateUrl("https://discord.com/api/webhooks/test", "DISCORD_WEBHOOK_URL"))
      .toBe("https://discord.com/api/webhooks/test");
    expect(validateUrl("http://localhost:3000/hook", "DISCORD_WEBHOOK_URL"))
      .toBe("http://localhost:3000/hook");
    expect(() => validateUrl("ftp://example.com/hook", "DISCORD_WEBHOOK_URL"))
      .toThrow("DISCORD_WEBHOOK_URL の形式が不正です");
    expect(() => validateUrl("not-a-url", "DISCORD_WEBHOOK_URL"))
      .toThrow("DISCORD_WEBHOOK_URL の形式が不正です");
  });
});
