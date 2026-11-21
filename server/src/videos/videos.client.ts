import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { TwitchKind, VideoKind, VideoProvider } from './video.entity';

/** One video as a platform described it. Every sync and lookup returns these. */
export interface RemoteVideo {
  provider: VideoProvider;
  kind: VideoKind;
  externalId: string;
  url: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: Date;
  viewCount: number | null;
}

/** A listing, and whether it is the whole of it — only a whole one can mark videos gone. */
export interface RemoteListing {
  videos: RemoteVideo[];
  complete: boolean;
}

export type VideoApiFailure =
  'bad_key' | 'rate_limited' | 'not_found' | 'unavailable';

export class VideoApiError extends Error {
  constructor(
    readonly platform: 'Twitch' | 'YouTube' | 'Vimeo',
    readonly failure: VideoApiFailure,
    message: string,
  ) {
    super(message);
  }
}

const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';
const HELIX = 'https://api.twitch.tv/helix';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Ceilings on one listing. Clips are the one that matters: anybody watching
 * can make one, and Helix hands back the most-viewed first. A listing that
 * stops at a ceiling is reported incomplete, so nothing past it is marked gone.
 */
const MAX_TWITCH_PER_TYPE = 500;
const MAX_CLIPS = 300;
const MAX_YOUTUBE = 2000;

/** Twitch thumbnail templates carry `%{width}x%{height}`. */
const THUMB_W = 640;
const THUMB_H = 360;

/**
 * Every HTTP call to Twitch, YouTube and the oEmbed endpoints — no database,
 * no decisions. The same split as `steam/steam.client.ts`.
 *
 * ## No key reaches a log
 *
 * YouTube takes its key in the query string, so a URL is a secret. Errors are
 * built from a label and the status, never from the URL. Twitch's client
 * secret goes in a form body, and its token in a header.
 *
 * ## `VIDEOS_MODE=fixture`
 *
 * Swaps every platform call for `test/fixtures/videos/videos.json`, and counts
 * both platforms as connected, so the sync and the Live page can be worked
 * with no keys at all. Refused in production.
 */
@Injectable()
export class VideosClient {
  private readonly logger = new Logger(VideosClient.name);
  readonly fixtureMode: boolean;
  private twitchToken: {
    clientId: string;
    token: string;
    expiresAt: number;
  } | null = null;

  constructor(config: ConfigService) {
    this.fixtureMode =
      (config.get<string>('VIDEOS_MODE') ?? '').trim().toLowerCase() ===
      'fixture';
    const isProduction =
      (config.get<string>('NODE_ENV') ?? '').trim() === 'production';
    if (this.fixtureMode && isProduction) {
      throw new Error(
        'VIDEOS_MODE=fixture is a development aid and is refused in production.',
      );
    }
    if (this.fixtureMode) {
      this.logger.warn(
        'VIDEOS_MODE=fixture — videos come from a fixture file, not Twitch or YouTube.',
      );
    }
  }

  // ---------- Twitch ----------

  /** Proves a Client ID and secret by fetching an app token with them. */
  async verifyTwitch(clientId: string, clientSecret: string): Promise<void> {
    if (this.fixtureMode) return;
    this.twitchToken = null;
    await this.appToken(clientId, clientSecret);
  }

  /** The numeric user id behind a login, or null when Twitch has no such channel. */
  async twitchUserId(
    clientId: string,
    clientSecret: string,
    login: string,
  ): Promise<string | null> {
    if (this.fixtureMode) return `fixture-${login}`;
    const body = await this.helix<{ data?: { id: string }[] }>(
      clientId,
      clientSecret,
      `/users?${new URLSearchParams({ login })}`,
      'users',
    );
    return body.data?.[0]?.id ?? null;
  }

  async twitchVideos(
    clientId: string,
    clientSecret: string,
    userId: string,
    type: Exclude<TwitchKind, 'clip'>,
  ): Promise<RemoteListing> {
    if (this.fixtureMode)
      return this.fixture((v) => v.provider === 'twitch' && v.kind === type);
    const videos: RemoteVideo[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({
        user_id: userId,
        type,
        first: '100',
      });
      if (cursor) query.set('after', cursor);
      const body = await this.helix<HelixPage<HelixVideo>>(
        clientId,
        clientSecret,
        `/videos?${query}`,
        'videos',
      );
      for (const item of body.data ?? [])
        videos.push(fromHelixVideo(item, type));
      cursor = body.pagination?.cursor || undefined;
    } while (cursor && videos.length < MAX_TWITCH_PER_TYPE);
    return { videos, complete: !cursor };
  }

