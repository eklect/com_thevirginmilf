import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const STEAM_SYNC_STATUSES = ['ok', 'partial', 'failed'] as const;
export type SteamSyncStatus = (typeof STEAM_SYNC_STATUSES)[number];

/**
 * `steam_connection` — the one Steam account this site reads. A singleton:
 * the row's id is always 1.
 *
 * ## Why the key is here and not in `.env` or `site_settings`
 *
 * It is here so she can connect, reconnect and rotate it from the admin screen
 * without anybody opening a terminal. It is NOT in `site_settings` because
 * `GET /site/bootstrap` hands that whole table to anonymous visitors.
 *
 * The key is sealed with `SESSION_ENCRYPTION_SECRET` (`common/secret-box.ts`)
 * and no endpoint ever returns it, sealed or otherwise. Rotating that secret
 * therefore orphans the key as well as every session; `SteamService` reads a
 * failed unseal as "not connected" rather than crashing.
 *
 * `steam_id` is a string: a SteamID64 is 17 digits, past what a JavaScript
 * number can hold exactly.
 */
@Entity('steam_connection')
export class SteamConnectionEntity {
  @PrimaryColumn({ type: 'tinyint', unsigned: true })
  id!: number;

  @Column({ name: 'steam_id', type: 'varchar', length: 20 })
  steamId!: string;

  /** The `/id/<vanity>` name she connected with, when that was how. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  vanity!: string | null;

  @Column({ name: 'api_key_sealed', type: 'text' })
  apiKeySealed!: string;

  @Column({ name: 'persona_name', type: 'varchar', length: 64, nullable: true })
  personaName!: string | null;

  @Column({ name: 'connected_at', type: 'datetime' })
  connectedAt!: Date;

  @Column({ name: 'last_sync_at', type: 'datetime', nullable: true })
  lastSyncAt!: Date | null;

  @Column({ name: 'last_sync_status', type: 'varchar', length: 16, nullable: true })
  lastSyncStatus!: SteamSyncStatus | null;

  @Column({ name: 'last_sync_error', type: 'varchar', length: 500, nullable: true })
  lastSyncError!: string | null;

  @Column({ name: 'last_sync_game_count', type: 'int', nullable: true })
  lastSyncGameCount!: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
