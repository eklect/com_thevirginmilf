import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * `subscribers` — who asked to be emailed about streams.
 *
 * There is no user table here and there never will be: MAP owns every
 * identity. This row is a *preference* keyed on MAP's `sub`, not an account.
 * Its sibling is `push_subscriptions`, the same preference for browser
 * notifications; the two are independent, so a person can have either.
 *
 * ## Why the primary key is a surrogate and not `user_id`
 *
 * The unsubscribe link has to keep working for somebody who has deleted their
 * MAP account, and a future email-only subscriber has no `sub` at all. A row
 * that owns its own id survives both; one keyed on `user_id` survives neither.
 *
 * ## Why `email` is cached here rather than read from MAP at send time
 *
 * MAP does expose `GET /api/service/users/:id` under `users:read`, but it is
 * throttled at 60/min. A fan-out to 500 subscribers would be eight minutes of
 * MAP calls for one stream, and it would put a mailing-list concern inside the
 * identity provider whose charter explicitly excludes it.
 *
 * So the address is a cache, and MAP stays the source of truth.
 * `SubscribersService.forUser` writes it through from the verified token on
 * any signed-in request, which makes it eventually consistent with a lag of
 * "next time they visit". Somebody who changes their email and never returns
 * keeps receiving at the old address — which is exactly what the session-free
 * unsubscribe token is for. If that lag ever becomes a real complaint the fix
 * is a slow reconciliation sweep over the stalest rows, comfortably under the
 * throttle. It is not a per-send lookup.
 *
 * ## Unsubscribing is a flag, never a row delete
 *
 * Deleting the row would rotate the token, so the unsubscribe link in every
 * email already delivered would stop working — and re-subscribing would
 * silently forget that the person had ever opted out.
 */
@Entity('subscribers')
@Index('ix_subscribers_active', ['isSubscribed', 'suppressedAt'])
export class SubscriberEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  /**
   * MAP's `sub`. Deliberately no foreign key and deliberately not the PK —
   * see the class comment. NULL is reserved for a future email-only signup;
   * nothing in this build writes one.
   */
  @Index('ux_subscribers_user', { unique: true })
  @Column({ name: 'user_id', type: 'varchar', length: 64, nullable: true })
  userId!: string | null;

  /**
   * Cached from MAP's claims. MySQL 8's default `utf8mb4_0900_ai_ci` makes
   * this unique index case-insensitive, which is what an email address wants.
   */
  @Index('ux_subscribers_email', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  /** The checkbox. Soft state — see the class comment. */
  @Column({ name: 'is_subscribed', type: 'boolean', default: true })
  isSubscribed!: boolean;

  /**
   * base64url of 32 random bytes, looked up by index and never compared in
   * application code. Stable across subscribe/unsubscribe cycles so that an
   * old email's link still works.
   */
  @Index('ux_subscribers_token', { unique: true })
  @Column({ name: 'unsubscribe_token', type: 'varchar', length: 64 })
  unsubscribeToken!: string;

  @Column({ name: 'unsubscribed_at', type: 'datetime', nullable: true })
  unsubscribedAt!: Date | null;

  /**
   * Ticking a box inside an authenticated session IS the confirmation of
   * intent, so this is stamped at creation for MAP-sourced rows. It exists as
   * a column for the email-only signup that would need a real double opt-in.
   */
  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'bounce_count', type: 'smallint', default: 0 })
  bounceCount!: number;

  @Column({ name: 'last_bounce_at', type: 'datetime', nullable: true })
  lastBounceAt!: Date | null;

  /**
   * Hard-bounce suppression. Deliberately separate from `isSubscribed`: one is
   * our decision that we cannot reach them, the other is their decision that
   * they do not want to be reached. Conflating them loses the difference the
   * moment a bounced address starts working again.
   */
  @Column({ name: 'suppressed_at', type: 'datetime', nullable: true })
  suppressedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
