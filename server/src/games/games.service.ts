import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from '../categories/category.entity';
import { GameCategoryEntity } from '../categories/game-category.entity';
import { slugify } from '../common/slug';
import { ReviewEntity } from '../reviews/review.entity';
import { SettingsService } from '../settings/settings.service';
import { UploadEntity } from '../uploads/upload.entity';
import { CreateGameDto, UpdateGameDto } from './dto/game.dto';
import { GameScreenshotEntity } from './game-screenshot.entity';
import { GameEntity } from './game.entity';
import {
  byTitle,
  GameCard,
  GameDetail,
  GameScreenshot,
  toGameCard,
  toGameDetail,
  toScreenshot,
} from './games.serializer';

const DEFAULT_AUTO_FAVORITES = 10;
const MAX_AUTO_FAVORITES = 50;

/** The admin's view of one game: what the site shows, plus both halves behind it. */
export interface AdminGame extends GameDetail {
  steamAppId: number | null;
  isHidden: boolean;
  favoritesExcluded: boolean;
  steamOwned: boolean;
  steamType: string | null;
  steamDetailsStatus: string | null;
  playtimeMinutes: number;
  /** The admin's own values, `null` where Steam's is showing through. */
  overrides: {
    title: string | null;
    summary: string | null;
    developer: string | null;
    publisher: string | null;
    releaseText: string | null;
    platformLabel: string | null;
    coverUploadId: string | null;
  };
  /** What Steam says, so the edit screen can show what an override replaces. */
  steam: {
    name: string | null;
    summary: string | null;
    developers: string | null;
    publishers: string | null;
    releaseText: string | null;
    headerUrl: string | null;
  };
  categoryIds: string[];
  reviewCount: number;
}

