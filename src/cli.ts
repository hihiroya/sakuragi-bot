import { pathToFileURL } from "url";
import { runDailyAgenda } from "./dailyAgenda.js";
import { logger } from "./logger.js";

export async function main() {
  await runDailyAgenda();
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
