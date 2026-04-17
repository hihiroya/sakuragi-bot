import fs from "fs";
import path from "path";
import { google, calendar_v3 } from "googleapis";
import winston from "winston";

const TZ = "Asia/Tokyo";
const MAX_DISCORD_CONTENT = 2000;
const POST_RETRY_ATTEMPTS = 3;
const POST_RETRY_DELAY_MS = 1000;
const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

type AppConfig = {
  googleCalendarId?: string;
  discordWebhookUrl?: string;
  googleServiceAccountPath?: string;
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info: any) =>
      `${info.timestamp} [${info.level}] ${info.message}${info.stack ? `\n${info.stack}` : ""}`
    )
  ),
  transports: [new winston.transports.Console()]
});

const config = loadConfig();
const SERVICE_ACCOUNT_JSON = getServiceAccountJson();
const CALENDAR_ID = getRequiredConfigValue("GOOGLE_CALENDAR_ID", "googleCalendarId");
const WEBHOOK_URL = validateUrl(
  getRequiredConfigValue("DISCORD_WEBHOOK_URL", "discordWebhookUrl"),
  "DISCORD_WEBHOOK_URL"
);

/**
 * アプリケーション設定を config.json から読み込む。
 */
function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as AppConfig;
    }
  } catch (error) {
    logger.notice("config.json の読み込みに失敗しました。", { error });
  }
  return {};
}

/**
 * 環境変数または config.json から設定値を取得する。
 */
function getConfigValue(
  envName: string,
  configKey: keyof AppConfig
): string | undefined {
  const envValue = process.env[envName];
  if (envValue) return envValue;
  const configValue = config[configKey];
  return typeof configValue === "string" ? configValue : undefined;
}

/**
 * 必須の設定値を取得し、存在しない場合は例外を投げる。
 */
function getRequiredConfigValue(
  envName: string,
  configKey: keyof AppConfig
): string {
  const value = getConfigValue(envName, configKey);
  if (!value) {
    throw new Error(`Missing configuration: ${envName} or config.${configKey}`);
  }
  return value;
}

/**
 * Googleサービスアカウント情報を取得する。
 */
function getServiceAccountJson(): Record<string, unknown> {
  const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const jsonPath = getConfigValue("GOOGLE_SERVICE_ACCOUNT_PATH", "googleServiceAccountPath");

  if (jsonEnv && isJsonString(jsonEnv)) {
    return parseJson(jsonEnv, "GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  if (jsonPath) {
    try {
      const raw = fs.readFileSync(path.resolve(process.cwd(), jsonPath), "utf-8");
      return parseJson(raw, jsonPath);
    } catch (error) {
      throw new Error(`サービスアカウント JSON の読み込みに失敗しました: ${error}`);
    }
  }

  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_SERVICE_ACCOUNT_PATH を設定してください。"
  );
}

/**
 * JSON 文字列かどうかを簡易判定する。
 */
function isJsonString(value: string): boolean {
  return value.trim().startsWith("{") && value.trim().endsWith("}");
}

/**
 * JSONのパースを安全に行う。
 */
function parseJson(raw: string, name: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${name} の JSON 解析に失敗しました: ${error}`);
  }
}

/**
 * URL形式の設定を検証する。
 */
function validateUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${name} は http/https の URL である必要があります。`);
    }
    return value;
  } catch (error) {
    throw new Error(`${name} の形式が不正です: ${error}`);
  }
}

/**
 * JSTの当日範囲を取得する。
 */
function getTodayRange() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
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
 * 日時フォーマット。
 */
const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

/**
 * イベント1行表示。
 */
function formatEvent(e: calendar_v3.Schema$Event): string {
  const title = e.summary ?? "無題";
  if (e.start?.date) {
    return `・終日: ${title}`;
  }
  if (e.start?.dateTime) {
    const t = formatter.format(new Date(e.start.dateTime));
    return `・${t}: ${title}`;
  }
  return `・${title}`;
}

/**
 * 誕生日表示。
 */
