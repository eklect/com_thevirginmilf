import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * `map_optouts` — the people who removed this venture in MAP's portal, or
 * unsubscribed from its brand through the signed link in an email.
 *
 * Removing a venture from "Your sites" is the estate's per-venture opt-out:
 * from then on that venture sends the person no opt-out-able email and no
 * push, whatever they had ticked here. An unsubscribe stops the email only;
 * push carries on. `removed` is what tells the two apart. MAP keeps the fact (`application_installs`
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

  /**
   * True when the person REMOVED this venture in the App Directory (the feed's
   * `removed` list) — that vetoes push as well as mail. False means they only
   * unsubscribed from the brand's email, so push still goes to them.
   */
  @Column({ name: 'removed', type: 'boolean', default: false })
  removed!: boolean;

  /** When this row first appeared in the feed — the sync's `asOf`, not MAP's own stamp. */
  @Column({ name: 'opted_out_at', type: 'datetime', precision: 6 })
  optedOutAt!: Date;

  /** The last sync that saw this `sub` in the feed. */
  @Column({ name: 'synced_at', type: 'datetime', precision: 6 })
  syncedAt!: Date;
}
