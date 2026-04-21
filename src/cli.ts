import { pathToFileURL } from "url";
import { runDailyAgenda } from "./dailyAgenda.js";
import { logger } from "./logger.js";

export type CliOptions = {
  dryRun: boolean;
  date?: string;
};

export async function main(argv = process.argv) {
  await runDailyAgenda(parseCliOptions(argv.slice(2)));
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--date") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--date は YYYY-MM-DD 形式の日付を指定してください。");
      }
      options.date = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--date=")) {
      const value = arg.slice("--date=".length);
      if (!value) {
        throw new Error("--date は YYYY-MM-DD 形式の日付を指定してください。");
      }
      options.date = value;
      continue;
    }

    throw new Error(`未知のオプションです: ${arg}`);
  }

  return options;
}

export function isDirectExecution(importMetaUrl: string, argv = process.argv): boolean {
  const entryPoint = argv[1];
  return entryPoint ? importMetaUrl === pathToFileURL(entryPoint).href : false;
}

/* v8 ignore next 4 -- process.exit を伴う最終防衛のため、main と起動判定を単体検証する。 */
export function handleFatalError(error: unknown): never {
  logger.error("アプリケーションの実行中に致命的なエラーが発生しました。", { error });
  process.exit(1);
}

/* v8 ignore next 3 -- 直接実行時の配線。判定関数と main は単体テストで検証する。 */
if (isDirectExecution(import.meta.url)) {
  main().catch(handleFatalError);
}
