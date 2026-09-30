import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Where a channel lives. A closed list because the client draws an icon per
 * platform and the Live page only knows how to embed two of them; `other` is
 * the escape hatch for anything new, shown with a generic link icon.
 */
export const CHANNEL_PLATFORMS = [
  'twitch',
  'youtube',
  'kick',
  'tiktok',
  'x',
  'instagram',
  'discord',
  'facebook',
  'email',
  'other',
] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

/**
 * `channels` — every place she can be found, in one hand-ordered list.
 *
 * One table feeds four things: the channel picker on a stream, the Links page,
 * the Live page's embeds, and the footer. They are the same fact — "her Twitch
 * is here" — and keeping it in one row means it is edited once.
 *
 * The two flags say which of those a row takes part in. A Discord invite is a
 * link but not somewhere a stream is broadcast; a second Twitch channel could
 * be a stream channel she does not want on the Links page.
 */
@Entity('channels')
@Index('ix_channels_listing', ['isPublished', 'sortOrder'])
export class ChannelEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index('ux_channels_slug', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 24 })
  platform!: ChannelPlatform;

  /** Where the link goes — `https://…`, or `mailto:` for the business address. */
  @Column({ type: 'varchar', length: 500 })
  url!: string;

  /**
   * The platform's own name for the channel: the Twitch login, or the YouTube
   * channel id. Only the Live page reads it, to build an embed — a channel
   * with no handle is linked to rather than embedded.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  handle!: string | null;

  /** The line under the name on the Links page. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  description!: string | null;

  /** Offered in the channel picker when a stream is scheduled. */
  @Column({ name: 'is_stream_channel', type: 'boolean', default: false })
  isStreamChannel!: boolean;

  @Column({ name: 'show_on_links', type: 'boolean', default: true })
  showOnLinks!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
