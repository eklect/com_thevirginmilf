import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Where a row came from: one of the two syncs, or pasted by an admin. */
export const VIDEO_SOURCES = ['twitch', 'youtube', 'custom'] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

/** Whose player plays it. A custom link can also be Vimeo. */
export const VIDEO_PROVIDERS = ['twitch', 'youtube', 'vimeo'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

/**
 * What sort of video it is. The first four are Twitch's own words for its
 * video types (`archive` is a past broadcast); `video` is everything else — a
 * YouTube upload or a pasted link.
 */
export const VIDEO_KINDS = [
  'archive',
  'highlight',
  'upload',
  'clip',
  'video',
] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** The Twitch kinds the sync can be told to take or leave. */
export const TWITCH_KINDS = ['archive', 'highlight', 'upload', 'clip'] as const;
export type TwitchKind = (typeof TWITCH_KINDS)[number];

/** The Live page's filter chips. `video` covers Twitch uploads and every other video. */
export const VIDEO_FILTERS = ['archive', 'highlight', 'clip', 'video'] as const;
export type VideoFilter = (typeof VIDEO_FILTERS)[number];

/**
 * `videos` — what the Live page offers when nobody is live: past broadcasts,
 * highlights, uploads and clips from her Twitch, her YouTube uploads, and any
 * video an admin pasted the link of.
 *
 * ## Two owners, like `games`
 *
 * The sync writes `url`, the `source_*` columns, `thumbnail_url`, the
 * duration, dates and counts, and `gone_at`. The admin writes `title` (an
 * override — the site shows `title ?? source_title`), `is_hidden` and
 * `is_pinned`. Neither touches the other's half, so a hide or a renamed title
 * survives every sync.
 *
 * ## Nothing synced is deleted
 *
 * Twitch deletes past broadcasts after a while. When a video stops appearing
 * in a full listing it gets `gone_at` and leaves the site; if it reappears the
 * mark is cleared. Deleting the row instead would lose the admin's half, and
 * the next sync would bring a still-present video straight back. Only a
 * `custom` row can be deleted.
 *
 * `thumbnail_url` is hotlinked as the platform returned it, the same as Steam
 * art — nothing here is uploaded, so the object store has no part in it.
 */
@Entity('videos')
@Index('ux_videos_external', ['provider', 'externalId'], { unique: true })
@Index('ix_videos_listing', ['isHidden', 'goneAt', 'publishedAt'])
export class VideoEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: VideoSource;

  @Column({ type: 'varchar', length: 16 })
  provider!: VideoProvider;

  @Column({ type: 'varchar', length: 16 })
  kind!: VideoKind;

  /** The platform's id: a Twitch video number, a clip slug, a YouTube or Vimeo id. */
  @Column({ name: 'external_id', type: 'varchar', length: 120 })
  externalId!: string;

  /** The canonical watch page on the platform. */
  @Column({ type: 'varchar', length: 500 })
  url!: string;

  /** The channel the sync found it on; null for a custom link. */
  @Column({ name: 'channel_id', type: 'char', length: 36, nullable: true })
  channelId!: string | null;

  // ---------- the sync's half ----------

  @Column({ name: 'source_title', type: 'varchar', length: 300 })
  sourceTitle!: string;

  @Column({ name: 'source_description', type: 'text', nullable: true })
  sourceDescription!: string | null;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 600,
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @Column({
    name: 'duration_seconds',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  durationSeconds!: number | null;

  /** When it went up (or, for a past broadcast, when the broadcast began). UTC. */
  @Column({ name: 'published_at', type: 'datetime' })
  publishedAt!: Date;

  @Column({ name: 'view_count', type: 'int', unsigned: true, nullable: true })
  viewCount!: number | null;

  /** Set when a full listing no longer contains it. Gone rows are not shown. */
  @Column({ name: 'gone_at', type: 'datetime', nullable: true })
  goneAt!: Date | null;

  // ---------- the admin's half ----------

  @Column({ type: 'varchar', length: 300, nullable: true })
  title!: string | null;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  /** Pinned videos lead the list, newest first among themselves. */
  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
