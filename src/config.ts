import fs from "fs";
import path from "path";

export type AppConfig = {
  googleCalendarId?: string;
  discordWebhookUrl?: string;
  googleServiceAccountPath?: string;
  messageTemplatePath?: string;
  postWhenNoEvents?: boolean;
  includeLocationAddress?: boolean;
};

export type ConfigSource = {
  env?: NodeJS.ProcessEnv;
  config?: AppConfig;
};

export type ServiceAccountCredentials = {
  clientEmail: string;
  privateKey: string;
};

export type RuntimeConfig = {
  googleCalendarId: string;
  discordWebhookUrl: string;
  googleServiceAccount: ServiceAccountCredentials;
  messageTemplatePath?: string;
  postWhenNoEvents: boolean;
  includeLocationAddress: boolean;
};

type ConfigFieldDefinition = {
  envName: string;
  configKey: StringConfigKey;
};

type StringConfigKey = Exclude<keyof AppConfig, BooleanConfigKey>;
type BooleanConfigKey = "postWhenNoEvents" | "includeLocationAddress";

export const POST_WHEN_NO_EVENTS_FIELD = {
  envName: "POST_WHEN_NO_EVENTS",
  configKey: "postWhenNoEvents"
} as const;

export const INCLUDE_LOCATION_ADDRESS_FIELD = {
  envName: "INCLUDE_LOCATION_ADDRESS",
  configKey: "includeLocationAddress"
} as const;

export const CONFIG_FIELDS = {
  googleCalendarId: {
    envName: "GOOGLE_CALENDAR_ID",
    configKey: "googleCalendarId"
  },
  discordWebhookUrl: {
    envName: "DISCORD_WEBHOOK_URL",
    configKey: "discordWebhookUrl"
  },
  googleServiceAccountPath: {
    envName: "GOOGLE_SERVICE_ACCOUNT_PATH",
    configKey: "googleServiceAccountPath"
  },
  messageTemplatePath: {
    envName: "MESSAGE_TEMPLATE_PATH",
    configKey: "messageTemplatePath"
  }
} as const satisfies Record<StringConfigKey, ConfigFieldDefinition>;

/**
 * config.json を読み込む。
 *
 * 起動環境では環境変数だけで完結することもあるため、読み込み失敗時は呼び出し元が
 * 警告を出したうえで空設定として継続できるようにします。
 */
export function loadConfig(
  configPath = path.resolve(process.cwd(), "config.json"),
  fileSystem: Pick<typeof fs, "existsSync" | "readFileSync"> = fs,
  onError?: (error: unknown) => void
): AppConfig {
  try {
    if (!fileSystem.existsSync(configPath)) {
      return {};
    }

    const raw = fileSystem.readFileSync(configPath, "utf-8");
    return validateAppConfig(parseJson(raw, configPath), configPath);
  } catch (error) {
    onError?.(error);
    return {};
  }
}

/**
 * config.json の値を AppConfig として検証する。
 *
 * 既知キーだけを取り出すことで、将来設定項目が増えたときも検証箇所を
 * CONFIG_FIELDS とこの関数に集約できます。未知キーは運用メモ用途もあり得るため無視します。
 */
export function validateAppConfig(raw: unknown, name = "config.json"): AppConfig {
  if (!isRecord(raw)) {
    throw new Error(`${name} は JSON object である必要があります。`);
  }

  const config: AppConfig = {};
  for (const definition of Object.values(CONFIG_FIELDS)) {
    const rawValue = raw[definition.configKey];
    const value = normalizeOptionalString(rawValue, `config.${definition.configKey}`);
    if (value !== undefined) {
      config[definition.configKey] = value;
    }
  }
  const postWhenNoEvents = normalizeOptionalBoolean(
    raw[POST_WHEN_NO_EVENTS_FIELD.configKey],
    `config.${POST_WHEN_NO_EVENTS_FIELD.configKey}`
  );
  if (postWhenNoEvents !== undefined) {
    config.postWhenNoEvents = postWhenNoEvents;
  }
  const includeLocationAddress = normalizeOptionalBoolean(
    raw[INCLUDE_LOCATION_ADDRESS_FIELD.configKey],
    `config.${INCLUDE_LOCATION_ADDRESS_FIELD.configKey}`
  );
  if (includeLocationAddress !== undefined) {
    config.includeLocationAddress = includeLocationAddress;
  }
  return config;
}

export function getConfigValue(
  envName: string,
  configKey: StringConfigKey,
  source: ConfigSource
): string | undefined {
  const envValue = normalizeOptionalString(source.env?.[envName], envName);
  if (envValue) return envValue;

  return normalizeOptionalString(source.config?.[configKey], `config.${configKey}`);
}

/**
 * アプリ起動に必要な設定を検証済みの RuntimeConfig として解決する。
 *
 * 必須値・URL・サービスアカウントの必須フィールドを起動時にまとめて検証し、
 * 以降の処理が未検証の Record<string, unknown> に依存しないようにします。
 */
