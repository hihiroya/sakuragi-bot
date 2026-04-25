# sakuragi-bot

Google Calendar の当日予定を Discord webhook へ投稿する bot です。

## 必要な設定

環境変数、またはリポジトリ直下の `config.json` で設定します。環境変数がある場合はそちらを優先します。

| 環境変数 | config.json | 説明 |
| --- | --- | --- |
| `GOOGLE_CALENDAR_ID` | `googleCalendarId` | 投稿対象の Google Calendar ID |
| `DISCORD_WEBHOOK_URL` | `discordWebhookUrl` | 投稿先の Discord webhook URL |
| `AGENDA_NOTIFICATIONS_JSON` | `notifications` | 複数カレンダー・複数 webhook の通知設定 JSON |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | - | Google サービスアカウント JSON の文字列 |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | `googleServiceAccountPath` | Google サービスアカウント JSON ファイルのパス |
| `MESSAGE_TEMPLATE_PATH` | `messageTemplatePath` | 投稿文テンプレート JSON ファイルのパス |
| `POST_WHEN_NO_EVENTS` | `postWhenNoEvents` | 予定がない日も Discord へ投稿するか |
| `INCLUDE_LOCATION_ADDRESS` | `includeLocationAddress` | 場所に含まれる日本の住所も Discord へ投稿するか |

`GOOGLE_SERVICE_ACCOUNT_JSON` が JSON 文字列として設定されている場合は、ファイルパスより優先されます。
`AGENDA_NOTIFICATIONS_JSON` が設定されている場合は、複数通知設定として `GOOGLE_CALENDAR_ID` / `DISCORD_WEBHOOK_URL` より優先されます。未設定の場合は従来どおり `GOOGLE_CALENDAR_ID` と `DISCORD_WEBHOOK_URL` から 1 件の通知設定を作ります。
`config.json` は JSON object として読み込み、既知の設定キーは文字列であることを検証します。前後の空白は取り除き、空白だけの値は未設定として扱います。未知のキーは無視されます。
`MESSAGE_TEMPLATE_PATH` が未設定の場合は、リポジトリ直下の `message-template.json` を読み込みます。テンプレートファイルがない、または読み込みに失敗した場合は既定文言で投稿します。
`postWhenNoEvents` のデフォルトは `false` です。予定がない日は投稿せず、ログに `Skipped: default YYYY-MM-DD (0 events)` のように通知設定名つきで出します。予定なしの日も投稿したい場合は `config.json` で `true`、または環境変数 `POST_WHEN_NO_EVENTS=true` を設定してください。
`includeLocationAddress` のデフォルトは `false` です。Google Calendar の場所が `施設名, 日本、〒170-0013 東京都...` のような形式の場合、既定では住所部分を除いて施設名だけを投稿します。住所も投稿したい場合は `config.json` で `true`、または環境変数 `INCLUDE_LOCATION_ADDRESS=true` を設定してください。

## 複数カレンダー・複数 webhook

公開リポジトリで GitHub Actions 運用する場合は、カレンダー ID と Discord webhook URL を `AGENDA_NOTIFICATIONS_JSON` の Repository secret にまとめて登録する方法を推奨します。ソースや `config.json` に実値を置かずに複数通知を管理できます。

`AGENDA_NOTIFICATIONS_JSON` は JSON array です。

```json
[
  {
    "id": "team-a",
    "calendarId": "team-a-calendar.example",
    "webhookUrls": [
      "https://discord.com/api/webhooks/team-a-id/team-a-token"
    ]
  }
]
```

route ごとの上書き設定を含む例は `config.sample.json` を参照してください。

各通知設定の項目は以下です。

| キー | 必須 | 説明 |
| --- | --- | --- |
| `id` | 任意 | ログに出す通知設定名。未指定の場合は `route-1` 形式で補完します。 |
| `calendarId` | 必須 | 予定を取得する Google Calendar ID |
| `webhookUrls` | 必須 | 投稿先 Discord webhook URL の配列。1 カレンダーを複数 Discord へ通知できます。 |
| `messageTemplatePath` | 任意 | この通知設定だけで使う投稿文テンプレート。未指定なら全体設定を使います。 |
| `postWhenNoEvents` | 任意 | この通知設定だけで予定なし投稿の有無を上書きします。 |
| `includeLocationAddress` | 任意 | この通知設定だけで住所表示の有無を上書きします。 |

