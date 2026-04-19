import { describe, expect, it, vi } from "vitest";
import {
  classifyDiscordWebhookError,
  classifyGoogleApiError,
  logDiscordWebhookError,
  logGoogleApiError
} from "../src/errors.js";

function createLogger() {
  return {
    error: vi.fn()
  };
}

describe("classifyGoogleApiError", () => {
  it("401/403 は認証・権限エラーとして分類する", () => {
    expect(classifyGoogleApiError({
      response: {
        status: 403,
        data: { reason: "permission denied" }
      },
      message: "forbidden"
    })).toEqual({
      category: "auth",
      status: 403,
      message: "forbidden",
      details: { reason: "permission denied" }
    });
  });

  it("429 はレート制限として分類する", () => {
    expect(classifyGoogleApiError({ code: 429, message: "rate limited" }))
      .toEqual({
        category: "rate_limit",
        status: 429,
        message: "rate limited",
        details: undefined
      });
  });

  it("その他のエラーは外部 API エラーとして分類する", () => {
    expect(classifyGoogleApiError(new Error("temporary failure")))
      .toEqual({
        category: "external_api",
        status: undefined,
        message: "temporary failure",
        details: undefined
      });
  });
});

describe("logGoogleApiError", () => {
  it("認証・権限エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logGoogleApiError({ code: 401, message: "unauthorized" }, logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Google API の認証/権限エラーです。",
      expect.objectContaining({ status: 401, message: "unauthorized" })
    );
  });

  it("レート制限エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logGoogleApiError({ code: 429, message: "rate limited" }, logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Google API のレート制限に達しました。",
      expect.objectContaining({ status: 429, message: "rate limited" })
    );
  });

  it("その他の Google API エラーを汎用メッセージでログ出力する", () => {
    const logger = createLogger();

    logGoogleApiError(new Error("temporary failure"), logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Google API からの応答でエラーが発生しました。",
      expect.objectContaining({ message: "temporary failure" })
    );
  });
});

describe("classifyDiscordWebhookError", () => {
  it("401/403 は認証・権限エラーとして分類する", () => {
    expect(classifyDiscordWebhookError({
      status: 401,
      statusText: "Unauthorized",
      body: "invalid token"
    })).toEqual({
      category: "auth",
      status: 401,
      message: "Unauthorized",
      details: "invalid token"
    });
  });

  it("429 はレート制限として分類する", () => {
    expect(classifyDiscordWebhookError({
      status: 429,
      statusText: "Too Many Requests",
      body: "rate limited"
    })).toEqual({
      category: "rate_limit",
      status: 429,
      message: "Too Many Requests",
      details: "rate limited"
    });
  });

  it("400/404 は設定または投稿内容の問題として分類する", () => {
    expect(classifyDiscordWebhookError({
      status: 404,
      statusText: "Not Found",
      body: "unknown webhook"
    })).toEqual({
      category: "configuration",
      status: 404,
      message: "Not Found",
      details: "unknown webhook"
    });
  });

  it("5xx は外部 API エラーとして分類する", () => {
    expect(classifyDiscordWebhookError({
      status: 503,
      statusText: "Service Unavailable",
      body: "maintenance"
    })).toEqual({
      category: "external_api",
      status: 503,
      message: "Service Unavailable",
      details: "maintenance"
    });
  });

  it("fetch 例外はネットワークエラーとして分類する", () => {
    const error = new Error("network down");

    expect(classifyDiscordWebhookError(error)).toEqual({
      category: "network",
      message: "network down",
      details: error
    });
  });
});

describe("logDiscordWebhookError", () => {
  it("認証・権限エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logDiscordWebhookError({
      status: 403,
      statusText: "Forbidden",
      body: "missing access"
    }, logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook の認証/権限エラーです。",
      expect.objectContaining({
        status: 403,
        message: "Forbidden",
        details: "missing access"
      })
    );
  });

  it("レート制限エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logDiscordWebhookError({
      status: 429,
      statusText: "Too Many Requests",
      body: "slow down"
    }, logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook のレート制限に達しました。",
      expect.objectContaining({
        status: 429,
        message: "Too Many Requests",
        details: "slow down"
      })
    );
  });

  it("設定系エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logDiscordWebhookError({
      status: 400,
      statusText: "Bad Request",
      body: "invalid payload"
    }, logger, { attempt: 1 });

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook の設定値または投稿内容に問題があります。",
      expect.objectContaining({
        attempt: 1,
        status: 400,
        message: "Bad Request",
        details: "invalid payload"
      })
    );
  });

  it("ネットワークエラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logDiscordWebhookError(new Error("network down"), logger, { attempt: 2 });

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook への接続でエラーが発生しました。",
      expect.objectContaining({
        attempt: 2,
        message: "network down"
      })
    );
  });

  it("外部 API エラーを専用メッセージでログ出力する", () => {
    const logger = createLogger();

    logDiscordWebhookError({
      status: 503,
      statusText: "Service Unavailable",
      body: "temporary failure"
    }, logger);

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook からの応答でエラーが発生しました。",
      expect.objectContaining({
        status: 503,
        message: "Service Unavailable",
        details: "temporary failure"
      })
    );
  });
});
