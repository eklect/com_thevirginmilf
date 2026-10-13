import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The kinds of mail this venture sends, as a closed list.
 *
 * The shared module elsewhere also lists `password_reset` and
 * `complete_profile`; this venture sends neither (MAP owns the password, and
 * nobody here is invited), so they are gone — every kind listed must have a
 * call site and an entry in `EMAIL_KINDS` (`email-templates/kinds.ts`). The
 * column is a varchar, so the list is a type, not a constraint. The two
 * `stream_*` kinds are this venture's own: keeping subscribers in the loop is
 * what the site is for. The list staying closed is what stops
 * `outbound_emails` becoming a junk drawer.
 */
export const OUTBOUND_KINDS = ['welcome', 'stream_announced', 'stream_reminder'] as const;
export type OutboundKind = (typeof OUTBOUND_KINDS)[number];

/**
 * The kinds a person can opt out of by removing this venture in MAP's portal
 * (`map_optouts`). Everything else is transactional — today only the
 * welcome — and goes regardless: it is about the account, not about hearing
 * from the venture. Keep this in step with `marketing` in `EMAIL_KINDS`.
 */
export const MARKETING_KINDS: readonly OutboundKind[] = ['stream_announced', 'stream_reminder'];

/**
 * `logged` is terminal and means "`MAIL_ENABLED` was off, so this went to the
 * log instead". It is kept distinct from `sent` so that turning a venture's
 * mail on later never leaves anyone guessing which rows were really delivered.
 * `skipped` is terminal too: a marketing kind whose recipient had opted out at
 * MAP by the time the drain reached it (`last_error = 'map_opt_out'`).
 */
export const OUTBOUND_STATUSES = [
  'pending',
  'sending',
  'sent',
  'logged',
  'skipped',
  'dead',
] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

/**
 * `outbound_emails` — the queue.
 *
 * Adapted from `com_alimucci/server/src/mail/`, which is where the estate's
 * queue-with-retry was first built; the transport is SendGrid rather than SMTP,
 * and a message carries HTML beside its plain text.
 *
 * A feature enqueues and returns. `MailQueueScheduler` drains every minute, so
 * a SendGrid outage delays mail rather than failing somebody's signup.
 *
 * ## `dedupeKey` is the idempotence guarantee
 *
 * `welcome:<userId>`, `stream_reminder:<event>:<start>:<subscriber>` and so on. A retried
 * request, a double-clicked button, a replayed import — all of them collide on
 * this unique index and become no-ops.
 */
@Entity('outbound_emails')
@Index('ix_outbound_due', ['status', 'nextAttemptAt'])
export class OutboundEmailEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: OutboundKind;

  @Index('ux_outbound_dedupe', { unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 191 })
  dedupeKey!: string;

  /** MAP's `sub` for the person, when there is one. Never a foreign key: MAP owns users. */
  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  /**
   * Denormalized at enqueue on purpose: the address a message was sent to is a
   * fact about that message, and must not move if the person changes theirs.
   */
  @Column({ name: 'to_email', type: 'varchar', length: 320 })
  toEmail!: string;

  /** Null means `MAIL_FROM`. Set when the sender depends on the message (MAP's per-app branding). */
  @Column({ name: 'from_address', type: 'varchar', length: 320, nullable: true })
  fromAddress!: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ name: 'body_text', type: 'mediumtext' })
  bodyText!: string;

  @Column({ name: 'body_html', type: 'mediumtext', nullable: true })
  bodyHtml!: string | null;

  @Column({ type: 'json', nullable: true })
  headers!: Record<string, string> | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: OutboundStatus;

  /** The drain's claim token — see `MailQueueService.drain`. */
  @Column({ name: 'claim_id', type: 'char', length: 36, nullable: true })
  claimId!: string | null;

  @Column({ name: 'claimed_at', type: 'datetime', nullable: true })
  claimedAt!: Date | null;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'smallint', default: 5 })
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