同じ `calendarId` を複数の通知設定で使う場合でも、Google Calendar API からの予定取得は実行内で 1 回にまとめます。Discord webhook への投稿は webhook ごとに行い、一部 webhook で失敗しても他の webhook への投稿は継続します。失敗が 1 件でもあれば最後に GitHub Actions の job は失敗します。

ローカル検証用には `config.json` の `notifications` に同じ配列を置けます。ただし公開リポジトリでは本物の `calendarId` や `webhookUrls` をコミットしないでください。

## セキュリティとプライバシー

公開リポジトリでは、実際の Google Calendar ID、Discord webhook URL、サービスアカウント JSON をコミットしないでください。GitHub Actions では Repository secrets に登録して運用します。

この bot は Google Calendar の予定名、日時、場所、説明文、誕生日予定を Discord に投稿できます。投稿先チャンネルの閲覧権限を確認し、個人情報・住所・社外秘情報などを含む予定を通知対象にする場合は、組織のルールに従ってください。

サービスアカウントは通知対象のカレンダーだけに共有し、不要になったキーやカレンダー共有は削除してください。

サプライチェーン攻撃対策として、npm の install lifecycle script は既定で無効化しています。`.npmrc` の `ignore-scripts=true` と GitHub Actions の `npm ci --ignore-scripts --no-audit` により、依存パッケージの `postinstall` などが CI や定期実行で動かないようにしています。脆弱性検査は CI の `npm run security:audit` で分離して実行します。

Git URL や tarball URL 由来の依存は install script 無効化の前提を崩す可能性があるため、`npm run security:lockfile` で `package.json` と `package-lock.json` が npm registry 由来の依存だけを使っていることを確認します。

Discord webhook URL は実行時に `https://discord.com/api/webhooks/...` または `https://discordapp.com/api/webhooks/...` だけを許可します。任意の外部 URL へ予定本文や webhook secret を送らないための制限です。

公開前に以下を確認してください。

- `config.json`、サービスアカウント JSON、実際の webhook URL を含むファイルが commit 対象に入っていないこと
- Repository secrets に登録する値へ不要なカレンダーや webhook が含まれていないこと
- 投稿先 Discord チャンネルの閲覧者が、通知される予定情報を見てよい範囲に限られていること
- 初回の GitHub Actions 手動実行では `dry_run=true` のままログを確認し、問題がなければ `dry_run=false` で投稿すること
- Dependabot の依存更新 PR は CI の audit とテストを確認してから取り込むこと

## 投稿文テンプレート

投稿本文の文言は `message-template.json` で編集できます。すべてのキーは任意です。未設定のキーや空白だけの値は既定文言で補完します。
テンプレート値は Markdown 記法や字下げ用の空白を保持します。`* ` のように Markdown リストに必要な半角スペースもそのまま投稿文へ反映されます。

```json
{
  "greeting": "おはようございます。",
  "noEventsLine": "{{date}} の予定はありません。",
  "agendaLine": "{{date}} の予定です。",
  "birthdayHeader": "🎉🎂 本日の誕生日 🎂🎉",
  "agendaHeader": "📅 本日の予定",
  "birthdayLine": "・🎂 {{name}}、お誕生日おめでとうございます！ 🎊{{details}}",
  "expandedBirthdayTitleLine": "🎂✨ {{name}} ✨🎂",
  "expandedBirthdayMessageLine": "　🎊 お誕生日おめでとうございます！",
  "expandedBirthdayWishLine": "　🎁 素敵な一年になりますように",
  "expandedBirthdayLocationLine": "　📍 {{location}}",
  "expandedBirthdayDescriptionLine": "　💬 {{description}}",
  "allDayEventLine": "・📅 {{title}}{{details}}",
  "multiDayAllDayEventLine": "・📅 {{title}}　📅 {{dateRange}}{{details}}",
  "timedEventLine": "・🕒️ {{time}}: {{title}}{{details}}",
  "multiDayTimedEventLine": "・🕒️ {{dateTimeRange}}: {{title}}{{details}}",
  "untimedEventLine": "・{{title}}{{details}}",
  "locationDetail": " (📍: {{location}})",
  "descriptionDetail": " (💬: {{description}})",
  "expandedAllDayEventTitleLine": "・📅 {{title}}",
  "expandedTimedEventTitleLine": "・🕒️ {{title}}",
  "expandedUntimedEventTitleLine": "・{{title}}",
  "expandedProgressLine": "　⏳ {{dayIndex}}日目 / 全{{totalDays}}日（残り{{remainingDays}}日）",
  "expandedFinalDayProgressLine": "　⏳ {{dayIndex}}日目 / 全{{totalDays}}日（最終日）",
  "expandedDateLine": "　📅 {{date}}",
  "expandedDateRangeLine": "　📅 {{dateRange}}",
  "expandedTimeLine": "　🕒 {{time}}",
  "expandedDateTimeRangeLine": "　📅 {{dateTimeRange}}",
  "expandedLocationLine": "　📍 {{location}}",
  "expandedDescriptionLine": "　💬 {{description}}",
  "omissionLine": "...他 {{count}} 件の予定があります"
}
```