export function resolveRuntimeConfig(
  source: ConfigSource,
  fileSystem: Pick<typeof fs, "readFileSync"> = fs,
  cwd = process.cwd()
): RuntimeConfig {
  const googleCalendarId = getRequiredConfigValue(
    CONFIG_FIELDS.googleCalendarId.envName,
    CONFIG_FIELDS.googleCalendarId.configKey,
    source
  );
  const discordWebhookUrl = validateUrl(
    getRequiredConfigValue(
      CONFIG_FIELDS.discordWebhookUrl.envName,
      CONFIG_FIELDS.discordWebhookUrl.configKey,
      source
    ),
    CONFIG_FIELDS.discordWebhookUrl.envName
  );
  const googleServiceAccount = validateServiceAccountJson(
    getServiceAccountJson(source, fileSystem, cwd)
  );
  const messageTemplatePath = getConfigValue(
    CONFIG_FIELDS.messageTemplatePath.envName,
    CONFIG_FIELDS.messageTemplatePath.configKey,
    source
  );

  const runtimeConfig: RuntimeConfig = {
    googleCalendarId,
    discordWebhookUrl,
    googleServiceAccount,
    postWhenNoEvents: getBooleanConfigValue(
      POST_WHEN_NO_EVENTS_FIELD.envName,
      POST_WHEN_NO_EVENTS_FIELD.configKey,
      source
    ) ?? false,
    includeLocationAddress: getBooleanConfigValue(
      INCLUDE_LOCATION_ADDRESS_FIELD.envName,
      INCLUDE_LOCATION_ADDRESS_FIELD.configKey,
      source
    ) ?? false
  };
  if (messageTemplatePath) {
    runtimeConfig.messageTemplatePath = messageTemplatePath;
  }
  return runtimeConfig;
}

export function getBooleanConfigValue(
  envName: string,
  configKey: BooleanConfigKey,
  source: ConfigSource
): boolean | undefined {
  const envValue = normalizeOptionalBooleanString(source.env?.[envName], envName);
  if (envValue !== undefined) return envValue;

  return normalizeOptionalBoolean(source.config?.[configKey], `config.${configKey}`);
}

/**
 * 必須設定を取得する。
 *
 * ここでは値の存在だけを確認し、URL や JSON の形式検証は専用関数へ分けます。
 */
export function getRequiredConfigValue(
  envName: string,
  configKey: StringConfigKey,
  source: ConfigSource
): string {
  const value = getConfigValue(envName, configKey, source);
  if (!value) {
    throw new Error(`Missing configuration: ${envName} or config.${configKey}`);
  }
  return value;
}

/**
 * Google サービスアカウント JSON を環境変数またはファイルから取得する。
 */
export function getServiceAccountJson(
  source: ConfigSource,
  fileSystem: Pick<typeof fs, "readFileSync"> = fs,
  cwd = process.cwd()
): Record<string, unknown> {
  const jsonEnv = source.env?.GOOGLE_SERVICE_ACCOUNT_JSON;
  const jsonPath = getConfigValue(
    CONFIG_FIELDS.googleServiceAccountPath.envName,
    CONFIG_FIELDS.googleServiceAccountPath.configKey,
    source
  );

  if (jsonEnv && isJsonString(jsonEnv)) {
    return parseJson(jsonEnv, "GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  if (jsonPath) {
    try {
      const raw = fileSystem.readFileSync(path.resolve(cwd, jsonPath), "utf-8");
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
 * Google 認証に最低限必要なフィールドを検証する。
 *
 * 欠落したまま Google API client を作ると原因が追いにくいため、設定解決時に止めます。
 */
export function validateServiceAccountJson(raw: Record<string, unknown>): ServiceAccountCredentials {
  const clientEmail = raw.client_email;
  const privateKey = raw.private_key;

  if (typeof clientEmail !== "string" || clientEmail.length === 0) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON に client_email がありません。");
  }
  if (typeof privateKey !== "string" || privateKey.length === 0) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON に private_key がありません。");
  }

  return {
    clientEmail,
    privateKey
  };
}

export function isJsonString(value: string): boolean {
  return value.trim().startsWith("{") && value.trim().endsWith("}");
}

export function parseJson(raw: string, name: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${name} の JSON 解析に失敗しました: ${error}`);
  }
}

/**
 * Discord webhook など、外部へ接続する URL の形式を検証する。
 */
export function validateUrl(value: string, name: string): string {
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

function normalizeOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} は文字列である必要があります。`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${name} は boolean である必要があります。`);
  }
  return value;
}

function normalizeOptionalBooleanString(value: unknown, name: string): boolean | undefined {
  const normalized = normalizeOptionalString(value, name);
  if (normalized === undefined) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (["true", "1", "yes", "on"].includes(lower)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(lower)) {
    return false;
  }
  throw new Error(`${name} は true/false の値である必要があります。`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