export interface AdminScreenshot extends GameScreenshot {
  source: 'steam' | 'upload';
  isHidden: boolean;
}

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
    @InjectRepository(GameScreenshotEntity)
    private readonly screenshots: Repository<GameScreenshotEntity>,
    @InjectRepository(GameCategoryEntity)
    private readonly gameCategories: Repository<GameCategoryEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
    @InjectRepository(ReviewEntity)
    private readonly reviews: Repository<ReviewEntity>,
    @InjectRepository(UploadEntity)
    private readonly uploads: Repository<UploadEntity>,
    private readonly settings: SettingsService,
  ) {}

  // ---------- public plane ----------

  /** Every game that is not hidden, by title — optionally one category's worth. */
  async publicList(categoryId?: string): Promise<GameCard[]> {
    let rows: GameEntity[];
    if (categoryId) {
      const links = await this.gameCategories.find({ where: { categoryId } });
      if (!links.length) return [];
      rows = await this.games.find({
        where: { id: In(links.map((link) => link.gameId)), isHidden: false },
      });
    } else {
      rows = await this.games.find({ where: { isHidden: false } });
    }
    return rows.sort(byTitle).map(toGameCard);
  }

  /**
   * The favorites list: her hearts first, then what the hours say.
   *
   * Two sources and one list. A heart is a statement and always wins a place;
   * the automatic half fills in behind it from Steam playtime, skipping
   * anything already hearted, anything she excluded, and anything with no
   * hours at all. A manual game has no playtime, so the heart is its only way
   * in. Hidden games are in neither half.
   */
  async favorites(): Promise<{ hearted: GameCard[]; mostPlayed: GameCard[] }> {
    const autoCount = await this.autoFavoritesCount();

    const hearted = await this.games.find({
      where: { isHidden: false, isFavorite: true },
    });
    hearted.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || byTitle(a, b));

    const mostPlayed = autoCount
      ? await this.games
          .createQueryBuilder('game')
          .where('game.isHidden = :hidden', { hidden: false })
          .andWhere('game.isFavorite = :favorite', { favorite: false })
          .andWhere('game.favoritesExcluded = :excluded', { excluded: false })
          .andWhere('game.playtimeMinutes > 0')
          .orderBy('game.playtimeMinutes', 'DESC')
          .take(autoCount)
          .getMany()
      : [];

    return { hearted: hearted.map(toGameCard), mostPlayed: mostPlayed.map(toGameCard) };
  }

  /** What she has been playing in the last two weeks, most-played first. */
  async recentlyPlayed(limit: number): Promise<GameCard[]> {
    const rows = await this.games
      .createQueryBuilder('game')
      .where('game.isHidden = :hidden', { hidden: false })
      .andWhere('game.playtimeRecentMinutes > 0')
      .orderBy('game.playtimeRecentMinutes', 'DESC')
      .take(limit)
      .getMany();
    return rows.map(toGameCard);
  }

  /**
   * One game's page. A hidden game is a 404 for a visitor and visible to an
   * admin, who is the person deciding whether to unhide it.
   */
  async publicDetail(
    slug: string,
    isAdmin: boolean,
  ): Promise<{
    game: GameDetail & { isHidden: boolean };
    screenshots: GameScreenshot[];
    categories: { slug: string; name: string }[];
  }> {
    const game = await this.games.findOne({ where: { slug } });
    if (!game || (game.isHidden && !isAdmin)) throw new NotFoundException('Not found');

    const [shots, links] = await Promise.all([
      this.screenshots.find({
        where: { gameId: game.id, isHidden: false },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.gameCategories.find({ where: { gameId: game.id } }),
    ]);
    const categories = links.length
      ? await this.categories.find({
          where: { id: In(links.map((link) => link.categoryId)), isPublished: true },
          order: { sortOrder: 'ASC' },
        })
      : [];

    return {
      game: { ...toGameDetail(game), isHidden: game.isHidden },
      screenshots: shots.map(toScreenshot).filter((shot) => shot !== null),
      categories: categories.map(({ slug: categorySlug, name }) => ({ slug: categorySlug, name })),
    };
  }

  /** How many visible games each category holds — the chips' counts. */
  async visibleCountsByCategory(): Promise<Map<string, number>> {
    const rows = await this.gameCategories
      .createQueryBuilder('link')
      .innerJoin(GameEntity, 'game', 'game.id = link.gameId AND game.isHidden = :hidden', {
        hidden: false,
      })
      .select('link.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('link.categoryId')
      .getRawMany<{ categoryId: string; count: string }>();
    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
  }

  // ---------- admin plane ----------

  async adminList(): Promise<AdminGame[]> {
    const [rows, links, counts] = await Promise.all([
      this.games.find(),
      this.gameCategories.find(),
      this.reviews
        .createQueryBuilder('review')
        .select('review.gameId', 'gameId')
        .addSelect('COUNT(*)', 'count')
        .groupBy('review.gameId')
        .getRawMany<{ gameId: string; count: string }>(),
    ]);

    const categoryIds = new Map<string, string[]>();
    for (const link of links) {
      const list = categoryIds.get(link.gameId) ?? [];
      list.push(link.categoryId);
      categoryIds.set(link.gameId, list);
    }
    const reviewCounts = new Map(counts.map((row) => [row.gameId, Number(row.count)]));

    return rows
      .sort(byTitle)
      .map((game) =>
        toAdminGame(game, categoryIds.get(game.id) ?? [], reviewCounts.get(game.id) ?? 0),
      );
  }

  async adminGet(id: string): Promise<{ game: AdminGame; screenshots: AdminScreenshot[] }> {
    const game = await this.get(id);
    const [links, reviewCount, shots] = await Promise.all([
      this.gameCategories.find({ where: { gameId: id } }),
      this.reviews.count({ where: { gameId: id } }),
      this.screenshots.find({
        where: { gameId: id },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
    ]);
    return {
      game: toAdminGame(
        game,
        links.map((link) => link.categoryId),
        reviewCount,
      ),
      screenshots: shots.map(toAdminScreenshot).filter((shot) => shot !== null),
    };
  }

  async get(id: string): Promise<GameEntity> {
    const row = await this.games.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  /** A game entered by hand. Steam games arrive through the sync, never here. */
  async createManual(dto: CreateGameDto): Promise<AdminGame> {
    const { categoryIds, ...fields } = dto;
    await this.assertUpload(fields.coverUploadId);

    const game = await this.games.save(
      this.games.create({
        ...fields,
        id: randomUUID(),
        slug: await this.uniqueSlug(fields.title),
        source: 'manual',
        steamAppId: null,
      }),
    );
    if (categoryIds) await this.setCategories(game.id, categoryIds);
    return (await this.adminGet(game.id)).game;
  }

  /**
   * A partial write to the admin-owned half.
   *
   * Assigned field by field rather than merged: `null` is meaningful here — it
   * lifts an override so Steam's value shows again — and only `undefined`
   * means "leave it alone".
   */
  async update(id: string, dto: UpdateGameDto): Promise<AdminGame> {
    const game = await this.get(id);
    const { categoryIds, ...fields } = dto;

    if (fields.title === null && game.source === 'manual') {
      throw new BadRequestException('A game added by hand needs a title.');
    }
    if (fields.coverUploadId !== undefined) await this.assertUpload(fields.coverUploadId);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (game as unknown as Record<string, unknown>)[key] = value;
    }
    await this.games.save(game);

    if (categoryIds) await this.setCategories(id, categoryIds);
    return (await this.adminGet(id)).game;
  }

  /**
   * Deletes a manual game. A Steam game cannot be deleted, only hidden: the
   * next sync would bring it straight back, without its reviews.
   */
  async remove(id: string): Promise<void> {
    const game = await this.get(id);
    if (game.source === 'steam') {
      throw new ConflictException(
        'A Steam game cannot be deleted — the next sync would add it again. Hide it instead.',
      );
    }
    await this.games.remove(game);
  }

  /** Replaces the game's category set with exactly `categoryIds`. */
  async setCategories(gameId: string, categoryIds: string[]): Promise<void> {
    const unique = [...new Set(categoryIds)];
    if (unique.length) {
      const found = await this.categories.count({ where: { id: In(unique) } });
      if (found !== unique.length) {
        throw new BadRequestException('One of those categories no longer exists.');
      }
    }
    await this.gameCategories.delete({ gameId });
    if (unique.length) {
      await this.gameCategories.insert(unique.map((categoryId) => ({ gameId, categoryId })));
    }
  }

  // ---------- screenshots ----------

  async addScreenshot(gameId: string, uploadId: string): Promise<AdminScreenshot[]> {
    await this.get(gameId);
    await this.assertUpload(uploadId);
    const last = await this.screenshots.findOne({
      where: { gameId },
      order: { sortOrder: 'DESC' },
    });
    await this.screenshots.save(
      this.screenshots.create({
        id: randomUUID(),
        gameId,
        source: 'upload',
        uploadId,
        sortOrder: last ? last.sortOrder + 1 : 0,
      }),
    );
    return (await this.adminGet(gameId)).screenshots;
  }

  async setScreenshotHidden(
    gameId: string,
    shotId: string,
    isHidden: boolean,
  ): Promise<AdminScreenshot[]> {
    const shot = await this.getScreenshot(gameId, shotId);
    shot.isHidden = isHidden;
    await this.screenshots.save(shot);
    return (await this.adminGet(gameId)).screenshots;
  }

  /**
   * Removes an uploaded screenshot. A Steam one can only be hidden, for the
   * same reason a Steam game can: the next refresh would put it back.
   */
  async removeScreenshot(gameId: string, shotId: string): Promise<AdminScreenshot[]> {
    const shot = await this.getScreenshot(gameId, shotId);
    if (shot.source === 'steam') {
      throw new ConflictException(
        'A screenshot from Steam cannot be deleted — the next refresh would add it again. Hide it instead.',
      );
    }
    await this.screenshots.remove(shot);
    return (await this.adminGet(gameId)).screenshots;
  }

  async reorderScreenshots(gameId: string, ids: string[]): Promise<AdminScreenshot[]> {
    const rows = await this.screenshots.find({ where: { gameId } });
    const known = new Set(rows.map((row) => row.id));
    if (
      rows.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException('The order must list every screenshot exactly once');
    }
    const position = new Map(ids.map((id, index) => [id, index]));
    for (const row of rows) row.sortOrder = position.get(row.id)!;
    await this.screenshots.save(rows);
    return (await this.adminGet(gameId)).screenshots;
  }

  // ---------- shared ----------

  /**
   * A slug nothing else holds. `suffix` is tried first on a collision — the
   * sync passes the Steam app id, which is meaningful in a URL in a way `-2`
   * is not.
   */
  async uniqueSlug(title: string, suffix?: string | number): Promise<string> {
    const base = slugify(title, 'game');
    const candidates = [base, ...(suffix !== undefined ? [`${base}-${suffix}`] : [])];
    for (const candidate of candidates) {
      if (!(await this.games.exists({ where: { slug: candidate } }))) return candidate;
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!(await this.games.exists({ where: { slug: candidate } }))) return candidate;
    }
  }

  private async getScreenshot(gameId: string, shotId: string): Promise<GameScreenshotEntity> {
    const shot = await this.screenshots.findOne({ where: { id: shotId, gameId } });
    if (!shot) throw new NotFoundException('Not found');
    return shot;
  }

  private async assertUpload(uploadId: string | null | undefined): Promise<void> {
    if (!uploadId) return;
    if (!(await this.uploads.exists({ where: { id: uploadId } }))) {
      throw new BadRequestException('That image no longer exists. Upload it again.');
    }
  }

  private async autoFavoritesCount(): Promise<number> {
    const raw = (await this.settings.all()).favorites_auto_count.trim();
    if (raw === '') return DEFAULT_AUTO_FAVORITES;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_AUTO_FAVORITES;
    return Math.min(parsed, MAX_AUTO_FAVORITES);
  }
}

function toAdminGame(game: GameEntity, categoryIds: string[], reviewCount: number): AdminGame {
  return {
    ...toGameDetail(game),
    steamAppId: game.steamAppId,
    isHidden: game.isHidden,
    favoritesExcluded: game.favoritesExcluded,
    steamOwned: game.steamOwned,
    steamType: game.steamType,
    steamDetailsStatus: game.steamDetailsStatus,
    playtimeMinutes: game.playtimeMinutes,
    overrides: {
      title: game.title,
      summary: game.summary,
      developer: game.developer,
      publisher: game.publisher,
      releaseText: game.releaseText,
      platformLabel: game.platformLabel,
      coverUploadId: game.coverUploadId,
    },
    steam: {
      name: game.steamName,
      summary: game.steamSummary,
      developers: game.steamDevelopers,
      publishers: game.steamPublishers,
      releaseText: game.steamReleaseText,
      headerUrl: game.steamHeaderUrl,
    },
    categoryIds,
    reviewCount,
  };
}

function toAdminScreenshot(shot: GameScreenshotEntity): AdminScreenshot | null {
  const drawn = toScreenshot(shot);
  return drawn ? { ...drawn, source: shot.source, isHidden: shot.isHidden } : null;
}
