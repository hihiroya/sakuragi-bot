# sakuragi-bot

Google Calendar の当日予定を Discord webhook へ投稿する bot です。

## 必要な設定

環境変数、またはリポジトリ直下の `config.json` で設定します。環境変数がある場合はそちらを優先します。

| 環境変数 | config.json | 説明 |
| --- | --- | --- |
| `GOOGLE_CALENDAR_ID` | `googleCalendarId` | 投稿対象の Google Calendar ID |
| `DISCORD_WEBHOOK_URL` | `discordWebhookUrl` | 投稿先の Discord webhook URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | - | Google サービスアカウント JSON の文字列 |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | `googleServiceAccountPath` | Google サービスアカウント JSON ファイルのパス |
| `MESSAGE_TEMPLATE_PATH` | `messageTemplatePath` | 投稿文テンプレート JSON ファイルのパス |
| `POST_WHEN_NO_EVENTS` | `postWhenNoEvents` | 予定がない日も Discord へ投稿するか |

`GOOGLE_SERVICE_ACCOUNT_JSON` が JSON 文字列として設定されている場合は、ファイルパスより優先されます。
`config.json` は JSON object として読み込み、既知の設定キーは文字列であることを検証します。前後の空白は取り除き、空白だけの値は未設定として扱います。未知のキーは無視されます。
`MESSAGE_TEMPLATE_PATH` が未設定の場合は、リポジトリ直下の `message-template.json` を読み込みます。テンプレートファイルがない、または読み込みに失敗した場合は既定文言で投稿します。
`postWhenNoEvents` のデフォルトは `false` です。予定がない日は投稿せず、ログに `Skipped: YYYY-MM-DD (0 events)` を出します。予定なしの日も投稿したい場合は `config.json` で `true`、または環境変数 `POST_WHEN_NO_EVENTS=true` を設定してください。

## 投稿文テンプレート

投稿本文の文言は `message-template.json` で編集できます。すべてのキーは任意です。未設定のキーや空白だけの値は既定文言で補完します。

```json
{
  "greeting": "おはようございます。",
  "noEventsLine": "{{date}} の予定はありません。",
  "agendaLine": "{{date}} の予定です。",
  "birthdayHeader": "🎉 本日の誕生日",
  "agendaHeader": "📅 本日の予定",
  "birthdayLine": "・🎂 {{title}}{{details}} おめでとうございます",
  "allDayEventLine": "・📅 {{title}}{{details}}",
  "timedEventLine": "・🕒️ {{time}}: {{title}}{{details}}",
  "untimedEventLine": "・{{title}}{{details}}",
  "locationDetail": " (📍: {{location}})",
  "descriptionDetail": " (💬: {{description}})",
  "omissionLine": "...他 {{count}} 件の予定があります"
}
```

使える placeholder は以下です。

| キー | placeholder |
| --- | --- |
| `noEventsLine`, `agendaLine` | `{{date}}` |
| `birthdayLine` | `{{title}}`, `{{details}}` |
| `allDayEventLine`, `untimedEventLine` | `{{title}}`, `{{details}}` |
| `timedEventLine` | `{{time}}`, `{{title}}`, `{{details}}` |
| `locationDetail` | `{{location}}` |
| `descriptionDetail` | `{{description}}` |
| `omissionLine` | `{{count}}` |

## Google Calendar の共有手順

Google Calendar API はサービスアカウントで読み取ります。運用前に、対象カレンダーをサービスアカウントへ共有してください。

1. Google Cloud でサービスアカウントを作成します。
2. サービスアカウントに JSON キーを発行します。
3. JSON 内の `client_email` を控えます。
4. Google Calendar の対象カレンダー設定を開きます。
5. `特定のユーザーまたはグループと共有する` に `client_email` を追加します。
6. 権限は `予定の表示（すべての予定の詳細）` を付与します。
7. GitHub Actions で使う場合は、JSON 全体を `GOOGLE_SERVICE_ACCOUNT_JSON` secret に登録します。

カレンダーを共有していない場合、GitHub Actions の実行時に Google API の 403 エラーになります。

## 設定エラーの見方

起動時に設定値を検証し、不足や形式不正がある場合は Discord 投稿前に停止します。

