import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { TwitchKind } from './video.entity';

export const VIDEO_SYNC_STATUSES = ['ok', 'partial', 'failed'] as const;
export type VideoSyncStatus = (typeof VIDEO_SYNC_STATUSES)[number];

/**
 * `video_connection` — the keys the video sync reads Twitch and YouTube with.
 * A singleton: the row's id is always 1, written by the migration.
 *
 * WHICH accounts are not here. They are the stream channels in `channels`
 * with a `handle` — the Twitch login and the YouTube channel id the Live
 * page's player already uses — so the player and the video list can never
 * point at different accounts.
 *
 * The secrets are sealed with `SESSION_ENCRYPTION_SECRET`
 * (`common/secret-box.ts`), the same as Steam's key, and no endpoint returns
 * them. Not in `site_settings`, which bootstrap hands to anonymous visitors.
 * A secret that will not unseal reads as "not connected".
 */
@Entity('video_connection')
export class VideoConnectionEntity {
  @PrimaryColumn({ type: 'tinyint', unsigned: true })
  id!: number;

  /** A Twitch app's Client ID. Not a secret — Twitch sends it in every request header. */
  @Column({
    name: 'twitch_client_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  twitchClientId!: string | null;

  @Column({ name: 'twitch_client_secret_sealed', type: 'text', nullable: true })
  twitchClientSecretSealed!: string | null;

  @Column({ name: 'youtube_api_key_sealed', type: 'text', nullable: true })
  youtubeApiKeySealed!: string | null;

  /** The Twitch kinds the sync takes, and the site shows. */
  @Column({ name: 'twitch_kinds', type: 'simple-json' })
  twitchKinds!: TwitchKind[];

  @Column({ name: 'last_sync_at', type: 'datetime', nullable: true })
  lastSyncAt!: Date | null;

  @Column({
    name: 'last_sync_status',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  lastSyncStatus!: VideoSyncStatus | null;

  @Column({
    name: 'last_sync_error',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  lastSyncError!: string | null;

  @Column({ name: 'last_sync_count', type: 'int', nullable: true })
  lastSyncCount!: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
