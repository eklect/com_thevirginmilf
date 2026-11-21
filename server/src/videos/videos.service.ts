import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, In, Repository } from 'typeorm';
import { AuthConfig } from '../auth/auth.config';
import { ChannelEntity } from '../channels/channel.entity';
import { open, seal } from '../common/secret-box';
import {
  AddVideoDto,
  SaveVideoConnectionDto,
  UpdateVideoDto,
  VideoListQueryDto,
} from './dto/video.dto';
import {
  VideoConnectionEntity,
  VideoSyncStatus,
} from './video-connection.entity';
import { parseVideoLink } from './video-links';
import {
  TWITCH_KINDS,
  TwitchKind,
  VIDEO_FILTERS,
  VideoEntity,
  VideoFilter,
  VideoSource,
} from './video.entity';
import {
  RemoteListing,
  RemoteVideo,
  VideoApiError,
  VideosClient,
} from './videos.client';

const CONNECTION_ID = 1;
const PAGE_SIZE = 24;

export interface VideoSyncProgress {
  running: boolean;
  platform: 'twitch' | 'youtube' | null;
  done: number;
}

/** What the admin screen shows. No secret is in it, sealed or otherwise. */
export interface VideoConnectionStatus {
  fixtureMode: boolean;
  twitch: {
    connected: boolean;
    needsReconnect: boolean;
    clientId: string | null;
    channels: { name: string; handle: string }[];
  };
  youtube: {
    connected: boolean;
    needsReconnect: boolean;
    channels: { name: string; handle: string }[];
  };
  twitchKinds: TwitchKind[];
  lastSync: {
    at: Date | null;
    status: VideoSyncStatus | null;
    error: string | null;
    count: number | null;
  };
  sync: VideoSyncProgress;
}

/**
 * The videos on the Live page: the Twitch and YouTube syncs, pasted links,
 * and the public list.
 *
 * ## The sync is a background job
 *
 * `startSync` returns at once and the admin screen polls `status()`, like
 * Steam's. Progress is in memory; a restart mid-sync just means the next run
 * does the work.
 *
 * ## What the sync may write
 *
 * Only the sync's half of a row (`video.entity.ts`). It never writes `title`,
 * `is_hidden` or `is_pinned`, never deletes, and leaves a `custom` row alone
 * even when it meets the same video — the admin added that one on purpose.
 * Something missing from a COMPLETE listing is marked `gone_at`; a listing
 * that stopped at a ceiling marks nothing.
 */
