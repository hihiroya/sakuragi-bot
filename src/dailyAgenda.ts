import {
  createGoogleCalendarClient,
  listAgendaEvents
} from "./calendar.js";
import {
  loadConfig,
  resolveRuntimeConfig
} from "./config.js";
import { createDiscordClient } from "./discord.js";
import type { DailyAgendaDependencies } from "./dependencies.js";
import type { AgendaEvent } from "./domain.js";
import { logGoogleApiError } from "./errors.js";
import { logger } from "./logger.js";
import { buildMessage, getDateRange, getTodayRange } from "./message.js";
import { loadMessageTemplate } from "./messageTemplate.js";

/**
 * Google Calendar の当日予定を取得し、Discord へ投稿する日次処理。
 */
export async function runDailyAgenda({
  env = process.env,
  logger: appLogger = logger,
  dryRun = false,
  date,
  loadConfigFn = () => loadConfig(undefined, undefined, error => {
    // config.json が壊れていても、環境変数だけで運用できる構成を維持するため警告に留める。
    appLogger.warn("config.json の読み込みに失敗しました。", { error });
  }),
  resolveRuntimeConfigFn = resolveRuntimeConfig,
  createCalendarClient = createGoogleCalendarClient,
  listEventsFn = listAgendaEvents,
  createDiscordClientFn = (config, logger) => createDiscordClient({
    webhookUrl: config.discordWebhookUrl,
    logger
  }),
  getTodayRangeFn = targetDate => targetDate ? getDateRange(targetDate) : getTodayRange(),
  loadMessageTemplateFn = templatePath => loadMessageTemplate(templatePath, undefined, error => {
    appLogger.warn("投稿テンプレートの読み込みに失敗しました。既定文言を使用します。", { error });
  }),
  buildMessageFn = buildMessage
}: DailyAgendaDependencies = {}) {
  const config = loadConfigFn();
  const source = { env, config };
  const runtimeConfig = resolveRuntimeConfigFn(source);

  const calendar = createCalendarClient(runtimeConfig.googleServiceAccount);
  const { timeMin, timeMax, label } = getTodayRangeFn(date);

  let events: AgendaEvent[] = [];

  try {
    events = await listEventsFn(calendar, runtimeConfig.googleCalendarId, { timeMin, timeMax, label });
  } catch (error) {
    // Google API エラーは認証・権限・レート制限で対応が変わるため、再送出前に分類して記録する。
    logGoogleApiError(error, appLogger);
    throw error;
  }

  if (events.length === 0 && !runtimeConfig.postWhenNoEvents) {
    appLogger.info(`Skipped: ${label} (0 events)`);
    return;
  }

  const messageTemplate = loadMessageTemplateFn(runtimeConfig.messageTemplatePath);
  const msg = buildMessageFn(events, label, messageTemplate);

  if (dryRun) {
    appLogger.info([
      "Dry run: Discord 投稿をスキップしました。",
      `Date: ${label}`,
      `Events: ${events.length}`,
      `Length: ${msg.length}`,
      "",
      msg
    ].join("\n"));
    return;
  }

  const discordClient = createDiscordClientFn({
    discordWebhookUrl: runtimeConfig.discordWebhookUrl
  }, appLogger);
  await discordClient.post(msg);
  appLogger.info(`Posted: ${label} (${events.length} events)`);
}
