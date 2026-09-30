import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * `categories` — a hand-made collection of similar games.
 *
 * Deliberately not Steam's genres: those arrive with every sync and say what
 * the store thinks a game is. A category is her own grouping — "Cozy", "Games
 * that made me scream" — and a game can sit in as many as she likes.
 */
@Entity('categories')
@Index('ix_categories_listing', ['isPublished', 'sortOrder'])
export class CategoryEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index('ux_categories_slug', { unique: true })
  @Column({ type: 'varchar', length: 96 })
  slug!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
