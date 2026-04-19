export type OperationErrorCategory =
  | "auth"
  | "rate_limit"
  | "external_api"
  | "configuration"
  | "network"
  | "unknown";

export type OperationErrorInfo = {
  category: OperationErrorCategory;
  status?: unknown;
  message: string;
  details?: unknown;
};

export type ErrorLogger = {
  error(message: string, meta?: unknown): void;
};

export type DiscordWebhookFailure = {
  status: number;
  statusText?: string;
  body?: unknown;
};

/**
 * Google API エラーを運用時に判断しやすいカテゴリへ変換する。
 *
 * Google API client は HTTP status を response.status または code に入れるため、
 * 両方を見て分類します。
 */
export function classifyGoogleApiError(error: unknown): OperationErrorInfo {
  const apiError = error as any;
  const status = apiError?.response?.status ?? apiError?.code;
  const message = apiError?.message ?? String(error);
  const details = apiError?.response?.data ?? apiError?.response?.statusText;

  if (status === 401 || status === 403) {
    return { category: "auth", status, message, details };
  }
  if (status === 429) {
    return { category: "rate_limit", status, message, details };
  }
  return { category: "external_api", status, message, details };
}

/**
 * 分類済みの Google API エラーをログ出力する。
 */
export function logGoogleApiError(error: unknown, logger: ErrorLogger) {
  const info = classifyGoogleApiError(error);
  const meta = {
    status: info.status,
    message: info.message,
    details: info.details
  };

  if (info.category === "auth") {
    logger.error("Google API の認証/権限エラーです。", meta);
  } else if (info.category === "rate_limit") {
    logger.error("Google API のレート制限に達しました。", meta);
  } else {
    logger.error("Google API からの応答でエラーが発生しました。", meta);
  }
}

/**
 * Discord webhook の失敗を運用時の初動に合わせて分類する。
 *
 * HTTP 応答エラーと fetch の例外を同じ形へ寄せることで、投稿処理側に
 * ログ文言の分岐を散らさず、再試行判断だけを残します。
 */
export function classifyDiscordWebhookError(error: unknown): OperationErrorInfo {
  if (isDiscordWebhookFailure(error)) {
    const { status, statusText, body } = error;
    const message = statusText || `HTTP ${status}`;

    if (status === 401 || status === 403) {
      return { category: "auth", status, message, details: body };
    }
    if (status === 429) {
      return { category: "rate_limit", status, message, details: body };
    }
    if (status === 400 || status === 404) {
      return { category: "configuration", status, message, details: body };
    }
    return { category: "external_api", status, message, details: body };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { category: "network", message, details: error };
}

/**
 * 分類済みの Discord webhook エラーをログ出力する。
 */
export function logDiscordWebhookError(
  error: unknown,
  logger: ErrorLogger,
  meta: Record<string, unknown> = {}
) {
  const info = classifyDiscordWebhookError(error);
  const logMeta = {
    ...meta,
    status: info.status,
    message: info.message,
    details: info.details
  };

  if (info.category === "auth") {
    logger.error("Discord webhook の認証/権限エラーです。", logMeta);
  } else if (info.category === "rate_limit") {
    logger.error("Discord webhook のレート制限に達しました。", logMeta);
  } else if (info.category === "configuration") {
    logger.error("Discord webhook の設定値または投稿内容に問題があります。", logMeta);
  } else if (info.category === "network") {
    logger.error("Discord webhook への接続でエラーが発生しました。", logMeta);
  } else {
    logger.error("Discord webhook からの応答でエラーが発生しました。", logMeta);
  }
}

function isDiscordWebhookFailure(error: unknown): error is DiscordWebhookFailure {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && typeof (error as DiscordWebhookFailure).status === "number";
}
