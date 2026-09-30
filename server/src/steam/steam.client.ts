import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface OwnedGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  playtimeRecentMinutes: number;
  lastPlayedAt: Date | null;
}

export interface AppDetails {
  type: string | null;
  name: string | null;
  summary: string | null;
  headerUrl: string | null;
  capsuleUrl: string | null;
  developers: string[];
  publishers: string[];
  genres: string[];
  releaseText: string | null;
  screenshots: { id: number; thumbUrl: string; fullUrl: string }[];
}

export type SteamFailure = 'bad_key' | 'rate_limited' | 'not_found' | 'unavailable';

/** A Steam call that failed, with enough to decide what to tell the admin. */
export class SteamApiError extends Error {
  constructor(
    readonly failure: SteamFailure,
    message: string,
  ) {
    super(message);
  }
}

const WEB_API = 'https://api.steampowered.com';
const STORE_API = 'https://store.steampowered.com/api';
const REQUEST_TIMEOUT_MS = 15_000;

/** A public, long-dormant account id. Only ever used as the fixture's stand-in. */
const FIXTURE_STEAM_ID = '76561197960287930';

/**
 * Every HTTP call to Steam, and nothing else — no database, no decisions.
 *
 * ## Two APIs with different rules
 *
 * - The **Web API** (`api.steampowered.com`) needs her key and answers for her
 *   account: what she owns and how long she has played it.
 * - The **store API** (`store.steampowered.com/api/appdetails`) needs no key
 *   and describes a game: art, screenshots, genres. It is undocumented and
 *   rate-limited by address, which is why `SteamService` spaces its calls out.
 *
 * ## The key never reaches a log
 *
 * The Web API takes the key in the query string, so a URL is a secret. Errors
 * here are built from the method name and the status, never from the URL.
 *
 * ## `STEAM_MODE=fixture`
 *
 * Swaps the three Web API calls for a committed list of real app ids
 * (`test/fixtures/steam/owned-games.json`) so the whole sync can be exercised
 * with no key. The store half still runs for real — it never needed one — so
 * the games that land are real games with real art. Refused in production.
 */
@Injectable()
export class SteamClient {
  private readonly logger = new Logger(SteamClient.name);
  readonly fixtureMode: boolean;

  constructor(config: ConfigService) {
    this.fixtureMode = (config.get<string>('STEAM_MODE') ?? '').trim().toLowerCase() === 'fixture';
    const isProduction = (config.get<string>('NODE_ENV') ?? '').trim() === 'production';
    if (this.fixtureMode && isProduction) {
      throw new Error('STEAM_MODE=fixture is a development aid and is refused in production.');
    }
    if (this.fixtureMode) {
      this.logger.warn('STEAM_MODE=fixture — the library comes from a fixture file, not Steam.');
    }
  }

  /** `null` when the vanity name matches nobody. */
  async resolveVanity(apiKey: string, vanity: string): Promise<string | null> {
    if (this.fixtureMode) return FIXTURE_STEAM_ID;
    const body = await this.webApi<{ response?: { success?: number; steamid?: string } }>(
      'ISteamUser/ResolveVanityURL/v1',
      { key: apiKey, vanityurl: vanity },
    );
    return body.response?.success === 1 && body.response.steamid ? body.response.steamid : null;
  }

  /** The account's display name, or `null` when Steam knows no such id. */
  async personaName(apiKey: string, steamId: string): Promise<string | null> {
    if (this.fixtureMode) return 'Fixture library';
    const body = await this.webApi<{ response?: { players?: { personaname?: string }[] } }>(
      'ISteamUser/GetPlayerSummaries/v2',
      { key: apiKey, steamids: steamId },
    );
    const player = body.response?.players?.[0];
    return player ? (player.personaname ?? '') : null;
  }

