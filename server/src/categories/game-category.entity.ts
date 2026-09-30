import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { GameEntity } from '../games/game.entity';
import { CategoryEntity } from './category.entity';

/** `game_categories` — which games are in which collections. */
@Entity('game_categories')
@Index('ix_game_categories_category', ['categoryId'])
export class GameCategoryEntity {
  @PrimaryColumn({ name: 'game_id', type: 'char', length: 36 })
  gameId!: string;

  @PrimaryColumn({ name: 'category_id', type: 'char', length: 36 })
  categoryId!: string;

  @ManyToOne(() => GameEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game?: GameEntity;

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;
}