@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);
  private progress: VideoSyncProgress = {
    running: false,
    platform: null,
    done: 0,
  };

  constructor(
    @InjectRepository(VideoConnectionEntity)
    private readonly connections: Repository<VideoConnectionEntity>,
    @InjectRepository(VideoEntity)
    private readonly videos: Repository<VideoEntity>,
    @InjectRepository(ChannelEntity)
    private readonly channels: Repository<ChannelEntity>,
    private readonly client: VideosClient,
    private readonly authConfig: AuthConfig,
  ) {}

  // ---------- the public list ----------

  /** Pinned first, then newest first; hidden, gone and switched-off kinds left out. */
  async publicList(query: VideoListQueryDto): Promise<{
    videos: VideoEntity[];
    hasMore: boolean;
    filters: VideoFilter[];
  }> {
    const connection = await this.connection();
    const offset = query.offset
      ? Math.max(0, Number.parseInt(query.offset, 10) || 0)
      : 0;
    const qb = this.visible(connection.twitchKinds);
    if (query.kind) this.applyFilter(qb, query.kind);
    const rows = await qb
      .orderBy('v.is_pinned', 'DESC')
      .addOrderBy('v.published_at', 'DESC')
      .addOrderBy('v.id', 'ASC')
      .skip(offset)
      .take(PAGE_SIZE + 1)
      .getMany();
    return {
      videos: rows.slice(0, PAGE_SIZE),
      hasMore: rows.length > PAGE_SIZE,
      filters: await this.availableFilters(connection.twitchKinds),
    };
  }

  /** One visible video, for a `?video=` link. An admin can open a hidden one. */
  async getVisible(id: string, isAdmin: boolean): Promise<VideoEntity> {
    const row = isAdmin
      ? await this.videos.findOne({ where: { id } })
      : await this.visible((await this.connection()).twitchKinds)
          .andWhere('v.id = :id', { id })
          .getOne();
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  private visible(twitchKinds: TwitchKind[]) {
    const qb = this.videos
      .createQueryBuilder('v')
      .where('v.is_hidden = :hidden', { hidden: false })
      .andWhere('v.gone_at IS NULL');
    // A Twitch kind switched off leaves the site but keeps its rows. Pasted
    // links are the admin's own choice, so the switches never hide them.
    const off = TWITCH_KINDS.filter((kind) => !twitchKinds.includes(kind));
    if (off.length) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("v.source <> 'twitch'").orWhere('v.kind NOT IN (:...off)', {
            off,
          });
        }),
      );
    }
    return qb;
  }

  private applyFilter(
    qb: ReturnType<VideosService['visible']>,
    filter: VideoFilter,
  ): void {
    if (filter === 'video')
      qb.andWhere('v.kind IN (:...plain)', { plain: ['upload', 'video'] });
    else qb.andWhere('v.kind = :kind', { kind: filter });
  }

  /** The filter chips worth drawing: only groups that have something in them. */
  private async availableFilters(
    twitchKinds: TwitchKind[],
  ): Promise<VideoFilter[]> {
    const rows = await this.visible(twitchKinds)
      .select('v.kind', 'kind')
      .groupBy('v.kind')
      .getRawMany<{ kind: string }>();
    const kinds = new Set(rows.map((row) => row.kind));
    return VIDEO_FILTERS.filter((filter) =>
      filter === 'video'
        ? kinds.has('upload') || kinds.has('video')
        : kinds.has(filter),
    );
  }

  // ---------- the admin's half ----------

  adminList(): Promise<VideoEntity[]> {
    return this.videos.find({ order: { publishedAt: 'DESC' }, take: 2000 });
  }

  async adminGet(id: string): Promise<VideoEntity> {
    const row = await this.videos.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async update(id: string, dto: UpdateVideoDto): Promise<VideoEntity> {
    const row = await this.adminGet(id);
    const patch: Partial<VideoEntity> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.isHidden !== undefined) patch.isHidden = dto.isHidden;
    if (dto.isPinned !== undefined) patch.isPinned = dto.isPinned;
    if (Object.keys(patch).length) await this.videos.update(row.id, patch);
    return this.adminGet(id);
  }

  /** Only a pasted link can be deleted: a synced one would come back next sync. Hide it instead. */
  async remove(id: string): Promise<void> {
    const row = await this.adminGet(id);
    if (row.source !== 'custom') {
      throw new BadRequestException(
        'This video comes from the sync, so deleting it would only bring it back next time. Hide it instead.',
      );
    }
    await this.videos.delete({ id });
  }

  /**
   * A pasted link. Title and thumbnail come from the platform when it can be
   * asked — its API if the key is in, oEmbed otherwise — and the admin's own
   * title wins over either. With nothing to ask, the title is required.
   */
  async addCustom(dto: AddVideoDto): Promise<VideoEntity> {
    const parsed = parseVideoLink(dto.url);
    if ('error' in parsed) throw new BadRequestException(parsed.error);

    const existing = await this.videos.findOne({
      where: { provider: parsed.provider, externalId: parsed.externalId },
    });
    if (existing) {
      throw new ConflictException(
        existing.isHidden
          ? 'That video is already here, hidden. Show it from the list instead.'
          : 'That video is already on the list.',
      );
    }

    let found: Partial<RemoteVideo> | null = null;
    try {
      found = await this.lookup(
        parsed.provider,
        parsed.kind,
        parsed.externalId,
        parsed.url,
      );
    } catch (error) {
      this.logger.warn(
        `Looking up a pasted video failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const sourceTitle = dto.title ?? found?.title;
    if (!sourceTitle) {
      throw new BadRequestException(
        `We could not read this video's title from ${label(parsed.provider)}. Type one in.`,
      );
    }

    const id = randomUUID();
    await this.videos.insert({
      id,
      source: 'custom',
      provider: parsed.provider,
      kind: found?.kind ?? parsed.kind,
      externalId: parsed.externalId,
      url: parsed.url,
      channelId: null,
      sourceTitle: sourceTitle.slice(0, 300),
      sourceDescription: found?.description?.slice(0, 5000) ?? null,
      thumbnailUrl: found?.thumbnailUrl?.slice(0, 600) ?? null,
      durationSeconds: found?.durationSeconds ?? null,
      publishedAt:
        found?.publishedAt && !Number.isNaN(found.publishedAt.getTime())
          ? found.publishedAt
          : new Date(),
      viewCount: found?.viewCount ?? null,
      goneAt: null,
      title: null,
      isHidden: false,
      isPinned: false,
    });
    return this.adminGet(id);
  }

  private async lookup(
    provider: VideoEntity['provider'],
    kind: VideoEntity['kind'],
    externalId: string,
    url: string,
  ): Promise<Partial<RemoteVideo> | null> {
    const connection = await this.connection();
    if (provider === 'twitch') {
      const secret = this.unseal(connection.twitchClientSecretSealed);
      if (!connection.twitchClientId || !secret) return null;
      return this.client.twitchOne(
        connection.twitchClientId,
        secret,
        kind === 'clip' ? 'clip' : 'video',
        externalId,
      );
    }
    if (provider === 'youtube') {
      const key = this.unseal(connection.youtubeApiKeySealed);
      if (key) {
        const video = await this.client.youtubeOne(key, externalId);
        if (video) return video;
      }
      return this.client.oembed('youtube', url);
    }
    return this.client.oembed('vimeo', url);
  }

  // ---------- the connection ----------

  async status(): Promise<VideoConnectionStatus> {
    const row = await this.connection();
    const [twitchChannels, youtubeChannels] = await Promise.all([
      this.syncChannels('twitch'),
      this.syncChannels('youtube'),
    ]);
    const twitchSecret = this.unseal(row.twitchClientSecretSealed);
    const youtubeKey = this.unseal(row.youtubeApiKeySealed);
    const fixture = this.client.fixtureMode;
    return {
      fixtureMode: fixture,
      twitch: {
        connected: fixture || Boolean(row.twitchClientId && twitchSecret),
        needsReconnect:
          Boolean(row.twitchClientSecretSealed) && twitchSecret === null,
        clientId: row.twitchClientId,
        channels: twitchChannels.map(({ name, handle }) => ({
          name,
          handle: handle!,
        })),
      },
      youtube: {
        connected: fixture || Boolean(youtubeKey),
        needsReconnect: Boolean(row.youtubeApiKeySealed) && youtubeKey === null,
        channels: youtubeChannels.map(({ name, handle }) => ({
          name,
          handle: handle!,
        })),
      },
      twitchKinds: row.twitchKinds,
      lastSync: {
        at: row.lastSyncAt,
        status: row.lastSyncStatus,
        error: row.lastSyncError,
        count: row.lastSyncCount,
      },
      sync: { ...this.progress },
    };
  }

  /**
   * Saves whichever keys were sent, each proven against its platform first —
   * a wrong key otherwise fails half an hour later in a log nobody reads.
   * A field left out keeps what is stored; `forgetTwitch` / `forgetYoutube`
   * clear one. The videos stay either way.
   */
  async saveConnection(
    dto: SaveVideoConnectionDto,
  ): Promise<VideoConnectionStatus> {
    if (this.progress.running) {
      throw new ConflictException(
        'A sync is running. Wait for it to finish, then save.',
      );
    }
    const row = await this.connection();
    const patch: Partial<VideoConnectionEntity> = {};
    let keysChanged = false;

    if (dto.forgetTwitch) {
      patch.twitchClientId = null;
      patch.twitchClientSecretSealed = null;
    } else if (
      dto.twitchClientId !== undefined ||
      dto.twitchClientSecret !== undefined
    ) {
      const clientId = dto.twitchClientId ?? row.twitchClientId;
      const secret =
        dto.twitchClientSecret ?? this.unseal(row.twitchClientSecretSealed);
      if (!clientId || !secret) {
        throw new BadRequestException(
          'Twitch needs both the Client ID and the Client Secret.',
        );
      }
      try {
        await this.client.verifyTwitch(clientId, secret);
      } catch (error) {
        throw toHttpError(error);
      }
      patch.twitchClientId = clientId;
      patch.twitchClientSecretSealed = seal(
        secret,
        this.authConfig.encryptionSecret,
      );
      keysChanged = true;
    }

    if (dto.forgetYoutube) {
      patch.youtubeApiKeySealed = null;
    } else if (dto.youtubeApiKey !== undefined) {
      try {
        await this.client.verifyYoutube(dto.youtubeApiKey);
      } catch (error) {
        throw toHttpError(error);
      }
      patch.youtubeApiKeySealed = seal(
        dto.youtubeApiKey,
        this.authConfig.encryptionSecret,
      );
      keysChanged = true;
    }

    if (dto.twitchKinds !== undefined)
      patch.twitchKinds = TWITCH_KINDS.filter((kind) =>
        dto.twitchKinds!.includes(kind),
      );

    if (Object.keys(patch).length)
      await this.connections.update(CONNECTION_ID, patch);
    if (keysChanged) this.startSync();
    return this.status();
  }

  /** Whether the scheduled job has anything to do. */
  async isConfigured(): Promise<boolean> {
    const status = await this.status();
    return (
      (status.twitch.connected && status.twitch.channels.length > 0) ||
      (status.youtube.connected && status.youtube.channels.length > 0)
    );
  }

  async requestSync(): Promise<VideoConnectionStatus> {
    const status = await this.status();
    const twitchReady =
      status.twitch.connected && status.twitch.channels.length > 0;
    const youtubeReady =
      status.youtube.connected && status.youtube.channels.length > 0;
    if (!twitchReady && !youtubeReady) {
      throw new BadRequestException(
        'Nothing to sync yet. Add the Twitch or YouTube keys, and make sure that channel has its handle filled in under Channels.',
      );
    }
    this.startSync();
    return this.status();
  }

  startSync(): void {
    if (this.progress.running) return;
    this.progress = { running: true, platform: null, done: 0 };
    void this.run().finally(() => {
      this.progress = { running: false, platform: null, done: 0 };
    });
  }

  // ---------- the sync ----------

  private async run(): Promise<void> {
    const row = await this.connection();
    const problems: string[] = [];
    let count = 0;
    let anyRan = false;

    const twitchSecret = this.client.fixtureMode
      ? 'fixture'
      : this.unseal(row.twitchClientSecretSealed);
    const twitchId = this.client.fixtureMode ? 'fixture' : row.twitchClientId;
    if (twitchId && twitchSecret) {
      for (const channel of await this.syncChannels('twitch')) {
        anyRan = true;
        this.progress.platform = 'twitch';
        try {
          count += await this.syncTwitch(
            twitchId,
            twitchSecret,
            channel,
            row.twitchKinds,
          );
        } catch (error) {
          problems.push(describe(error, `Twitch (${channel.handle})`));
        }
      }
    }

    const youtubeKey = this.client.fixtureMode
      ? 'fixture'
      : this.unseal(row.youtubeApiKeySealed);
    if (youtubeKey) {
      for (const channel of await this.syncChannels('youtube')) {
        anyRan = true;
        this.progress.platform = 'youtube';
        try {
          const listing = await this.client.youtubeChannelVideos(
            youtubeKey,
            channel.handle!,
          );
          count += await this.apply('youtube', channel.id, listing, null);
        } catch (error) {
          problems.push(describe(error, `YouTube (${channel.name})`));
        }
      }
    }
    if (!anyRan) return;

    const status: VideoSyncStatus =
      problems.length === 0 ? 'ok' : count > 0 ? 'partial' : 'failed';
    if (problems.length) this.logger.warn(`Video sync: ${problems.join(' ')}`);
    await this.connections.update(CONNECTION_ID, {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: problems.length ? problems.join(' ').slice(0, 500) : null,
      lastSyncCount: count,
    });
  }

  private async syncTwitch(
    clientId: string,
    secret: string,
    channel: ChannelEntity,
    kinds: TwitchKind[],
  ): Promise<number> {
    const userId = await this.client.twitchUserId(
      clientId,
      secret,
      channel.handle!,
    );
    if (!userId)
      throw new Error(
        `Twitch has no channel called "${channel.handle}". Check its handle under Channels.`,
      );
    let count = 0;
    for (const kind of kinds) {
      const listing =
        kind === 'clip'
          ? await this.client.twitchClips(clientId, secret, userId)
          : await this.client.twitchVideos(clientId, secret, userId, kind);
      count += await this.apply('twitch', channel.id, listing, kind);
    }
    return count;
  }

  /**
   * Upserts one listing, then marks gone whatever the same listing held last
   * time and no longer does. `kind` scopes that for Twitch, which lists each
   * kind separately; YouTube's one listing covers the channel.
   */
  private async apply(
    source: Exclude<VideoSource, 'custom'>,
    channelId: string,
    listing: RemoteListing,
    kind: TwitchKind | null,
  ): Promise<number> {
    const ids = listing.videos.map((video) => video.externalId);
    const existing = ids.length
      ? await this.videos.find({
          where: { provider: listing.videos[0].provider, externalId: In(ids) },
        })
      : [];
    const byExternal = new Map(existing.map((row) => [row.externalId, row]));

    for (const video of listing.videos) {
      const sync = {
        url: video.url.slice(0, 500),
        sourceTitle: video.title.slice(0, 300),
        sourceDescription: video.description?.slice(0, 5000) ?? null,
        thumbnailUrl: video.thumbnailUrl?.slice(0, 600) ?? null,
        durationSeconds: video.durationSeconds,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount,
        goneAt: null,
      };
      const row = byExternal.get(video.externalId);
      if (row?.source === 'custom') continue;
      if (row) {
        await this.videos.update(row.id, {
          ...sync,
          kind: video.kind,
          channelId,
        });
      } else {
        await this.videos.insert({
          id: randomUUID(),
          source,
          provider: video.provider,
          kind: video.kind,
          externalId: video.externalId,
          channelId,
          ...sync,
          title: null,
          isHidden: false,
          isPinned: false,
        });
      }
      this.progress.done += 1;
    }

    if (listing.complete) {
      const qb = this.videos
        .createQueryBuilder()
        .update(VideoEntity)
        .set({ goneAt: () => 'UTC_TIMESTAMP()' })
        .where('source = :source', { source })
        .andWhere('channel_id = :channelId', { channelId })
        .andWhere('gone_at IS NULL');
      if (kind) qb.andWhere('kind = :kind', { kind });
      if (ids.length) qb.andWhere('external_id NOT IN (:...ids)', { ids });
      await qb.execute();
    }
    return listing.videos.length;
  }

  /** The stream channels with a handle on one platform — the accounts the sync reads. */
  private syncChannels(
    platform: 'twitch' | 'youtube',
  ): Promise<ChannelEntity[]> {
    return this.channels
      .createQueryBuilder('c')
      .where('c.platform = :platform', { platform })
      .andWhere('c.is_stream_channel = :yes', { yes: true })
      .andWhere('c.is_published = :yes', { yes: true })
      .andWhere("c.handle IS NOT NULL AND c.handle <> ''")
      .orderBy('c.sort_order', 'ASC')
      .getMany();
  }

  private async connection(): Promise<VideoConnectionEntity> {
    const row = await this.connections.findOne({
      where: { id: CONNECTION_ID },
    });
    if (row) return row;
    // The migration writes the row; this only covers a database that lost it.
    const fresh = this.connections.create({
      id: CONNECTION_ID,
      twitchClientId: null,
      twitchClientSecretSealed: null,
      youtubeApiKeySealed: null,
      twitchKinds: [...TWITCH_KINDS],
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncCount: null,
    });
    await this.connections.save(fresh);
    return fresh;
  }

  /** The secret in the clear, or null — which is what a rotated SESSION_ENCRYPTION_SECRET looks like. */
  private unseal(sealed: string | null): string | null {
    if (!sealed) return null;
    try {
      return open(sealed, this.authConfig.encryptionSecret);
    } catch {
      return null;
    }
  }
}

