import { describe, expect, it, vi } from "vitest";
import type { CalendarClient } from "../src/calendar.js";
import type { AppLogger } from "../src/dependencies.js";
import { runDailyAgenda } from "../src/dailyAgenda.js";

function createLogger(): AppLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("runDailyAgenda", () => {
  it("設定、予定取得、本文生成、Discord 投稿を配線する", async () => {
    const logger = createLogger();
    const events = [
      { title: "朝会", isBirthday: false },
      { title: "花道 誕生日", isBirthday: true }
    ];
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const createCalendarClient = vi.fn((): CalendarClient => calendar);
    const listEventsFn = vi.fn(async () => events);
    const discordClient = { post: vi.fn(async () => undefined) };
    const createDiscordClientFn = vi.fn(() => discordClient);
    const buildMessageFn = vi.fn(() => "投稿本文");

    await runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        GOOGLE_CALENDAR_ID: "calendar-id",
        DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test"
      },
      logger,
      loadConfigFn: () => ({}),
      createCalendarClient,
      listEventsFn,
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      buildMessageFn
    });

    expect(createCalendarClient).toHaveBeenCalledWith({
      clientEmail: "bot@example.com",
      privateKey: "secret"
    });
    expect(createDiscordClientFn).toHaveBeenCalledWith({
      discordWebhookUrl: "https://discord.com/api/webhooks/test"
    }, logger);
    expect(listEventsFn).toHaveBeenCalledWith(calendar, "calendar-id", {
      timeMin: "2026-04-18T15:00:00.000Z",
      timeMax: "2026-04-19T15:00:00.000Z",
      label: "2026-04-19"
    });
    expect(buildMessageFn).toHaveBeenCalledWith(events, "2026-04-19");
    expect(discordClient.post).toHaveBeenCalledWith("投稿本文");
    expect(logger.info).toHaveBeenCalledWith("Posted: 2026-04-19 (2 events)");
  });

  it("Google Calendar の取得に失敗した場合はログ出力して例外を再送出する", async () => {
    const logger = createLogger();
    const apiError = Object.assign(new Error("forbidden"), {
      response: {
        status: 403,
        data: { reason: "calendar permission denied" }
      }
    });
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };

    await expect(runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        GOOGLE_CALENDAR_ID: "calendar-id",
        DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test"
      },
      logger,
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn: async () => {
        throw apiError;
      },
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      })
    })).rejects.toThrow("forbidden");

    expect(logger.error).toHaveBeenCalledWith(
      "Google API の認証/権限エラーです。",
      expect.objectContaining({ status: 403 })
    );
  });

  it("既定の config 読み込みで config.json が壊れていても環境変数だけで実行できる", async () => {
    const logger = createLogger();
    const originalCwd = process.cwd();

    try {
      process.chdir("tests/fixtures/broken-config");

      await runDailyAgenda({
        env: {
          GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
            client_email: "bot@example.com",
            private_key: "secret"
          }),
          GOOGLE_CALENDAR_ID: "calendar-id",
          DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test"
        },
        logger,
        createCalendarClient: () => ({
          events: {
            list: vi.fn(async () => ({ data: { items: [] } }))
          }
        }),
        listEventsFn: vi.fn(async () => []),
        createDiscordClientFn: () => ({ post: vi.fn(async () => undefined) }),
        getTodayRangeFn: () => ({
          label: "2026-04-19",
          timeMin: "2026-04-18T15:00:00.000Z",
          timeMax: "2026-04-19T15:00:00.000Z"
        })
      });
    } finally {
      process.chdir(originalCwd);
    }

    expect(logger.warn).toHaveBeenCalledWith(
      "config.json の読み込みに失敗しました。",
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(logger.info).toHaveBeenCalledWith("Posted: 2026-04-19 (0 events)");
  });
});
