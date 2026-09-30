import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameEntity } from '../games/game.entity';

/**
 * `reviews` — what she thinks of a game, in her own words.
 *
 * Many per game on purpose: first impressions at five hours and a verdict at
 * fifty are different pieces, and the second should not have to overwrite the
 * first. The star rating is NOT here — it lives on the game, because it is one
 * number she can set in a click without writing anything.
 *
 * Every review is hers, so there is no byline column and nothing here holds a
 * MAP `sub`.
 */
@Entity('reviews')
@Index('ix_reviews_game', ['gameId', 'isPublished', 'publishedAt'])
export class ReviewEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'game_id', type: 'char', length: 36 })
  gameId!: string;

  @ManyToOne(() => GameEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game?: GameEntity;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Markdown source — see the content standard in the estate docs. */
  @Column({ type: 'mediumtext' })
  body!: string;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  /** Stamped the first time it is published; hers to change afterwards. */
  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