  async twitchClips(
    clientId: string,
    clientSecret: string,
    userId: string,
  ): Promise<RemoteListing> {
    if (this.fixtureMode)
      return this.fixture((v) => v.provider === 'twitch' && v.kind === 'clip');
    const videos: RemoteVideo[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({
        broadcaster_id: userId,
        first: '100',
      });
      if (cursor) query.set('after', cursor);
      const body = await this.helix<HelixPage<HelixClip>>(
        clientId,
        clientSecret,
        `/clips?${query}`,
        'clips',
      );
      for (const item of body.data ?? []) videos.push(fromHelixClip(item));
      cursor = body.pagination?.cursor || undefined;
    } while (cursor && videos.length < MAX_CLIPS);
    return { videos, complete: !cursor };
  }

  /** One Twitch video or clip by id, for a pasted link. Null when Twitch has none. */
  async twitchOne(
    clientId: string,
    clientSecret: string,
    kind: 'video' | 'clip',
    id: string,
  ): Promise<RemoteVideo | null> {
    if (this.fixtureMode) return null;
    if (kind === 'clip') {
      const body = await this.helix<HelixPage<HelixClip>>(
        clientId,
        clientSecret,
        `/clips?${new URLSearchParams({ id })}`,
        'clips',
      );
      const clip = body.data?.[0];
      return clip ? fromHelixClip(clip) : null;
    }
    const body = await this.helix<HelixPage<HelixVideo>>(
      clientId,
      clientSecret,
      `/videos?${new URLSearchParams({ id })}`,
      'videos',
    );
    const video = body.data?.[0];
    return video ? fromHelixVideo(video, helixKind(video.type)) : null;
  }

  private async appToken(
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const cached = this.twitchToken;
    if (
      cached &&
      cached.clientId === clientId &&
      cached.expiresAt > Date.now() + 60_000
    )
      return cached.token;
    const response = await this.request('Twitch', TWITCH_TOKEN, 'token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    });
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token)
      throw new VideoApiError(
        'Twitch',
        'bad_key',
        'Twitch gave no token for that Client ID and secret.',
      );
    this.twitchToken = {
      clientId,
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }

  private async helix<T>(
    clientId: string,
    clientSecret: string,
    pathAndQuery: string,
    label: string,
  ): Promise<T> {
    const call = async () => {
      const token = await this.appToken(clientId, clientSecret);
      return this.request('Twitch', `${HELIX}${pathAndQuery}`, label, {
        headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
      });
    };
    try {
      return (await (await call()).json()) as T;
    } catch (error) {
      // An app token can be revoked before it expires; one fresh try.
      if (
        error instanceof VideoApiError &&
        error.failure === 'bad_key' &&
        this.twitchToken
      ) {
        this.twitchToken = null;
        return (await (await call()).json()) as T;
      }
      throw error;
    }
  }

  // ---------- YouTube ----------

  /** Proves a key with the cheapest call that needs one. */
  async verifyYoutube(apiKey: string): Promise<void> {
    if (this.fixtureMode) return;
    await this.youtube(
      apiKey,
      'i18nLanguages',
      { part: 'snippet', hl: 'en' },
      'i18nLanguages',
    );
  }

  /** Every public, embeddable, finished video on a channel, live archives included. */
  async youtubeChannelVideos(
    apiKey: string,
    channelId: string,
  ): Promise<RemoteListing> {
    if (this.fixtureMode) return this.fixture((v) => v.provider === 'youtube');
    const channel = await this.youtube<{
      items?: {
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }[];
    }>(
      apiKey,
      'channels',
      { part: 'contentDetails', id: channelId },
      'channels',
    );
    const uploads =
      channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads)
      throw new VideoApiError(
        'YouTube',
        'not_found',
        `YouTube has no channel with the id ${channelId}.`,
      );

    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params: Record<string, string> = {
        part: 'contentDetails',
        playlistId: uploads,
        maxResults: '50',
      };
      if (pageToken) params.pageToken = pageToken;
      const page = await this.youtube<{
        items?: { contentDetails?: { videoId?: string } }[];
        nextPageToken?: string;
      }>(apiKey, 'playlistItems', params, 'playlistItems');
      for (const item of page.items ?? [])
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
      pageToken = page.nextPageToken || undefined;
    } while (pageToken && ids.length < MAX_YOUTUBE);

