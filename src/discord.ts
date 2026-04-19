import { logDiscordWebhookError, type DiscordWebhookFailure } from "./errors.js";

export const POST_RETRY_ATTEMPTS = 3;
export const POST_RETRY_DELAY_MS = 1000;

export type PostLogger = {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
};

export type PostOptions = {
  webhookUrl: string;
  fetchFn?: typeof fetch;
  logger?: PostLogger;
  sleepFn?: (ms: number) => Promise<void>;
  retryAttempts?: number;
  retryDelayMs?: number;
};

export type DiscordClient = {
  post(content: string): Promise<void>;
};

export type DiscordClientOptions = Omit<PostOptions, "webhookUrl"> & {
  webhookUrl: string;
};

/**
 * Discord webhook 投稿 client を作成する。
 *
 * webhook URL を client 作成時に閉じ込め、呼び出し側が投稿ごとに secret を扱わない
 * 形にすることで、ログやテストで URL を誤って露出させるリスクを下げます。
 */
export function createDiscordClient(options: DiscordClientOptions): DiscordClient {
  return {
    post(content: string) {
      return postToDiscord(content, options);
    }
  };
}

/**
 * Discord webhook へ投稿する。
 */
export async function postToDiscord(
  content: string,
  {
    webhookUrl,
    fetchFn = fetch,
    logger,
    sleepFn = sleep,
    retryAttempts = POST_RETRY_ATTEMPTS,
    retryDelayMs = POST_RETRY_DELAY_MS
  }: PostOptions
) {
  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetchFn(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
    } catch (error) {
      if (logger) {
        logDiscordWebhookError(error, logger, { attempt });
      }
      if (attempt === retryAttempts) {
        throw error;
      }
      await sleepFn(retryDelayMs);
      continue;
    }

    if (response.ok) {
      logger?.info("Discord に投稿しました。", { length: content.length });
      return;
    }

    const failure: DiscordWebhookFailure = {
      status: response.status,
      statusText: response.statusText,
      body: await response.text()
    };

    if (logger) {
      logDiscordWebhookError(failure, logger, { attempt });
    }

    if (isRetryableWebhookFailure(failure.status) && attempt < retryAttempts) {
      const retryAfter = Number(response.headers.get("retry-after")) || retryDelayMs / 1000;
      await sleepFn(retryAfter * 1000);
      continue;
    }

    throw new Error(`Discord webhook error: ${failure.status} ${failure.statusText}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableWebhookFailure(status: number): boolean {
  // 設定ミスは待っても改善しないため、Discord 側の一時障害とレート制限だけ再試行します。
  return status === 429 || status >= 500;
}