function formatBirthday(e: calendar_v3.Schema$Event): string {
  return `・🎂 ${e.summary ?? "誕生日"} おめでとうございます`;
}

/**
 * Discordへメッセージを送信する。
 */
async function post(content: string) {
  for (let attempt = 1; attempt <= POST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        logger.info("Discord に投稿しました。", { length: content.length });
        return;
      }

      const responseText = await response.text();
      logger.error("Discord 投稿でエラーが発生しました。", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        attempt
      });

      if (response.status === 429 && attempt < POST_RETRY_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after")) || POST_RETRY_DELAY_MS / 1000;
        await sleep(retryAfter * 1000);
        continue;
      }

      throw new Error(`Discord webhook error: ${response.status} ${response.statusText}`);
    } catch (error) {
      logger.error("Discord への送信中に例外が発生しました。", { error, attempt });
      if (attempt === POST_RETRY_ATTEMPTS) {
        throw error;
      }
      await sleep(POST_RETRY_DELAY_MS);
    }
  }
}

/**
 * 最大文字数に収まるようにメッセージを構築する。
 */
function buildMessage(
  events: calendar_v3.Schema$Event[],
  label: string
): string {
  if (events.length === 0) {
    return `おはようございます。\n${label} の予定はありません。`;
  }

  const birthdays: string[] = [];
  const normals: string[] = [];

  for (const event of events) {
    if (event.eventType === "birthday") {
      birthdays.push(formatBirthday(event));
    } else {
      normals.push(formatEvent(event));
    }
  }

  const baseLines: string[] = [
    "おはようございます。",
    `${label} の予定です。`
  ];

  const birthdayLines = birthdays.length > 0 ? ["", "🎉 本日の誕生日", ...birthdays] : [];
  const normalHeader = normals.length > 0 ? ["", "📅 本日の予定"] : [];

  const lines = [...baseLines, ...birthdayLines, ...normalHeader];
  let current = lines.join("\n");

  if (current.length <= MAX_DISCORD_CONTENT) {
    const added = [...lines, ...normals];
    current = added.join("\n");
    if (current.length <= MAX_DISCORD_CONTENT) {
      return current;
    }
  }

  const outputLines = [...lines];
  let remaining = normals.length;

  for (const normal of normals) {
    const nextCandidate = [...outputLines, normal].join("\n");
    if (nextCandidate.length > MAX_DISCORD_CONTENT) {
      break;
    }
    outputLines.push(normal);
    remaining -= 1;
  }

  if (remaining > 0) {
    outputLines.push(`...他 ${remaining} 件の予定があります`);
  }

  return outputLines.join("\n");
}

/**
 * メイン処理。
 */
async function main() {
  const auth = new google.auth.JWT({
    email: String(SERVICE_ACCOUNT_JSON.client_email),
    key: String(SERVICE_ACCOUNT_JSON.private_key),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
  });

  const calendar = google.calendar({ version: "v3", auth });
  const { timeMin, timeMax, label } = getTodayRange();

  let events: calendar_v3.Schema$Event[] = [];

  try {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime"
    });
    events = response.data.items ?? [];
  } catch (error) {
    logGoogleApiError(error);
    throw error;
  }

  const msg = buildMessage(events, label);
  await post(msg);
  logger.info(`Posted: ${label} (${events.length} events)`);
}

/**
 * Google API エラーをログ出力する。
 */
function logGoogleApiError(error: unknown) {
  const apiError = error as any;
  const status = apiError?.response?.status ?? apiError?.code;
  const message = apiError?.message ?? String(error);
  const details = apiError?.response?.data ?? apiError?.response?.statusText;

  if (status === 401 || status === 403) {
    logger.error("Google API の認証/権限エラーです。", { status, message, details });
  } else if (status === 429) {
    logger.error("Google API のレート制限に達しました。", { status, message, details });
  } else {
    logger.error("Google API からの応答でエラーが発生しました。", { status, message, details });
  }
}

/**
 * 指定ミリ秒だけ待機する。
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  logger.error("アプリケーションの実行中に致命的なエラーが発生しました。", { error });
  process.exit(1);
});