    const videos: RemoteVideo[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      videos.push(
        ...(await this.youtubeDetails(apiKey, ids.slice(index, index + 50))),
      );
    }
    return { videos, complete: !pageToken };
  }

  /** One YouTube video by id, for a pasted link. Null when it is missing or cannot be framed. */
  async youtubeOne(apiKey: string, id: string): Promise<RemoteVideo | null> {
    if (this.fixtureMode) return null;
    return (await this.youtubeDetails(apiKey, [id]))[0] ?? null;
  }

  private async youtubeDetails(
    apiKey: string,
    ids: string[],
  ): Promise<RemoteVideo[]> {
    const body = await this.youtube<{ items?: YoutubeVideo[] }>(
      apiKey,
      'videos',
      {
        part: 'snippet,contentDetails,status,statistics,liveStreamingDetails',
        id: ids.join(','),
        maxResults: '50',
      },
      'videos',
    );
    const out: RemoteVideo[] = [];
    for (const item of body.items ?? []) {
      // A live or upcoming broadcast is the player's job, not the list's.
      if (
        item.snippet?.liveBroadcastContent &&
        item.snippet.liveBroadcastContent !== 'none'
      )
        continue;
      if (
        item.status?.privacyStatus !== 'public' ||
        item.status?.embeddable === false
      )
        continue;
      const thumbs = item.snippet?.thumbnails ?? {};
      out.push({
        provider: 'youtube',
        kind: item.liveStreamingDetails ? 'archive' : 'video',
        externalId: item.id,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: item.snippet?.title?.trim() || 'Untitled video',
        description: item.snippet?.description?.trim() || null,
        thumbnailUrl:
          (
            thumbs.maxres ??
            thumbs.standard ??
            thumbs.high ??
            thumbs.medium ??
            thumbs.default
          )?.url ?? null,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        publishedAt: new Date(
          item.liveStreamingDetails?.actualStartTime ??
            item.snippet?.publishedAt ??
            Date.now(),
        ),
        viewCount: item.statistics?.viewCount
          ? Number(item.statistics.viewCount)
          : null,
      });
    }
    return out;
  }

  private async youtube<T>(
    apiKey: string,
    resource: string,
    params: Record<string, string>,
    label: string,
  ): Promise<T> {
    const query = new URLSearchParams({ ...params, key: apiKey });
    const response = await this.request(
      'YouTube',
      `${YOUTUBE_API}/${resource}?${query}`,
      label,
    );
    return (await response.json()) as T;
  }

  // ---------- oEmbed, for a pasted link with no key to look it up ----------

  async oembed(
    provider: 'youtube' | 'vimeo',
    url: string,
  ): Promise<Partial<RemoteVideo> | null> {
    if (this.fixtureMode) return null;
    const endpoint =
      provider === 'youtube'
        ? `https://www.youtube.com/oembed?${new URLSearchParams({ url, format: 'json' })}`
        : `https://vimeo.com/api/oembed.json?${new URLSearchParams({ url })}`;
    try {
      const response = await this.request(
        provider === 'youtube' ? 'YouTube' : 'Vimeo',
        endpoint,
        'oembed',
      );
      const body = (await response.json()) as {
        title?: string;
        thumbnail_url?: string;
        duration?: number;
        upload_date?: string;
      };
      return {
        title: body.title?.trim() || undefined,
        thumbnailUrl: body.thumbnail_url ?? null,
        durationSeconds:
          typeof body.duration === 'number' ? Math.round(body.duration) : null,
        publishedAt: body.upload_date
          ? new Date(body.upload_date.replace(' ', 'T') + 'Z')
          : undefined,
      };
    } catch {
      // oEmbed is a convenience: no answer means the admin types the title.
      return null;
    }
  }

  // ---------- plumbing ----------

  /** `label` is what an error names. It is never the URL — see the class comment. */
  private async request(
    platform: 'Twitch' | 'YouTube' | 'Vimeo',
    url: string,
    label: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new VideoApiError(
        platform,
        'unavailable',
        `${platform} did not answer (${label}).`,
      );
    }
    if (response.ok) return response;

    // YouTube says what went wrong in the body; read it without echoing it.
    // An invalid key is a 400 there ("API key not valid"), not a 401.
    let reason = '';
    let keyComplaint = false;
    if (platform === 'YouTube') {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; errors?: { reason?: string }[] };
      } | null;
      reason = body?.error?.errors?.[0]?.reason ?? '';
      keyComplaint =
        reason === 'keyInvalid' || /API key/i.test(body?.error?.message ?? '');
    }
    if (
      reason === 'quotaExceeded' ||
      reason === 'rateLimitExceeded' ||
      response.status === 429
    ) {
      throw new VideoApiError(
        platform,
        'rate_limited',
        `${platform} asked us to slow down.`,
      );
    }
    // Twitch answers a wrong Client ID or secret at the token endpoint with a 400 or 403.
    const twitchTokenRefused =
      platform === 'Twitch' && label === 'token' && response.status === 400;
    if (
      response.status === 401 ||
      response.status === 403 ||
      keyComplaint ||
      twitchTokenRefused
    ) {
      throw new VideoApiError(
        platform,
        'bad_key',
        `${platform} refused the key.`,
      );
    }
    if (response.status === 404) {
      throw new VideoApiError(
        platform,
        'not_found',
        `${platform} has nothing at ${label}.`,
      );
    }
    throw new VideoApiError(
      platform,
      'unavailable',
      `${platform} answered ${response.status} (${label}).`,
    );
  }

  private async fixture(
    match: (video: FixtureVideo) => boolean,
  ): Promise<RemoteListing> {
    const file = path.join(
      process.cwd(),
      'test',
      'fixtures',
      'videos',
      'videos.json',
    );
    const raw = JSON.parse(await readFile(file, 'utf8')) as {
      videos: FixtureVideo[];
    };
    return {
      complete: true,
      videos: raw.videos.filter(match).map((video) => ({
        ...video,
        description: video.description ?? null,
        thumbnailUrl: video.thumbnailUrl ?? null,
        durationSeconds: video.durationSeconds ?? null,
        viewCount: video.viewCount ?? null,
        publishedAt: new Date(video.publishedAt),
      })),
    };
  }
}

