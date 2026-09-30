import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * `push_subscriptions` — one browser on one device that asked for
 * notifications.
 *
 * Like `subscribers`, this is a preference keyed on MAP's `sub`, not an
 * account. A person has one row per browser they switched it on in, and
 * switching it off deletes the row: unlike an email address there is no
 * link in the wild that has to keep working afterwards.
 *
 * `endpoint` is a URL at the browser vendor's push service and can run past
 * what MySQL will index, so uniqueness is on its SHA-256. The upsert re-keys
 * `user_id`: when a second person signs in on the same browser and enables
 * notifications, the subscription becomes theirs rather than delivering one
 * person's alerts under another's session.
 */
@Entity('push_subscriptions')
export class PushSubscriptionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  /** MAP's `sub`. Never a foreign key: MAP owns users. */
  @Index('ix_push_subscriptions_user')
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 1024 })
  endpoint!: string;

  @Index('ux_push_subscriptions_endpoint', { unique: true })
  @Column({ name: 'endpoint_hash', type: 'char', length: 64 })
  endpointHash!: string;

  @Column({ type: 'varchar', length: 255 })
  p256dh!: string;

  @Column({ type: 'varchar', length: 255 })
  auth!: string;

  /** For the account page's "this device" line; trusted for nothing. */
  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'failure_count', type: 'smallint', default: 0 })
  failureCount!: number;

  @Column({ name: 'last_success_at', type: 'datetime', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ name: 'last_failure_at', type: 'datetime', nullable: true })
  lastFailureAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
