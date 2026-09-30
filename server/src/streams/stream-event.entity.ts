import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameEntity } from '../games/game.entity';
import { StreamEventChannelEntity } from './stream-event-channel.entity';

/**
 * `stream_events` — one scheduled stream on the calendar.
 *
 * Ordered by when it happens, so there is no `sort_order` and the service is
 * hand-written rather than an `OrderedCrudService`.
 *
 * ## The two stamps are the alert scheduler's memory
 *
 * `announced_at` records that "a stream was scheduled" went out — once, ever.
 *
 * `reminded_start_at` records WHICH start time the "going live soon" reminder
 * was sent for, not merely that one was. Move a stream to tomorrow after its
 * reminder has gone and the two no longer match, so a fresh reminder is due;
 * a plain `reminded_at` would have called it done.
 *
 * Both are short-circuits. The guarantee against a double send is the unique
 * `dedupe_key` on the two outbound queues — see `stream-alerts.scheduler.ts`.
 */
@Entity('stream_events')
@Index('ix_stream_events_starts', ['isPublished', 'startsAt'])
@Index('ix_stream_events_announce', ['isPublished', 'announcedAt'])
export class StreamEventEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /**
   * Markdown, and PUBLIC — it is shown to everyone, signed in or not. The
   * stream link belongs on a channel, which is what the sign-in gate covers;
   * a URL pasted here is visible to the whole internet.
   */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'starts_at', type: 'datetime' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'datetime', nullable: true })
  endsAt!: Date | null;

  /** What she is playing, when it is one game from the library. */
  @Column({ name: 'game_id', type: 'char', length: 36, nullable: true })
  gameId!: string | null;

  @ManyToOne(() => GameEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'game_id' })
  game?: GameEntity | null;

  /** Drafts default OFF the calendar: publishing is what notifies people. */
  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  /** Off, the stream is on the calendar but nobody is emailed or pushed. */
  @Column({ type: 'boolean', default: true })
  notify!: boolean;

  @Column({ name: 'announced_at', type: 'datetime', nullable: true })
  announcedAt!: Date | null;

  @Column({ name: 'reminded_start_at', type: 'datetime', nullable: true })
  remindedStartAt!: Date | null;

  /**
   * When an admin last saved this stream — written by `StreamsService`, from
   * this process's clock.
   *
   * The alert scheduler waits for a stream to sit unedited for a couple of
   * minutes before announcing it, and it compares this against `new Date()`.
   * `updated_at` would not do: MySQL stamps that one from ITS clock and zone,
   * and the scheduler's own stamps would move it.
   */
  @Column({ name: 'edited_at', type: 'datetime' })
  editedAt!: Date;

  @OneToMany(() => StreamEventChannelEntity, (link) => link.event)
  channelLinks?: StreamEventChannelEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
