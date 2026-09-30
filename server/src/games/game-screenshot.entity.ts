import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UploadEntity } from '../uploads/upload.entity';
import { GameEntity } from './game.entity';

export const SCREENSHOT_SOURCES = ['steam', 'upload'] as const;
export type ScreenshotSource = (typeof SCREENSHOT_SOURCES)[number];

/**
 * `game_screenshots` — a game's gallery, from either source.
 *
 * A Steam shot is two URLs on Steam's CDN, keyed by Steam's own id so a
 * re-sync updates it in place instead of adding it again. An uploaded shot is
 * a row in `uploads`. `sort_order` and `is_hidden` are the admin's and the
 * sync leaves both alone — hiding a spoiler screenshot has to survive the next
 * refresh.
 */
@Entity('game_screenshots')
@Index('ix_game_screenshots_order', ['gameId', 'sortOrder'])
@Index('ux_game_screenshots_steam', ['gameId', 'steamShotId'], { unique: true })
export class GameScreenshotEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'game_id', type: 'char', length: 36 })
  gameId!: string;

  @ManyToOne(() => GameEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game?: GameEntity;

  @Column({ type: 'varchar', length: 16 })
  source!: ScreenshotSource;

  /** Steam's id for the shot. NULL for an upload, so the unique index ignores it. */
  @Column({ name: 'steam_shot_id', type: 'int', nullable: true })
  steamShotId!: number | null;

  @Column({ name: 'url_thumb', type: 'varchar', length: 500, nullable: true })
  urlThumb!: string | null;

  @Column({ name: 'url_full', type: 'varchar', length: 500, nullable: true })
  urlFull!: string | null;

  @Column({ name: 'upload_id', type: 'char', length: 36, nullable: true })
  uploadId!: string | null;

  @ManyToOne(() => UploadEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'upload_id' })
  upload?: UploadEntity | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
