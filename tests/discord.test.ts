import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiscordClient, postToDiscord, sleep } from "../src/discord.js";

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn()
  };
}

describe("postToDiscord", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功時は Discord webhook へ JSON を POST する", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    const logger = createLogger();

    await postToDiscord("おはようございます。", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      logger
    });

    expect(fetchFn).toHaveBeenCalledWith("https://discord.com/api/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "おはようございます。" })
    });
    expect(logger.info).toHaveBeenCalledWith("Discord に投稿しました。", {
      length: "おはようございます。".length
    });
  });

  it("429 の場合は retry-after 秒数を待って再試行する", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "2" }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleepFn = vi.fn(async () => undefined);

    await postToDiscord("本文", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      sleepFn,
      retryDelayMs: 1000
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(2000);
  });

  it("fetch が例外を投げた場合は固定 delay で再試行する", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleepFn = vi.fn(async () => undefined);
    const logger = createLogger();

    await postToDiscord("本文", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      sleepFn,
      logger,
      retryDelayMs: 250
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(250);
    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook への接続でエラーが発生しました。",
      expect.objectContaining({ attempt: 1 })
    );
  });

  it("fetch 例外がリトライ上限に達したら最後の例外を投げる", async () => {
    const error = new Error("network down");
    const fetchFn = vi.fn().mockRejectedValue(error);
    const sleepFn = vi.fn(async () => undefined);
    const logger = createLogger();

    await expect(postToDiscord("本文", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      sleepFn,
      logger,
      retryAttempts: 1
    })).rejects.toThrow(error);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(sleepFn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook への接続でエラーが発生しました。",
      expect.objectContaining({ attempt: 1 })
    );
  });

  it("非 2xx 応答は分類済みメッセージでログ出力する", async () => {
    const fetchFn = vi.fn(async () => new Response("unknown webhook", {
      status: 404,
      statusText: "Not Found"
    }));
    const logger = createLogger();

    await expect(postToDiscord("本文", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      logger
    })).rejects.toThrow("Discord webhook error: 404 Not Found");

    expect(logger.error).toHaveBeenCalledWith(
      "Discord webhook の設定値または投稿内容に問題があります。",
      expect.objectContaining({
        status: 404,
        message: "Not Found",
        details: "unknown webhook",
        attempt: 1
      })
    );
  });

  it("リトライ上限に達したら最後のエラーを投げる", async () => {
    const fetchFn = vi.fn(async () => new Response("server error", {
      status: 500,
      statusText: "Internal Server Error"
    }));
    const sleepFn = vi.fn(async () => undefined);

    await expect(postToDiscord("本文", {
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn,
      sleepFn,
      retryAttempts: 2,
      retryDelayMs: 10
    })).rejects.toThrow("Discord webhook error: 500 Internal Server Error");

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(10);
  });

  it("sleep は指定ミリ秒後に resolve する", async () => {
    vi.useFakeTimers();

    const promise = sleep(100);
    const resolved = vi.fn();
    void promise.then(resolved);

    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toHaveBeenCalledOnce();
  });
});

describe("createDiscordClient", () => {
  it("webhook URL を閉じ込めた client として投稿する", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createDiscordClient({
      webhookUrl: "https://discord.com/api/webhooks/test",
      fetchFn
    });

    await client.post("本文");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "本文" })
      })
    );
  });
});