  /**
   * Everything the account owns.
   *
   * `null` — not an empty list — when Steam returns no game list at all, which
   * is what a profile whose "Game details" are not public looks like. The
   * caller tells those apart: an empty library is a fact, a missing one is a
   * privacy setting to change.
   */
  async ownedGames(apiKey: string, steamId: string): Promise<OwnedGame[] | null> {
    if (this.fixtureMode) return this.fixtureGames();
    const body = await this.webApi<{
      response?: {
        games?: {
          appid: number;
          name?: string;
          playtime_forever?: number;
          playtime_2weeks?: number;
          rtime_last_played?: number;
        }[];
      };
    }>('IPlayerService/GetOwnedGames/v1', {
      key: apiKey,
      steamid: steamId,
      include_appinfo: '1',
      include_played_free_games: '1',
      format: 'json',
    });
    const games = body.response?.games;
    if (!games) return null;
    return games.map((game) => ({
      appId: game.appid,
      name: game.name?.trim() || `App ${game.appid}`,
      playtimeMinutes: game.playtime_forever ?? 0,
      playtimeRecentMinutes: game.playtime_2weeks ?? 0,
      lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
    }));
  }

  /** The store page's data, or `null` when the store has no page for the app. */
  async appDetails(appId: number): Promise<AppDetails | null> {
    const response = await this.request(
      `${STORE_API}/appdetails?appids=${appId}&l=english&cc=us`,
      'store appdetails',
    );
    const body = (await response.json().catch(() => null)) as Record<
      string,
      { success?: boolean; data?: StoreAppData }
    > | null;
    const entry = body?.[String(appId)];
    if (!entry?.success || !entry.data) return null;

    const data = entry.data;
    return {
      type: data.type ?? null,
      name: data.name ?? null,
      summary: data.short_description ? decodeEntities(data.short_description) : null,
      headerUrl: data.header_image ?? null,
      capsuleUrl: data.capsule_image ?? null,
      developers: data.developers ?? [],
      publishers: data.publishers ?? [],
      genres: (data.genres ?? []).map((genre) => genre.description).filter(Boolean),
      releaseText: data.release_date?.coming_soon
        ? 'Coming soon'
        : data.release_date?.date?.trim() || null,
      screenshots: (data.screenshots ?? []).map((shot) => ({
        id: shot.id,
        thumbUrl: shot.path_thumbnail,
        fullUrl: shot.path_full,
      })),
    };
  }

  private async webApi<T>(method: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const response = await this.request(`${WEB_API}/${method}/?${query}`, method);
    return (await response.json()) as T;
  }

  /** `label` is what an error names. It is never the URL — see the class comment. */
  private async request(url: string, label: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new SteamApiError('unavailable', `Steam did not answer (${label}).`);
    }
    if (response.ok) return response;

    if (response.status === 401 || response.status === 403) {
      throw new SteamApiError('bad_key', 'Steam refused that API key.');
    }
    if (response.status === 429) {
      throw new SteamApiError('rate_limited', 'Steam asked us to slow down.');
    }
    if (response.status === 404) {
      throw new SteamApiError('not_found', `Steam has nothing at ${label}.`);
    }
    throw new SteamApiError('unavailable', `Steam answered ${response.status} (${label}).`);
  }

  private async fixtureGames(): Promise<OwnedGame[]> {
    const file = path.join(process.cwd(), 'test', 'fixtures', 'steam', 'owned-games.json');
    const raw = JSON.parse(await readFile(file, 'utf8')) as {
      games: {
        appid: number;
        name: string;
        playtime_forever?: number;
        playtime_2weeks?: number;
        rtime_last_played?: number;
      }[];
    };
    return raw.games.map((game) => ({
      appId: game.appid,
      name: game.name,
      playtimeMinutes: game.playtime_forever ?? 0,
      playtimeRecentMinutes: game.playtime_2weeks ?? 0,
      lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
    }));
  }
}

interface StoreAppData {
  type?: string;
  name?: string;
  short_description?: string;
  header_image?: string;
  capsule_image?: string;
  developers?: string[];
  publishers?: string[];
  genres?: { id: string; description: string }[];
  release_date?: { coming_soon?: boolean; date?: string };
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
}

/**
 * The store's short description is text with HTML entities in it
 * ("Tom &amp; Jerry", "&quot;quoted&quot;"). It is stored as plain text and
 * rendered as text, so they are decoded here rather than shown literally.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}
