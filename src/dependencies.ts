import type { CalendarClient } from "./calendar.js";
import type { AppConfig, RuntimeConfig } from "./config.js";
import type { DiscordClient, PostLogger } from "./discord.js";
import type { AgendaEvent, TodayRange } from "./domain.js";
import type { MessageTemplate } from "./messageTemplate.js";
import type { buildMessage } from "./message.js";

export type AppLogger = PostLogger & {
  warn(message: string, meta?: unknown): void;
};

/**
 * 日次予定投稿の依存関係。
 *
 * 外部 API・時刻・投稿処理を差し替えられるようにして、実運用の配線は保ちつつ
 * ユニットテストではネットワークや現在時刻に依存しないようにします。
 */
export type DailyAgendaDependencies = {
  env?: NodeJS.ProcessEnv;
  logger?: AppLogger;
  dryRun?: boolean;
  date?: string;
  loadConfigFn?: () => AppConfig;
  resolveRuntimeConfigFn?: (source: { env?: NodeJS.ProcessEnv; config?: AppConfig }) => RuntimeConfig;
  createCalendarClient?: (credentials: RuntimeConfig["googleServiceAccount"]) => CalendarClient;
  listEventsFn?: (calendar: CalendarClient, calendarId: string, range: TodayRange) => Promise<AgendaEvent[]>;
  createDiscordClientFn?: (
    config: Pick<RuntimeConfig, "discordWebhookUrl">,
    logger: PostLogger
  ) => DiscordClient;
  getTodayRangeFn?: (date?: string) => TodayRange;
  loadMessageTemplateFn?: (templatePath?: string) => MessageTemplate;
  buildMessageFn?: typeof buildMessage;
};