interface FixtureVideo extends Omit<
  RemoteVideo,
  | 'publishedAt'
  | 'description'
  | 'thumbnailUrl'
  | 'durationSeconds'
  | 'viewCount'
> {
  publishedAt: string;
  description?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
}

interface HelixPage<T> {
  data?: T[];
  pagination?: { cursor?: string };
}

interface HelixVideo {
  id: string;
  title?: string;
  description?: string;
  created_at?: string;
  published_at?: string;
  url?: string;
  thumbnail_url?: string;
  view_count?: number;
  type?: string;
  duration?: string;
}

interface HelixClip {
  id: string;
  url?: string;
  title?: string;
  view_count?: number;
  created_at?: string;
  thumbnail_url?: string;
  duration?: number;
}

interface YoutubeVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; embeddable?: boolean };
  statistics?: { viewCount?: string };
  liveStreamingDetails?: { actualStartTime?: string };
}

function fromHelixVideo(item: HelixVideo, kind: VideoKind): RemoteVideo {
  const thumb = item.thumbnail_url ?? '';
  return {
    provider: 'twitch',
    kind,
    externalId: item.id,
    url: `https://www.twitch.tv/videos/${item.id}`,
    title: item.title?.trim() || 'Untitled broadcast',
    description: item.description?.trim() || null,
    // A broadcast still processing has an empty template or a "404" image.
    thumbnailUrl:
      thumb && !thumb.includes('404')
        ? thumb
            .replace('%{width}', String(THUMB_W))
            .replace('%{height}', String(THUMB_H))
        : null,
    durationSeconds: parseTwitchDuration(item.duration),
    publishedAt: new Date(item.created_at ?? item.published_at ?? Date.now()),
    viewCount: item.view_count ?? null,
  };
}

function fromHelixClip(item: HelixClip): RemoteVideo {
  return {
    provider: 'twitch',
    kind: 'clip',
    externalId: item.id,
    url: `https://clips.twitch.tv/${item.id}`,
    title: item.title?.trim() || 'Untitled clip',
    description: null,
    thumbnailUrl: item.thumbnail_url || null,
    durationSeconds:
      typeof item.duration === 'number' ? Math.round(item.duration) : null,
    publishedAt: new Date(item.created_at ?? Date.now()),
    viewCount: item.view_count ?? null,
  };
}

/** Helix's `type` in our words; anything unknown is a plain video. */
const helixKind = (type: string | undefined): VideoKind =>
  type === 'archive' || type === 'highlight' || type === 'upload'
    ? type
    : 'video';

/** Twitch writes durations as `3h8m33s`. */
export function parseTwitchDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

/** YouTube writes ISO 8601 durations: `PT1H2M3S`, `P1DT2H`. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value,
  );
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0)
  );
}
