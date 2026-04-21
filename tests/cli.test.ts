import { pathToFileURL } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runDailyAgenda = vi.fn(async () => undefined);

vi.mock("../src/dailyAgenda.js", () => ({
  runDailyAgenda
}));

const { isDirectExecution, main, parseCliOptions } = await import("../src/cli.js");

beforeEach(() => {
  runDailyAgenda.mockClear();
});

describe("main", () => {
  it("daily agenda の実行を委譲する", async () => {
    await main();

    expect(runDailyAgenda).toHaveBeenCalledWith({
      dryRun: false
    });
  });

  it("CLI オプションを daily agenda へ渡す", async () => {
    await main(["node", "dist/cli.js", "--dry-run", "--date", "2026-04-22"]);

    expect(runDailyAgenda).toHaveBeenCalledWith({
      dryRun: true,
      date: "2026-04-22"
    });
  });
});

describe("parseCliOptions", () => {
  it("--dry-run と --date を解析する", () => {
    expect(parseCliOptions(["--dry-run", "--date", "2026-04-22"])).toEqual({
      dryRun: true,
      date: "2026-04-22"
    });
  });

  it("--date=YYYY-MM-DD 形式も解析する", () => {
    expect(parseCliOptions(["--date=2026-04-22"])).toEqual({
      dryRun: false,
      date: "2026-04-22"
    });
  });

  it("--date の値がない場合はエラーを投げる", () => {
    expect(() => parseCliOptions(["--date"]))
      .toThrow("--date は YYYY-MM-DD 形式の日付を指定してください。");
  });

  it("未知のオプションはエラーを投げる", () => {
    expect(() => parseCliOptions(["--unknown"]))
      .toThrow("未知のオプションです: --unknown");
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
