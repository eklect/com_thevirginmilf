import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { IsoDateTransformer } from '../common/database/transformers';

/**
 * `auth_sessions` — this app's half of a signed-in browser.
 *
 * The browser holds an opaque cookie and nothing else. MAP's access and refresh
 * tokens live here, server-side, which is the whole point of the
 * backend-for-frontend arrangement: MAP returns the refresh token in the JSON
 * body rather than in a cookie of its own, so a browser client would have to
 * park a renewable 30-day credential somewhere reachable by script. Here, it is
 * never sent to the browser at all.
 *
 *
 * ## Why the cookie value is hashed
 *
 * Same reasoning as MAP's `sso_sessions`: the column is a bearer credential. A
 * leaked database backup, a stray log line, or a SQL-injection read anywhere in
 * the app would otherwise hand over live sessions. SHA-256 is enough — the value
 * is 32 bytes of CSPRNG output, so there is no dictionary to run and no reason
 * for a slow KDF on a per-request lookup.
 */
@Entity('auth_sessions')
export class AuthSessionEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  /** SHA-256 of the cookie value, hex. The raw token is never stored. */
  @Index('ux_auth_sessions_token', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  /** MAP `sub`. Indexed because "sign out everywhere" revokes by user. */
  @Index('ix_auth_sessions_user')
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  /**
   * MAP's `sid` claim — the SSO session this one hangs off.
   *
   * Indexed because it is how a single MAP logout reaches every local session
   * that descends from it, without waiting for each to notice its own token has
   * stopped refreshing.
   */
  @Index('ix_auth_sessions_map_session')
  @Column({ name: 'map_session_id', type: 'varchar', length: 64 })
  mapSessionId!: string;

  /** Sealed with `SESSION_ENCRYPTION_SECRET` — see `common/secret-box.ts`. */
  @Column({ name: 'access_token', type: 'text' })
  accessToken!: string;

  @Column({ name: 'refresh_token', type: 'text' })
  refreshToken!: string;

  @Column({
    name: 'access_expires_at',
    type: 'varchar',
    length: 30,
    transformer: IsoDateTransformer,
  })
  accessExpiresAt!: string;

  @Column({
    name: 'created_at',
    type: 'varchar',
    length: 30,
    transformer: IsoDateTransformer,
  })
  createdAt!: string;

  @Column({
    name: 'last_seen_at',
    type: 'varchar',
    length: 30,
    transformer: IsoDateTransformer,
  })
  lastSeenAt!: string;

  /** `NULL` means live. Set on logout, on a failed refresh, or on revocation. */
  @Column({
    name: 'revoked_at',
    type: 'varchar',
    length: 30,
    nullable: true,
    transformer: IsoDateTransformer,
  })
  revokedAt!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;
}
