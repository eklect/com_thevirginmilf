import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Whether a public page is switched on, and how it is labelled in the nav. */
@Entity('page_settings')
export class PageSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  key!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'nav_label', type: 'varchar', length: 64 })
  navLabel!: string;

  /**
   * The page this one hangs under in the navigation, or `null` for a top-level
   * page.
   *
   * A plain self-referencing key with no foreign key on it: `page_settings` is
   * keyed on a closed list in `settings.keys.ts`, both ends are validated
   * there, and a FK to the same table would make the seed's insert order
   * matter for no gain.
   *
   * Nesting is ONE level deep and `SettingsService.setPage` enforces it. It is
   * a navigation arrangement, not a routing one — a sub page keeps its own
   * top-level URL, and `PAGE_PATHS` on the client is untouched by any of this.
   */
  @Column({ name: 'parent_key', type: 'varchar', length: 32, nullable: true })
  parentKey!: string | null;

  /** Position among its siblings — within one parent, not across the whole nav. */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