使える placeholder は以下です。

| キー | placeholder |
| --- | --- |
| `noEventsLine`, `agendaLine` | `{{date}}` |
| `birthdayLine` | `{{name}}`, `{{title}}`, `{{details}}` |
| `expandedBirthdayTitleLine`, `expandedBirthdayMessageLine`, `expandedBirthdayWishLine` | `{{name}}`, `{{title}}`, `{{details}}` |
| `expandedBirthdayLocationLine` | `{{name}}`, `{{title}}`, `{{location}}` |
| `expandedBirthdayDescriptionLine` | `{{name}}`, `{{title}}`, `{{description}}` |
| `allDayEventLine`, `untimedEventLine` | `{{title}}`, `{{details}}` |
| `multiDayAllDayEventLine` | `{{title}}`, `{{dateRange}}`, `{{details}}` |
| `timedEventLine` | `{{time}}`, `{{title}}`, `{{details}}` |
| `multiDayTimedEventLine` | `{{dateTimeRange}}`, `{{title}}`, `{{details}}` |
| `locationDetail` | `{{location}}` |
| `descriptionDetail` | `{{description}}` |
| `expandedAllDayEventTitleLine`, `expandedTimedEventTitleLine`, `expandedUntimedEventTitleLine` | `{{title}}` |
| `expandedProgressLine` | `{{dayIndex}}`, `{{totalDays}}`, `{{remainingDays}}` |
| `expandedFinalDayProgressLine` | `{{dayIndex}}`, `{{totalDays}}`, `{{remainingDays}}` |
| `expandedDateLine` | `{{date}}` |
| `expandedDateRangeLine` | `{{dateRange}}` |
| `expandedTimeLine` | `{{time}}` |
| `expandedDateTimeRangeLine` | `{{dateTimeRange}}` |
| `expandedLocationLine` | `{{location}}` |
| `expandedDescriptionLine` | `{{description}}` |
| `omissionLine` | `{{count}}` |

