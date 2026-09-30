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
import { UploadEntity } from '../uploads/upload.entity';

export const GAME_SOURCES = ['steam', 'manual'] as const;
export type GameSource = (typeof GAME_SOURCES)[number];

/** Where the store-page half of a Steam game stands. */
export const STEAM_DETAILS_STATUSES = ['pending', 'ok', 'missing'] as const;
export type SteamDetailsStatus = (typeof STEAM_DETAILS_STATUSES)[number];

/**
 * `games` — everything she plays, from Steam or entered by hand.
 *
 * ## Two owners, and the columns say which
 *
 * A Steam game is written by two parties that must never overwrite each other:
 * the sync, which refreshes what Steam says, and the admin, who corrects it.
 * So the columns are split by owner rather than shared:
 *
 * - `steam_*`, `playtime_*` and `last_played_at` belong to the SYNC. It
 *   rewrites them on every run and touches nothing else.
 * - `title`, `summary`, `description`, `developer`, `publisher`,
 *   `release_text`, `cover_upload_id` and every flag belong to the ADMIN. The
 *   sync never writes them, so a correction survives forever.
 *
 * What the site shows is `admin ?? steam` — see `games.serializer.ts`. For a
 * manual game the `steam_*` half is simply empty and the admin half is all
 * there is.
 *
 * A shared `title` column with a "was this edited?" flag would have been
 * fewer columns and one more thing to get wrong on every sync.
 *
 * ## `steam_app_id` is nullable and unique
 *
 * MySQL allows any number of NULLs in a unique index, so every manual game
 * fits, and the sync's upsert on `steam_app_id` can never match one.
 */
@Entity('games')
@Index('ix_games_favorites', ['isHidden', 'isFavorite'])
@Index('ix_games_playtime', ['isHidden', 'playtimeMinutes'])
export class GameEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  /** Set once at creation and never regenerated — it is the page's URL. */
  @Index('ux_games_slug', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: GameSource;

  @Index('ux_games_steam_app', { unique: true })
  @Column({ name: 'steam_app_id', type: 'int', unsigned: true, nullable: true })
  steamAppId!: number | null;

  /** "Nintendo Switch", "PlayStation 5" — shown for a manual game. Steam games read "Steam". */
  @Column({ name: 'platform_label', type: 'varchar', length: 60, nullable: true })
  platformLabel!: string | null;

  // ---------- admin-owned ----------

  /** Required for a manual game; an override of `steam_name` for a Steam one. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  summary!: string | null;

  /** Markdown — her own notes about the game, above the reviews. */
  @Column({ type: 'mediumtext', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  developer!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  publisher!: string | null;

  /** Free text, because Steam's own is ("Apr 18, 2011", "Coming soon"). */
  @Column({ name: 'release_text', type: 'varchar', length: 60, nullable: true })
  releaseText!: string | null;

  @Column({ name: 'cover_upload_id', type: 'char', length: 36, nullable: true })
  coverUploadId!: string | null;

  @ManyToOne(() => UploadEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_upload_id' })
  coverUpload?: UploadEntity | null;

  /** Off the public site entirely — lists, favorites, and its own page. */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  /** The heart. Puts the game on the favorites list whatever its playtime. */
  @Column({ name: 'is_favorite', type: 'boolean', default: false })
  isFavorite!: boolean;

  /**
   * Keeps a game OFF the automatic half of the favorites list.
   *
   * Playtime is a proxy for liking something and it is sometimes wrong: four
   * hundred hours in a game she would not recommend. Without this the only
   * way to take it off the list would be to hide the game altogether.
   */
  @Column({ name: 'favorites_excluded', type: 'boolean', default: false })
  favoritesExcluded!: boolean;

  /** Stars out of ten, or null for "not rated". */
  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  rating!: number | null;

  // ---------- sync-owned ----------

  @Column({ name: 'steam_name', type: 'varchar', length: 200, nullable: true })
  steamName!: string | null;

  @Column({ name: 'steam_summary', type: 'varchar', length: 1000, nullable: true })
  steamSummary!: string | null;

  /**
   * Stored exactly as the store API returned it, never built from the app id:
   * Steam serves header art from a hashed path that cannot be guessed.
   */
  @Column({ name: 'steam_header_url', type: 'varchar', length: 500, nullable: true })
  steamHeaderUrl!: string | null;

  @Column({ name: 'steam_capsule_url', type: 'varchar', length: 500, nullable: true })
  steamCapsuleUrl!: string | null;

  @Column({ name: 'steam_developers', type: 'varchar', length: 300, nullable: true })
  steamDevelopers!: string | null;

  @Column({ name: 'steam_publishers', type: 'varchar', length: 300, nullable: true })
  steamPublishers!: string | null;

  @Column({ name: 'steam_genres', type: 'json', nullable: true })
  steamGenres!: string[] | null;

  @Column({ name: 'steam_release_text', type: 'varchar', length: 60, nullable: true })
  steamReleaseText!: string | null;

  /** `game`, `dlc`, `demo`, `music`, `tool`… from the store page. */
  @Column({ name: 'steam_type', type: 'varchar', length: 24, nullable: true })
  steamType!: string | null;

  @Column({ name: 'playtime_minutes', type: 'int', unsigned: true, default: 0 })
  playtimeMinutes!: number;

  /** Minutes in the last two weeks — what "playing lately" is drawn from. */
  @Column({ name: 'playtime_recent_minutes', type: 'int', unsigned: true, default: 0 })
  playtimeRecentMinutes!: number;

  @Column({ name: 'last_played_at', type: 'datetime', nullable: true })
  lastPlayedAt!: Date | null;

  /**
   * False once a game drops out of her library. The row stays — reviews and
   * stream history hang off it — and the sync never deletes.
   */
  @Column({ name: 'steam_owned', type: 'boolean', default: false })
  steamOwned!: boolean;

  @Column({ name: 'steam_details_status', type: 'varchar', length: 16, nullable: true })
  steamDetailsStatus!: SteamDetailsStatus | null;

  @Column({ name: 'steam_details_fetched_at', type: 'datetime', nullable: true })
  steamDetailsFetchedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
