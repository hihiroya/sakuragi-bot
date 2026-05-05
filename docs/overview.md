# Overview

sakuragi-bot は Google Calendar の当日予定を読み取り、Discord webhook へ投稿する小さな日次 Bot です。ローカル CLI と GitHub Actions のどちらからでも同じ処理を実行します。

```mermaid
flowchart LR
  A[CLI<br/>npm start] --> C[runDailyAgenda]
  B[GitHub Actions<br/>daily-agenda.yml] --> C
  C --> D[Config]
  C --> E[Google Calendar API]
  E --> F[Message Template]
  F --> G[Discord Webhook]
```

## Responsibilities

| 領域 | この Bot が行うこと | 行わないこと |
| --- | --- | --- |
| Calendar | 当日範囲の予定取得、内部形式への変換 | 予定の作成・更新・削除 |
| Message | 誕生日、終日、時間付き、複数日予定の整形 | Discord のリッチ埋め込み生成 |
| Discord | webhook への投稿、429/5xx の再試行 | Bot token による Discord API 操作 |
| Operations | GitHub Actions 定期実行、dry-run | 永続 DB、管理画面 |

## Runtime Flow

```mermaid
sequenceDiagram
  participant Runner as CLI / GitHub Actions
  participant App as runDailyAgenda
  participant Config as config.ts
  participant Calendar as Google Calendar
  participant Discord as Discord Webhook

  Runner->>App: start --date / --dry-run
  App->>Config: load and validate settings
  App->>Calendar: list events by calendarId
  Calendar-->>App: events
  App->>App: build Discord message
  alt dry-run
    App-->>Runner: log generated message
  else post
    App->>Discord: POST content
    Discord-->>App: 2xx / error
  end
```

## Notification Routes

複数の通知先は route として扱います。1 route は 1 つのカレンダーと 1 個以上の Discord webhook を持ちます。

```mermaid
flowchart LR
  R1[route: team-a] --> C1[Calendar A]
  R1 --> W1[Webhook A1]
  R1 --> W2[Webhook A2]

  R2[route: team-b] --> C2[Calendar B]
  R2 --> W3[Webhook B1]
```

同じ `calendarId` を複数 route で使う場合、Google Calendar API への取得は実行内で 1 回にまとめます。webhook 投稿は webhook ごとに行い、一部が失敗しても他の webhook 投稿は継続します。

## Public Repository Notes

公開リポジトリでは、実際の `calendarId`、Discord webhook URL、サービスアカウント JSON をコミットしません。GitHub Actions 運用では Repository secrets に登録します。
