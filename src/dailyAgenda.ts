import {
  type CalendarClient,
  createGoogleCalendarClient,
  listAgendaEvents
} from "./calendar.js";
import {
  loadConfig,
  type NotificationRoute,
  resolveRuntimeConfig
} from "./config.js";
import { createDiscordClient } from "./discord.js";
import type { AppLogger, DailyAgendaDependencies } from "./dependencies.js";
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

  const eventsByCalendarId = await listEventsByCalendarId(
    runtimeConfig.routes,
    calendar,
    { timeMin, timeMax, label },
    listEventsFn,
    appLogger
  );
  const templateCache = new Map<string, ReturnType<typeof loadMessageTemplateFn>>();
  const errors: unknown[] = [];

  for (const route of runtimeConfig.routes) {
    const result = eventsByCalendarId.get(route.calendarId);
    if (!result || "error" in result) {
      appLogger.error(`Skipped route: ${route.id} (${label})`, {
        calendarId: route.calendarId,
        error: result?.error
      });
      errors.push(result?.error ?? new Error(`Missing events for ${route.calendarId}`));
      continue;
    }

    try {
      await processNotificationRoute({
        route,
        events: result.events,
        label,
        dryRun,
        globalMessageTemplatePath: runtimeConfig.messageTemplatePath,
        templateCache,
        loadMessageTemplateFn,
        buildMessageFn,
        createDiscordClientFn,
        appLogger
      });
    } catch (error) {
      appLogger.error(`Route failed: ${route.id}`, { error });
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Daily agenda failed: ${errors.length} error(s): ${formatErrorMessages(errors)}`
    );
  }
}

type CalendarEventsResult =
  | { events: AgendaEvent[] }
  | { error: unknown };

async function listEventsByCalendarId(
  routes: NotificationRoute[],
  calendar: CalendarClient,
  range: { timeMin: string; timeMax: string; label: string },
  listEventsFn: NonNullable<DailyAgendaDependencies["listEventsFn"]>,
  appLogger: AppLogger
): Promise<Map<string, CalendarEventsResult>> {
  const results = new Map<string, CalendarEventsResult>();
  const calendarIds = [...new Set(routes.map(route => route.calendarId))];

  for (const calendarId of calendarIds) {
    try {
      results.set(calendarId, {
        events: await listEventsFn(calendar, calendarId, range)
      });
    } catch (error) {
      // Google API エラーは認証・権限・レート制限で対応が変わるため分類して記録する。
      logGoogleApiError(error, appLogger);
      results.set(calendarId, { error });
    }
  }

  return results;
}

async function processNotificationRoute({
  route,
  events,
  label,
  dryRun,
  globalMessageTemplatePath,
  templateCache,
  loadMessageTemplateFn,
  buildMessageFn,
  createDiscordClientFn,
  appLogger
}: {
  route: NotificationRoute;
  events: AgendaEvent[];
  label: string;
  dryRun: boolean;
  globalMessageTemplatePath?: string;
  templateCache: Map<string, ReturnType<NonNullable<DailyAgendaDependencies["loadMessageTemplateFn"]>>>;
  loadMessageTemplateFn: NonNullable<DailyAgendaDependencies["loadMessageTemplateFn"]>;
  buildMessageFn: NonNullable<DailyAgendaDependencies["buildMessageFn"]>;
  createDiscordClientFn: NonNullable<DailyAgendaDependencies["createDiscordClientFn"]>;
  appLogger: AppLogger;
}) {
  if (events.length === 0 && !route.postWhenNoEvents) {
    appLogger.info(`Skipped: ${route.id} ${label} (0 events)`);
    return;
  }

  const messageTemplatePath = route.messageTemplatePath ?? globalMessageTemplatePath;
  const messageTemplate = getMessageTemplate(
    messageTemplatePath,
    templateCache,
    loadMessageTemplateFn
  );
  const msg = buildMessageFn(events, label, messageTemplate, {
    includeLocationAddress: route.includeLocationAddress
  });

  if (dryRun) {
    appLogger.info([
      "Dry run: Discord 投稿をスキップしました。",
      `Route: ${route.id}`,
      `Date: ${label}`,
      `Events: ${events.length}`,
      `Webhooks: ${route.webhookUrls.length}`,
      `Length: ${msg.length}`,
      "",
      msg
    ].join("\n"));
    return;
  }

  const errors: unknown[] = [];
  for (const [index, webhookUrl] of route.webhookUrls.entries()) {
    const discordClient = createDiscordClientFn({ discordWebhookUrl: webhookUrl }, appLogger);
    try {
      await discordClient.post(msg);
    } catch (error) {
      appLogger.error(`Discord 投稿に失敗しました: ${route.id}`, {
        webhookIndex: index,
        error
      });
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Route ${route.id} failed: ${errors.length} webhook error(s)`);
  }

  appLogger.info(
    `Posted: ${route.id} ${label} (${events.length} events, ${route.webhookUrls.length} webhooks)`
  );
}

function getMessageTemplate<T>(
  templatePath: string | undefined,
  templateCache: Map<string, T>,
  loadMessageTemplateFn: (templatePath?: string) => T
): T {
  const cacheKey = templatePath ?? "";
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loaded = loadMessageTemplateFn(templatePath);
  templateCache.set(cacheKey, loaded);
  return loaded;
}

function formatErrorMessages(errors: unknown[]): string {
  return errors.map(formatErrorMessage).join("; ");
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
