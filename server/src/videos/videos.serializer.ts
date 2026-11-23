import type { VideoEntity } from './video.entity';

/**
 * What a visitor gets. No raw paste and no description: the client builds
 * the player from `provider`, `kind` and `externalId`, and `url` is only the
 * "Watch on Twitch" link out.
 */
export const toVideoView = (row: VideoEntity) => ({
  id: row.id,
  provider: row.provider,
  kind: row.kind,
  externalId: row.externalId,
  url: row.url,
  title: row.title ?? row.sourceTitle,
  thumbnailUrl: row.thumbnailUrl,
  durationSeconds: row.durationSeconds,
  publishedAt: row.publishedAt,
  isPinned: row.isPinned,
});

/** The admin list: both halves, so the screen can show what an override replaced. */
export const toAdminVideoView = (row: VideoEntity) => ({
  ...toVideoView(row),
  source: row.source,
  sourceTitle: row.sourceTitle,
  titleOverride: row.title,
  isHidden: row.isHidden,
  goneAt: row.goneAt,
  viewCount: row.viewCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
