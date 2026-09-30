import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { ChannelEntity } from '../channels/channel.entity';
import { GameEntity } from '../games/game.entity';
import { CreateStreamDto, StreamChannelDto, UpdateStreamDto } from './dto/stream.dto';
import { StreamEventChannelEntity } from './stream-event-channel.entity';
import { StreamEventEntity } from './stream-event.entity';

/** The calendar asks for a padded month; anything much wider is not a calendar. */
const MAX_RANGE_DAYS = 100;

/**
 * How long a stream with no end time is treated as still going. Without it a
 * stream would drop off "upcoming" the minute it started — exactly when
 * somebody is most likely to be looking for it.
 */
const ASSUMED_LENGTH_MS = 3 * 3_600_000;

const RELATIONS = { channelLinks: { channel: true }, game: true } as const;

/**
 * Streams are hand-written rather than an `OrderedCrudService`: they order
 * themselves by when they happen, and each one owns a set of channel links
 * that is replaced whole on every save.
 *
 * Everything here returns entities. Turning one into a response — and
 * deciding whether the links go with it — is `streams.serializer.ts`.
 */
@Injectable()
export class StreamsService {
  constructor(
    @InjectRepository(StreamEventEntity)
    private readonly repo: Repository<StreamEventEntity>,
    @InjectRepository(StreamEventChannelEntity)
    private readonly links: Repository<StreamEventChannelEntity>,
    @InjectRepository(ChannelEntity)
    private readonly channels: Repository<ChannelEntity>,
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
  ) {}

  /** Streams starting inside `[from, to)`, soonest first. */
  async range(from: Date, to: Date, publishedOnly: boolean): Promise<StreamEventEntity[]> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('`to` must be after `from`');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequestException(`A range may span at most ${MAX_RANGE_DAYS} days`);
    }
    const qb = this.repo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.channelLinks', 'link')
      .leftJoinAndSelect('link.channel', 'channel')
      .leftJoinAndSelect('event.game', 'game')
      .where('event.startsAt >= :from AND event.startsAt < :to', { from, to })
      .orderBy('event.startsAt', 'ASC');
    if (publishedOnly) qb.andWhere('event.isPublished = :published', { published: true });
    return qb.getMany();
  }

  /** What is on now or next: anything not yet over, soonest first. */
  async upcoming(limit: number, publishedOnly: boolean): Promise<StreamEventEntity[]> {
    const now = new Date();
    const qb = this.repo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.channelLinks', 'link')
      .leftJoinAndSelect('link.channel', 'channel')
      .leftJoinAndSelect('event.game', 'game')
      .where(
        '((event.endsAt IS NOT NULL AND event.endsAt >= :now) OR ' +
          '(event.endsAt IS NULL AND event.startsAt >= :assumed))',
        { now, assumed: new Date(now.getTime() - ASSUMED_LENGTH_MS) },
      )
      .orderBy('event.startsAt', 'ASC')
      .take(limit);
    if (publishedOnly) qb.andWhere('event.isPublished = :published', { published: true });
    return qb.getMany();
  }

  /** The admin list: everything, latest start first. */
  async list(): Promise<StreamEventEntity[]> {
    return this.repo.find({ relations: RELATIONS, order: { startsAt: 'DESC' } });
  }

  async get(id: string): Promise<StreamEventEntity> {
    const row = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  /** A draft is a 404 for everybody but an admin previewing it. */
  async getVisible(id: string, isAdmin: boolean): Promise<StreamEventEntity> {
    const row = await this.get(id);
    if (!row.isPublished && !isAdmin) throw new NotFoundException('Not found');
    return row;
  }

  async create(dto: CreateStreamDto): Promise<StreamEventEntity> {
    const row = this.repo.create({
      id: randomUUID(),
      title: dto.title,
      description: dto.description ?? null,
      startsAt: new Date(dto.startsAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      gameId: dto.gameId ?? null,
      isPublished: dto.isPublished ?? false,
      notify: dto.notify ?? true,
      editedAt: new Date(),
    });
    const channels = dto.channels ?? [];
    await this.assertValid(row, channels);
    await this.repo.save(row);
    await this.replaceChannels(row.id, channels);
    return this.get(row.id);
  }

  async update(id: string, dto: UpdateStreamDto): Promise<StreamEventEntity> {
    const row = await this.get(id);
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.description !== undefined) row.description = dto.description ?? null;
    if (dto.startsAt !== undefined) row.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) row.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.gameId !== undefined) row.gameId = dto.gameId ?? null;
    if (dto.isPublished !== undefined) row.isPublished = dto.isPublished;
    if (dto.notify !== undefined) row.notify = dto.notify;

    const channels: StreamChannelDto[] =
      dto.channels ??
      (row.channelLinks ?? []).map((link) => ({
        channelId: link.channelId,
        urlOverride: link.urlOverride,
      }));
    await this.assertValid(row, channels);

    // An `update` naming the columns, not a `save` of the loaded row: the row
    // carries its `channelLinks` and `game` relations, and `save` would try to
    // reconcile those itself. The links are replaced explicitly below.
    await this.repo.update(id, {
      title: row.title,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      gameId: row.gameId,
      isPublished: row.isPublished,
      notify: row.notify,
      editedAt: new Date(),
    });
    if (dto.channels !== undefined) await this.replaceChannels(id, channels);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    await this.repo.remove(row);
  }

  private async assertValid(row: StreamEventEntity, channels: StreamChannelDto[]): Promise<void> {
    if (Number.isNaN(row.startsAt.getTime())) {
      throw new BadRequestException('The start time is not a valid date.');
    }
    if (row.endsAt && row.endsAt <= row.startsAt) {
      throw new BadRequestException('The stream has to end after it starts.');
    }
    if (row.gameId && !(await this.games.exists({ where: { id: row.gameId } }))) {
      throw new BadRequestException('That game no longer exists.');
    }

    const ids = channels.map((channel) => channel.channelId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A channel can only be on a stream once.');
    }
    if (ids.length) {
      const found = await this.channels.count({ where: { id: In(ids) } });
      if (found !== ids.length) {
        throw new BadRequestException('One of those channels no longer exists.');
      }
    }
    // A published stream nobody can watch anywhere is a calendar entry that
    // emails people a link to nothing.
    if (row.isPublished && ids.length === 0) {
      throw new BadRequestException('Pick at least one channel before publishing the stream.');
    }
  }

  private async replaceChannels(eventId: string, channels: StreamChannelDto[]): Promise<void> {
    await this.links.delete({ eventId });
    if (!channels.length) return;
    await this.links.insert(
      channels.map((channel, index) => ({
        eventId,
        channelId: channel.channelId,
        urlOverride: channel.urlOverride ?? null,
        sortOrder: index,
      })),
    );
  }
}
