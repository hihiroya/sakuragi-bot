import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { CalendarClient } from "../src/calendar.js";
import { AGENDA_NOTIFICATIONS_JSON_ENV } from "../src/config.js";
import type { AppLogger } from "../src/dependencies.js";
import { runDailyAgenda } from "../src/dailyAgenda.js";
import { DEFAULT_MESSAGE_TEMPLATE } from "../src/messageTemplate.js";

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
    const messageTemplate = {
      ...DEFAULT_MESSAGE_TEMPLATE,
      greeting: "お疲れさまです。"
    };
    const loadMessageTemplateFn = vi.fn(() => messageTemplate);
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
      loadConfigFn: () => ({ messageTemplatePath: "./custom-template.json" }),
      createCalendarClient,
      listEventsFn,
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn,
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
    expect(loadMessageTemplateFn).toHaveBeenCalledWith("./custom-template.json");
    expect(buildMessageFn).toHaveBeenCalledWith(events, "2026-04-19", messageTemplate, {
      includeLocationAddress: false
    });
    expect(discordClient.post).toHaveBeenCalledWith("投稿本文");
    expect(logger.info).toHaveBeenCalledWith("Posted: default 2026-04-19 (2 events, 1 webhooks)");
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

  it("予定がない日は既定で Discord 投稿をスキップする", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const listEventsFn = vi.fn(async () => []);
    const createDiscordClientFn = vi.fn(() => ({ post: vi.fn(async () => undefined) }));
    const loadMessageTemplateFn = vi.fn(() => DEFAULT_MESSAGE_TEMPLATE);
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
      createCalendarClient: () => calendar,
      listEventsFn,
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn,
      buildMessageFn
    });

    expect(listEventsFn).toHaveBeenCalledOnce();
    expect(loadMessageTemplateFn).not.toHaveBeenCalled();
    expect(buildMessageFn).not.toHaveBeenCalled();
    expect(createDiscordClientFn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("Skipped: default 2026-04-19 (0 events)");
  });

  it("postWhenNoEvents が true の場合は予定がない日も投稿する", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const discordClient = { post: vi.fn(async () => undefined) };
    const buildMessageFn = vi.fn(() => "予定なし本文");

    await runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        GOOGLE_CALENDAR_ID: "calendar-id",
        DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test",
        POST_WHEN_NO_EVENTS: "true"
      },
      logger,
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn: vi.fn(async () => []),
      createDiscordClientFn: () => discordClient,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE,
      buildMessageFn
    });

    expect(buildMessageFn).toHaveBeenCalledWith([], "2026-04-19", DEFAULT_MESSAGE_TEMPLATE, {
      includeLocationAddress: false
    });
    expect(discordClient.post).toHaveBeenCalledWith("予定なし本文");
    expect(logger.info).toHaveBeenCalledWith("Posted: default 2026-04-19 (0 events, 1 webhooks)");
  });

  it("date オプションで指定日の予定範囲を取得する", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const listEventsFn = vi.fn(async () => [
      { title: "指定日の予定", isBirthday: false }
    ]);
    const discordClient = { post: vi.fn(async () => undefined) };

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
      date: "2026-04-22",
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn,
      createDiscordClientFn: () => discordClient,
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE
    });

    expect(listEventsFn).toHaveBeenCalledWith(calendar, "calendar-id", {
      timeMin: "2026-04-21T15:00:00.000Z",
      timeMax: "2026-04-22T15:00:00.000Z",
      label: "2026-04-22"
    });
    expect(discordClient.post).toHaveBeenCalledOnce();
  });

  it("dryRun の場合は本文生成まで行い Discord 投稿をスキップする", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const createDiscordClientFn = vi.fn(() => ({ post: vi.fn(async () => undefined) }));
    const buildMessageFn = vi.fn(() => "投稿予定本文");

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
      dryRun: true,
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn: vi.fn(async () => [
        { title: "朝会", isBirthday: false }
      ]),
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE,
      buildMessageFn
    });

    expect(buildMessageFn).toHaveBeenCalledOnce();
    expect(buildMessageFn).toHaveBeenCalledWith([
      { title: "朝会", isBirthday: false }
    ], "2026-04-19", DEFAULT_MESSAGE_TEMPLATE, {
      includeLocationAddress: false
    });
    expect(createDiscordClientFn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      [
        "Dry run: Discord 投稿をスキップしました。",
        "Route: default",
        "Date: 2026-04-19",
        "Events: 1",
        "Webhooks: 1",
        `Length: ${"投稿予定本文".length}`,
        "",
        "投稿予定本文"
      ].join("\n")
    );
  });

  it("includeLocationAddress 設定を本文生成へ渡す", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const buildMessageFn = vi.fn(() => "投稿本文");
    const discordClient = { post: vi.fn(async () => undefined) };

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
      loadConfigFn: () => ({ includeLocationAddress: true }),
      createCalendarClient: () => calendar,
      listEventsFn: vi.fn(async () => [
        { title: "住所付き予定", isBirthday: false }
      ]),
      createDiscordClientFn: () => discordClient,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE,
      buildMessageFn
    });

    expect(buildMessageFn).toHaveBeenCalledWith([
      { title: "住所付き予定", isBirthday: false }
    ], "2026-04-19", DEFAULT_MESSAGE_TEMPLATE, {
      includeLocationAddress: true
    });
  });

  it("同じカレンダーを複数 webhook に投稿する場合は予定取得を 1 回にまとめる", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const events = [{ title: "共有予定", isBirthday: false }];
    const listEventsFn = vi.fn(async () => events);
    const post = vi.fn(async () => undefined);
    const createDiscordClientFn = vi.fn(() => ({ post }));
    const buildMessageFn = vi.fn(() => "共有予定本文");

    await runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        [AGENDA_NOTIFICATIONS_JSON_ENV]: JSON.stringify([
          {
            id: "team-a",
            calendarId: "calendar-a",
            webhookUrls: [
              "https://discord.com/api/webhooks/a/1",
              "https://discord.com/api/webhooks/a/2"
            ]
          }
        ])
      },
      logger,
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn,
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE,
      buildMessageFn
    });

    expect(listEventsFn).toHaveBeenCalledOnce();
    expect(listEventsFn).toHaveBeenCalledWith(calendar, "calendar-a", expect.any(Object));
    expect(createDiscordClientFn).toHaveBeenNthCalledWith(1, {
      discordWebhookUrl: "https://discord.com/api/webhooks/a/1"
    }, logger);
    expect(createDiscordClientFn).toHaveBeenNthCalledWith(2, {
      discordWebhookUrl: "https://discord.com/api/webhooks/a/2"
    }, logger);
    expect(post).toHaveBeenCalledTimes(2);
    expect(buildMessageFn).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Posted: team-a 2026-04-19 (1 events, 2 webhooks)");
  });

  it("複数カレンダーを route ごとの設定で投稿する", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const listEventsFn = vi.fn(async (_calendar: CalendarClient, calendarId: string) => {
      if (calendarId === "calendar-a") {
        return [{ title: "A予定", isBirthday: false }];
      }
      return [];
    });
    const createDiscordClientFn = vi.fn(() => ({ post: vi.fn(async () => undefined) }));
    const loadMessageTemplateFn = vi.fn(() => DEFAULT_MESSAGE_TEMPLATE);
    const buildMessageFn = vi.fn(() => "投稿本文");

    await runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        POST_WHEN_NO_EVENTS: "false",
        INCLUDE_LOCATION_ADDRESS: "false",
        [AGENDA_NOTIFICATIONS_JSON_ENV]: JSON.stringify([
          {
            id: "team-a",
            calendarId: "calendar-a",
            webhookUrls: ["https://discord.com/api/webhooks/a/1"],
            includeLocationAddress: true,
            messageTemplatePath: "./team-a-template.json"
          },
          {
            id: "team-b",
            calendarId: "calendar-b",
            webhookUrls: ["https://discord.com/api/webhooks/b/1"],
            postWhenNoEvents: true
          }
        ])
      },
      logger,
      loadConfigFn: () => ({ messageTemplatePath: "./global-template.json" }),
      createCalendarClient: () => calendar,
      listEventsFn,
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn,
      buildMessageFn
    });

    expect(listEventsFn).toHaveBeenCalledTimes(2);
    expect(listEventsFn).toHaveBeenNthCalledWith(1, calendar, "calendar-a", expect.any(Object));
    expect(listEventsFn).toHaveBeenNthCalledWith(2, calendar, "calendar-b", expect.any(Object));
    expect(loadMessageTemplateFn).toHaveBeenNthCalledWith(1, "./team-a-template.json");
    expect(loadMessageTemplateFn).toHaveBeenNthCalledWith(2, "./global-template.json");
    expect(buildMessageFn).toHaveBeenNthCalledWith(
      1,
      [{ title: "A予定", isBirthday: false }],
      "2026-04-19",
      DEFAULT_MESSAGE_TEMPLATE,
      { includeLocationAddress: true }
    );
    expect(buildMessageFn).toHaveBeenNthCalledWith(
      2,
      [],
      "2026-04-19",
      DEFAULT_MESSAGE_TEMPLATE,
      { includeLocationAddress: false }
    );
    expect(logger.info).toHaveBeenCalledWith("Posted: team-a 2026-04-19 (1 events, 1 webhooks)");
    expect(logger.info).toHaveBeenCalledWith("Posted: team-b 2026-04-19 (0 events, 1 webhooks)");
  });

  it("一部 webhook の投稿に失敗しても他 webhook へ投稿して最後に失敗する", async () => {
    const logger = createLogger();
    const calendar: CalendarClient = {
      events: {
        list: vi.fn(async () => ({ data: { items: [] } }))
      }
    };
    const firstPost = vi.fn(async () => {
      throw new Error("webhook failed");
    });
    const secondPost = vi.fn(async () => undefined);
    const createDiscordClientFn = vi
      .fn()
      .mockReturnValueOnce({ post: firstPost })
      .mockReturnValueOnce({ post: secondPost });

    await expect(runDailyAgenda({
      env: {
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "bot@example.com",
          private_key: "secret"
        }),
        [AGENDA_NOTIFICATIONS_JSON_ENV]: JSON.stringify([
          {
            id: "team-a",
            calendarId: "calendar-a",
            webhookUrls: [
              "https://discord.com/api/webhooks/a/1",
              "https://discord.com/api/webhooks/a/2"
            ]
          }
        ])
      },
      logger,
      loadConfigFn: () => ({}),
      createCalendarClient: () => calendar,
      listEventsFn: vi.fn(async () => [{ title: "共有予定", isBirthday: false }]),
      createDiscordClientFn,
      getTodayRangeFn: () => ({
        label: "2026-04-19",
        timeMin: "2026-04-18T15:00:00.000Z",
        timeMax: "2026-04-19T15:00:00.000Z"
      }),
      loadMessageTemplateFn: () => DEFAULT_MESSAGE_TEMPLATE,
      buildMessageFn: vi.fn(() => "投稿本文")
    })).rejects.toThrow("Daily agenda failed");

    expect(firstPost).toHaveBeenCalledWith("投稿本文");
    expect(secondPost).toHaveBeenCalledWith("投稿本文");
    expect(logger.error).toHaveBeenCalledWith(
      "Discord 投稿に失敗しました: team-a",
      expect.objectContaining({ webhookIndex: 0 })
    );
  });

  it("既定の config 読み込みで config.json が壊れていても環境変数だけで実行できる", async () => {
    const logger = createLogger();
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakuragi-bot-broken-config-"));
    fs.writeFileSync(path.join(tempDir, "config.json"), "{", "utf-8");

    try {
      process.chdir(tempDir);

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
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    expect(logger.warn).toHaveBeenCalledWith(
      "config.json の読み込みに失敗しました。",
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(logger.info).toHaveBeenCalledWith("Skipped: default 2026-04-19 (0 events)");
  });
});
