import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { DetailLevel } from '../calendar-export/detail-level';

/**
 * `calendar_feed_tokens` — one signed-in visitor's private subscription to
 * the stream calendar: the address Google Calendar or Outlook re-reads. Only
 * the SHA-256 of the secret is kept; one live feed per person. Because the
 * owner is signed in, a feed at Full details carries the watch links the
 * calendar page gives a signed-in visitor.
 */
@Entity('calendar_feed_tokens')
@Index('ux_calendar_feed_tokens_hash', ['tokenHash'], { unique: true })
@Index('ix_calendar_feed_tokens_owner', ['ownerUserId'])
export class CalendarFeedTokenEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  /** MAP `sub`. */
  @Column({ name: 'owner_user_id', type: 'varchar', length: 64 })
  ownerUserId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 8 })
  level!: DetailLevel;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @Column({ name: 'last_fetched_at', type: 'datetime', nullable: true })
  lastFetchedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt!: Date | null;
}
