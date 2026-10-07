import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * `map_optouts` — the people who removed this venture in MAP's portal.
 *
 * Removing a venture from "Your sites" is the estate's per-venture opt-out:
 * from then on that venture sends the person no marketing email and no push,
 * whatever they had ticked here. MAP keeps the fact (`application_installs`
 * with `removed_at` set) and exposes it over the service plane; this table is
 * a mirror of that list, refreshed every five minutes by
 * `MapOptoutsScheduler`, so a fan-out of hundreds never calls MAP per row.
 *
 * It is a VETO layered over the venture's own preference, not a change to
 * it: `subscribers.is_subscribed` and `push_subscriptions` are left exactly
 * as the person set them. Re-installing the venture drops the row on the
 * next sync and what they had chosen resumes.
 *
 * Keyed on MAP's `sub`. Never a foreign key: MAP owns users.
 */
@Entity('map_optouts')
export class MapOptoutEntity {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  /** When this row first appeared in the feed — the sync's `asOf`, not MAP's own stamp. */
  @Column({ name: 'opted_out_at', type: 'datetime', precision: 6 })
  optedOutAt!: Date;

  /** The last sync that saw this `sub` in the feed. */
  @Column({ name: 'synced_at', type: 'datetime', precision: 6 })
  syncedAt!: Date;
}
