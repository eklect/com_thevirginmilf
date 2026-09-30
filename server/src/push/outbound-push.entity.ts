import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PushSubscriptionEntity } from './push-subscription.entity';

export const PUSH_KINDS = ['stream_announced', 'stream_reminder'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/**
 * `expired` is terminal and means the notification's moment passed before it
 * could be delivered — a "going live in 30 minutes" that is still queued two
 * hours later is worse than no notification. `logged` means `PUSH_ENABLED`
 * was off, exactly as it does for mail.
 */
export const PUSH_STATUSES = ['pending', 'sending', 'sent', 'logged', 'expired', 'dead'] as const;
export type PushStatus = (typeof PUSH_STATUSES)[number];

/** What the service worker receives and turns into a notification. */
export interface PushPayload {
  title: string;
  body: string;
  /** Where a click goes — a path on this site. */
  url: string;
  /** Same tag replaces rather than stacks, so a duplicate can never pile up. */
  tag: string;
}

/**
 * `outbound_pushes` — the push queue, a sibling of `outbound_emails`.
 *
 * A sibling rather than a `channel` column on the mail table because that
 * table is the same in every repo that carries the mail module, and because a
 * push is addressed to a subscription that can vanish mid-queue, which mail is
 * not. The protocol is deliberately the same: enqueue-or-ignore on a unique
 * `dedupe_key`, claim a batch, drain once a minute, back off and retry.
 *
 * The subscription side cascades. A browser that unsubscribes, or a push
 * service that answers 410 Gone, takes its queued rows with it — there is
 * nobody left to deliver them to.
 */
@Entity('outbound_pushes')
@Index('ix_outbound_pushes_due', ['status', 'nextAttemptAt'])
export class OutboundPushEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: PushKind;

  @Index('ux_outbound_pushes_dedupe', { unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 191 })
  dedupeKey!: string;

  /** MAP's `sub`, denormalized from the subscription at enqueue. */
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Column({ name: 'subscription_id', type: 'char', length: 36 })
  subscriptionId!: string;

  @ManyToOne(() => PushSubscriptionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: PushSubscriptionEntity;

  @Column({ type: 'json' })
  payload!: PushPayload;

  /** After this the row is marked `expired` instead of being sent. */
  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: PushStatus;

  @Column({ name: 'claim_id', type: 'char', length: 36, nullable: true })
  claimId!: string | null;

  @Column({ name: 'claimed_at', type: 'datetime', nullable: true })
  claimedAt!: Date | null;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'smallint', default: 4 })
  maxAttempts!: number;

  @Column({ name: 'next_attempt_at', type: 'datetime' })
  nextAttemptAt!: Date;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
