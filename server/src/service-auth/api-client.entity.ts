import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * `api_clients` — the keys this venture has issued to other SERVERS.
 *
 * One row per key. The secret is never stored: `secret_hash` is the SHA-256 of
 * a 32-byte random value shown once at creation, and `secret_last4` is what the
 * admin screen prints so somebody can tell two keys apart. Revoking sets
 * `revoked_at`; the row stays as the record of what was issued, and every
 * token minted from it stops working at once — the guard re-reads the row.
 *
 * `created_by` / `revoked_by` are MAP `sub`s. `user_purge.py` has a recipe for
 * both columns.
 */
@Entity('api_clients')
export class ApiClientEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index('ux_api_clients_client_id', { unique: true })
  @Column({ name: 'client_id', type: 'varchar', length: 40 })
  clientId: string;

  @Column({ name: 'secret_hash', type: 'char', length: 64 })
  secretHash: string;

  @Column({ name: 'secret_last4', type: 'char', length: 4 })
  secretLast4: string;

  @Column({ type: 'json' })
  scopes: string[];

  @Column({ name: 'created_by', type: 'varchar', length: 64 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'varchar', length: 64, nullable: true })
  revokedBy: string | null;
}
