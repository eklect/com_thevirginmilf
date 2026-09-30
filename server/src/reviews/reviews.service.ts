import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { GameEntity } from '../games/game.entity';
import { gameCoverUrl, gameTitle } from '../games/games.serializer';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';
import { ReviewEntity } from './review.entity';

export interface ReviewSummary {
  id: string;
  title: string;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  game: { id: string; slug: string; title: string; coverUrl: string | null; rating: number | null };
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ReviewEntity)
    private readonly repo: Repository<ReviewEntity>,
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
  ) {}

  /** One game's reviews, newest first. Drafts only for an admin. */
  async forGame(gameId: string, publishedOnly: boolean): Promise<ReviewEntity[]> {
    return this.repo.find({
      where: publishedOnly ? { gameId, isPublished: true } : { gameId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * The newest published reviews across the library, for the home page.
   * A review of a hidden game is hidden with it.
   */
  async latest(limit: number): Promise<(ReviewSummary & { excerpt: string })[]> {
    const rows = await this.repo
      .createQueryBuilder('review')
      .innerJoinAndSelect('review.game', 'game')
      .where('review.isPublished = :published', { published: true })
      .andWhere('game.isHidden = :hidden', { hidden: false })
      .orderBy('review.publishedAt', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((row) => ({ ...summarize(row, row.game!), excerpt: excerpt(row.body) }));
  }

  /** Every review, drafts included, newest edit first — the admin's list. */
  async adminList(): Promise<ReviewSummary[]> {
    const rows = await this.repo.find({
      relations: { game: true },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => summarize(row, row.game!));
  }

  async get(id: string): Promise<ReviewEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async create(gameId: string, dto: CreateReviewDto): Promise<ReviewEntity> {
    if (!(await this.games.exists({ where: { id: gameId } }))) {
      throw new NotFoundException('Not found');
    }
    const row = this.repo.create({
      id: randomUUID(),
      gameId,
      title: dto.title,
      body: dto.body,
      isPublished: dto.isPublished ?? false,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
    });
    stampPublished(row);
    return this.repo.save(row);
  }

  async update(id: string, dto: UpdateReviewDto): Promise<ReviewEntity> {
    const row = await this.get(id);
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.body !== undefined) row.body = dto.body;
    if (dto.isPublished !== undefined) row.isPublished = dto.isPublished;
    if (dto.publishedAt !== undefined) {
      row.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    }
    stampPublished(row);
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.get(id);
    await this.repo.remove(row);
  }
}

/** The first publish dates the review; unpublishing later does not undate it. */
function stampPublished(row: ReviewEntity): void {
  if (row.isPublished && !row.publishedAt) row.publishedAt = new Date();
}

function summarize(row: ReviewEntity, game: GameEntity): ReviewSummary {
  return {
    id: row.id,
    title: row.title,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    game: {
      id: game.id,
      slug: game.slug,
      title: gameTitle(game),
      coverUrl: gameCoverUrl(game),
      rating: game.rating,
    },
  };
}

/**
 * The opening of a review as plain text, for a card.
 *
 * Strips the Markdown that would otherwise show as punctuation — link
 * brackets, emphasis marks, heading hashes. Approximate on purpose: this is a
 * teaser, and the page it links to renders the real thing.
 */
function excerpt(markdown: string, length = 220): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), length - 40))}…`;
}