const label = (provider: VideoEntity['provider']) =>
  provider === 'twitch'
    ? 'Twitch'
    : provider === 'youtube'
      ? 'YouTube'
      : 'Vimeo';

function describe(error: unknown, where: string): string {
  if (error instanceof VideoApiError && error.failure === 'bad_key') {
    return `${where}: the key was refused. Paste it again on this screen.`;
  }
  if (error instanceof VideoApiError && error.failure === 'rate_limited') {
    return `${where}: asked us to slow down; the next sync will catch up.`;
  }
  return `${where}: ${error instanceof Error ? error.message : String(error)}`;
}

/** A platform failure as something the admin screen can show. */
function toHttpError(error: unknown): Error {
  if (!(error instanceof VideoApiError)) return error as Error;
  if (error.failure === 'bad_key') {
    return new BadRequestException(
      error.platform === 'Twitch'
        ? 'Twitch refused that Client ID and secret. Copy them again from dev.twitch.tv → Your Console → Applications.'
        : 'YouTube refused that API key. Check it in Google Cloud → APIs & Services → Credentials, and that the YouTube Data API v3 is enabled for its project.',
    );
  }
  if (error.failure === 'rate_limited') {
    return new BadGatewayException(
      `${error.platform} asked us to slow down. Try again in a few minutes.`,
    );
  }
  return new BadGatewayException(error.message);
}