誕生日予定はタイトルから `誕生日` や `Birthday` を除いた名前を `{{name}}` として使えます。誕生日予定が 1 件だけの日はカード風の複数行表示、複数件ある日は 1 件 1 行の compact 表示にします。
通常予定が 1 件だけの日は、終日予定・時間付き予定・複数日予定を複数行の詳細表示にします。通常予定が複数件ある日は 1 予定 1 行の compact 表示にします。
複数日の終日予定では、Google Calendar の終了日が排他的であることを考慮して、表示上の終了日は `end.date` の前日になります。進捗の残り日数は当日を含めて計算します。
最終日は `expandedProgressLine` ではなく `expandedFinalDayProgressLine` を使うため、既定では `残り1日` ではなく `最終日` と表示します。
`expandedProgressLine` などの詳細表示用テンプレートは、先頭の空白を保持します。タイトル行のリスト記号の分だけ字下げしたい場合は、既定値のように行頭へ全角スペースを入れてください。

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
| `AGENDA_NOTIFICATIONS_JSON の JSON 解析に失敗しました` | 複数通知設定の JSON が壊れている | Repository secret の JSON array 形式を確認します。 |
| `通知設定 ... に calendarId がありません` | 複数通知設定にカレンダー ID がない | 対象 route に `calendarId` を設定します。 |
| `通知設定 ... に webhookUrls がありません` | 複数通知設定に webhook URL がない | 対象 route に `webhookUrls` 配列を設定します。 |
| `DISCORD_WEBHOOK_URL の形式が不正です` / `Discord webhook URL である必要があります` | URL 形式ではない、https ではない、または Discord webhook endpoint ではない | Discord の webhook URL を設定し直します。 |
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
npm run security:lockfile
npm run security:audit
npm run build
npm test
npm run test:coverage
```

`npm start` は `dist/cli.js` を起動します。事前に `npm run build` で `dist` を生成してください。

任意の日付で確認する場合は `--date YYYY-MM-DD` を指定できます。日付は JST の 00:00-24:00 として扱います。

```bash
npm start -- --date 2026-04-22
```

Discord へ投稿せず、取得した予定から生成される本文だけをログで確認する場合は `--dry-run` を指定します。

```bash
npm start -- --dry-run --date 2026-04-22
```

予定がない日かつ `postWhenNoEvents` が `false` の場合、`--dry-run` でも本文生成は行わずスキップログだけを出します。予定なし本文も確認したい場合は `POST_WHEN_NO_EVENTS=true` を併用してください。

## ソース構成

| ファイル | 役割 |
| --- | --- |
| `src/cli.ts` | CLI entrypoint。直接実行時だけ日次処理を起動します。 |
| `src/dailyAgenda.ts` | 設定、予定取得、本文生成、Discord 投稿の orchestration。 |
| `src/calendar.ts` | Google Calendar API との接続と、Google 型から内部予定型への変換。 |
| `src/dependencies.ts` | 日次処理へ注入する依存関係の型定義。 |
| `src/domain.ts` | アプリ内部で使う予定型などのドメイン型。 |
| `src/eventFormat.ts` | 予定 1 件の種別判定、日数計算、compact/expanded 表示。 |
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

予定の `location` に日本の住所が含まれる場合、既定では住所部分を表示しません。削除対象は `,` または `，` の後ろが `日本、〒123-4567`、`〒123-4567`、`東京都...` など住所と判断できる場合だけです。`Zoom, 第2会議室` のように住所と判断できない場所補足はそのまま表示します。

Google Calendar の説明文に含まれる HTML は投稿前にプレーンテキストへ整形します。`&amp;` などの HTML entity は復号し、HTML タグは除去します。
また、説明文内に `https://www.google.com/url?q=...` 形式の Google リダイレクト URL が含まれる場合は、`q` パラメータの元 URL へ正規化します。

## GitHub Actions

GitHub Actions で運用する場合は、リポジトリの `Settings` -> `Secrets and variables` -> `Actions` に以下の repository secrets を設定します。

| Secret | 必須 | 説明 |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 必須 | Google サービスアカウント JSON 全体 |
| `GOOGLE_CALENDAR_ID` | 単一通知時は必須 | 予定を取得する Google Calendar ID |
| `DISCORD_WEBHOOK_URL` | 単一通知時は必須 | 通常投稿先の Discord webhook URL |
| `AGENDA_NOTIFICATIONS_JSON` | 複数通知時は必須 | 複数カレンダー・複数 webhook の通知設定 JSON array |
| `FAILURE_DISCORD_WEBHOOK_URL` | 任意 | GitHub Actions 失敗通知先の Discord webhook URL |

`FAILURE_DISCORD_WEBHOOK_URL` が未設定の場合、失敗通知ステップはスキップされます。通常投稿そのものには影響しません。
`AGENDA_NOTIFICATIONS_JSON` を設定した場合は、`GOOGLE_CALENDAR_ID` と `DISCORD_WEBHOOK_URL` より優先されます。既存の単一通知運用では `AGENDA_NOTIFICATIONS_JSON` を未設定のまま使えます。

`.github/workflows/ci.yml` では pull request と `main` への push で以下を実行します。

```bash
node scripts/check-lockfile.mjs
npm ci --ignore-scripts --no-audit
npm audit --audit-level=high
npm run build
npm test
npm run test:coverage
npm run coverage:summary
```

`.github/workflows/daily-agenda.yml` は毎日 JST 7:05 に `npm ci --ignore-scripts --no-audit` と `npm run build` を実行した後、Discord へ当日予定を投稿します。定期実行では Google/Discord secrets を投稿ステップだけに渡し、依存インストールや build ステップには渡しません。テスト、coverage、audit は `.github/workflows/ci.yml` で実行します。

手動実行する場合は GitHub Actions の `Run workflow` から以下を指定できます。

| 入力 | 説明 |
| --- | --- |
| `date` | 取得対象日。未指定の場合は実行日の JST 当日。形式は `YYYY-MM-DD`。 |
| `dry_run` | Discord へ投稿せず、生成本文をログで確認します。手動実行時の既定値は `true` です。 |

初回や設定変更後の手動実行では、まず `dry_run` を `true` のまま実行してログを確認してください。実際に Discord へ投稿したい場合は、確認後に `dry_run` を `false` にしてください。
