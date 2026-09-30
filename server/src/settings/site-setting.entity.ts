import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** One site-wide value. The key set is closed — see `settings.keys.ts`. */
@Entity('site_settings')
export class SiteSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  /**
   * LONGTEXT, not TEXT. `bio_long` on the About page passed 60 KB of a
   * 64 KB TEXT column in September 2026 with more to come, and MySQL in
   * strict mode refuses a save that crosses the limit rather than truncating
   * it. The author asked for the size that never needs revisiting.
   */
  @Column({ type: 'longtext', nullable: true })
  value!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
