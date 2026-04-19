import { pathToFileURL } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runDailyAgenda = vi.fn(async () => undefined);

vi.mock("../src/dailyAgenda.js", () => ({
  runDailyAgenda
}));

const { isDirectExecution, main } = await import("../src/cli.js");

beforeEach(() => {
  runDailyAgenda.mockClear();
});

describe("main", () => {
  it("daily agenda の実行を委譲する", async () => {
    await main();

    expect(runDailyAgenda).toHaveBeenCalledOnce();
  });
});

describe("isDirectExecution", () => {
  it("argv[1] が import.meta.url と一致する場合は直接実行として扱う", () => {
    const entryPoint = "F:\\GitHub\\sakuragi-bot\\dist\\cli.js";

    expect(isDirectExecution(pathToFileURL(entryPoint).href, [
      "node",
      entryPoint
    ])).toBe(true);
  });

  it("argv[1] が別ファイルの場合は import として扱う", () => {
    expect(isDirectExecution("file:///F:/GitHub/sakuragi-bot/dist/cli.js", [
      "node",
      "F:\\GitHub\\sakuragi-bot\\dist\\other.js"
    ])).toBe(false);
  });

  it("argv[1] がない場合は import として扱う", () => {
    expect(isDirectExecution("file:///F:/GitHub/sakuragi-bot/dist/cli.js", [
      "node"
    ])).toBe(false);
  });
});
