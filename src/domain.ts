/**
 * 投稿本文の生成に必要な予定情報。
 *
 * Google Calendar のレスポンス型をアプリ内部へ広げないための境界型です。
 * 本文生成や orchestration はこの型だけを扱うことで、外部 API の型変更に強くします。
 */
export type AgendaEvent = {
  title: string;
  startDate?: string;
  endDate?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
  isBirthday: boolean;
};

/**
 * JST の 1 日分を Google Calendar API に渡すための範囲。
 */
export type TodayRange = {
  timeMin: string;
  timeMax: string;
  label: string;
};