| エラー | 主な原因 | 対応 |
| --- | --- | --- |
| `Missing configuration: GOOGLE_CALENDAR_ID or config.googleCalendarId` | カレンダー ID が未設定 | `GOOGLE_CALENDAR_ID` secret または `config.json` を設定します。 |
| `Missing configuration: DISCORD_WEBHOOK_URL or config.discordWebhookUrl` | Discord webhook URL が未設定 | `DISCORD_WEBHOOK_URL` secret または `config.json` を設定します。 |
| `DISCORD_WEBHOOK_URL の形式が不正です` | URL 形式ではない、または http/https 以外 | Discord の webhook URL を設定し直します。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_SERVICE_ACCOUNT_PATH` | サービスアカウント JSON が未設定 | GitHub Actions では `GOOGLE_SERVICE_ACCOUNT_JSON` secret を設定します。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON に client_email がありません` | JSON が壊れている、または別形式 | Google Cloud から発行したサービスアカウント JSON 全体を登録します。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON に private_key がありません` | JSON が壊れている、または秘密鍵を含まない | サービスアカウント JSON キーを再発行して登録します。 |
| `Google API の認証/権限エラーです。` | カレンダー未共有、JSON 誤り、権限不足 | `client_email` を対象カレンダーへ共有し、JSON secret を確認します。 |
| `Google API のレート制限に達しました。` | Google API の一時的な制限 | 時間を置いて再実行します。頻発する場合は実行頻度を見直します。 |
| `Discord webhook error: 400 ...` | 本文形式や webhook URL の問題 | webhook URL と投稿本文の生成結果を確認します。 |
| `Discord webhook error: 429 ...` | Discord 側のレート制限 | bot は `retry-after` を見て再試行します。継続する場合は実行頻度を見直します。 |

## 開発コマンド

```bash
npm ci
npm run build
npm test
npm run test:coverage
```

`npm start` は `dist/cli.js` を起動します。事前に `npm run build` で `dist` を生成してください。

## ソース構成

| ファイル | 役割 |
| --- | --- |
| `src/cli.ts` | CLI entrypoint。直接実行時だけ日次処理を起動します。 |
| `src/dailyAgenda.ts` | 設定、予定取得、本文生成、Discord 投稿の orchestration。 |
| `src/calendar.ts` | Google Calendar API との接続と、Google 型から内部予定型への変換。 |
| `src/dependencies.ts` | 日次処理へ注入する依存関係の型定義。 |
| `src/domain.ts` | アプリ内部で使う予定型などのドメイン型。 |
| `src/message.ts` | Discord 投稿本文の生成。 |
| `src/messageTemplate.ts` | 投稿文テンプレートの読み込み・検証・placeholder 置換。 |
| `src/discord.ts` | Discord webhook 投稿と retry 制御。 |
| `src/config.ts` | 設定ファイル・環境変数・URL/JSON 検証。 |
| `src/logger.ts` | winston logger の生成。 |

## Discord 投稿本文の上限

Discord webhook の `content` は 2000 文字までです。

この bot は投稿本文を生成するときに 2000 文字以内へ収めます。予定が多い、または予定名・場所・コメントが長い場合は、入りきる予定だけを本文へ含め、末尾に `...他 N 件の予定があります` を追加します。

通常予定だけでなく誕生日予定が多い場合も同じ上限を守ります。省略表示を追加する余白が足りない場合は、最後に含めた予定を削って省略表示を優先します。

予定の `description` は 1 件あたり 100 文字を超えると `...` 付きで省略します。

## GitHub Actions

GitHub Actions で運用する場合は、リポジトリの `Settings` -> `Secrets and variables` -> `Actions` に以下の repository secrets を設定します。

| Secret | 必須 | 説明 |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 必須 | Google サービスアカウント JSON 全体 |
| `GOOGLE_CALENDAR_ID` | 必須 | 予定を取得する Google Calendar ID |
| `DISCORD_WEBHOOK_URL` | 必須 | 通常投稿先の Discord webhook URL |
| `FAILURE_DISCORD_WEBHOOK_URL` | 任意 | GitHub Actions 失敗通知先の Discord webhook URL |

`FAILURE_DISCORD_WEBHOOK_URL` が未設定の場合、失敗通知ステップはスキップされます。通常投稿そのものには影響しません。

`.github/workflows/ci.yml` では pull request と `main` への push で以下を実行します。

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run coverage:summary
```

`.github/workflows/daily-agenda.yml` は毎日 JST 7:05 に同じ検証を通した後、Discord へ当日予定を投稿します。Coverage の結果は GitHub Actions の job summary に Markdown 表として表示されます。
