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
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { AuthConfig } from '../auth/auth.config';
import { open, seal } from '../common/secret-box';
import { GameScreenshotEntity } from '../games/game-screenshot.entity';
import { GameEntity } from '../games/game.entity';
import { GamesService } from '../games/games.service';
import { ConnectSteamDto } from './dto/steam.dto';
import { SteamConnectionEntity, SteamSyncStatus } from './steam-connection.entity';
import { AppDetails, SteamApiError, SteamClient } from './steam.client';

const CONNECTION_ID = 1;

/**
 * The gap between two store calls. The store API's limit is undocumented and
 * enforced by address; about one a second is the ceiling people report, and a
 * library is synced in the background where nobody is waiting on it.
 */
const STORE_CALL_GAP_MS = 1_500;

/** Store details older than this are refreshed, a few per sync. */
const DETAILS_STALE_MS = 30 * 86_400_000;
const STALE_REFRESHES_PER_SYNC = 25;

/**
 * The store genres that mark software rather than a game.
 *
 * Steam's `type` cannot be relied on for this: Wallpaper Engine and Source
 * Filmmaker both come back as `type: "game"`. What gives them away is the
 * genre list, where software carries at least one of these and a game never
 * does. It is a guess about what to hide ON ARRIVAL, nothing more — one click
 * on the games list shows anything it got wrong.
 */
const SOFTWARE_GENRES = new Set([
  'Animation & Modeling',
  'Audio Production',
  'Design & Illustration',
  'Game Development',
  'Photo Editing',
  'Software Training',
  'Utilities',
  'Video Production',
  'Web Publishing',
  'Accounting',
]);

const looksLikeAGame = (details: AppDetails): boolean =>
  (!details.type || details.type === 'game') &&
  !details.genres.some((genre) => SOFTWARE_GENRES.has(genre));

export interface SteamSyncProgress {
  running: boolean;
  phase: 'library' | 'details' | null;
  done: number;
  total: number;
}

export interface SteamStatus {
  connected: boolean;
  /** Connected, but the stored key can no longer be read — reconnect. */
  needsReconnect: boolean;
  fixtureMode: boolean;
  steamId: string | null;
  vanity: string | null;
  personaName: string | null;
  connectedAt: Date | null;
  lastSync: {
    at: Date | null;
    status: SteamSyncStatus | null;
    error: string | null;
    gameCount: number | null;
  };
  sync: SteamSyncProgress;
}

/**
 * The Steam connection and the sync that feeds `games`.
 *
 * ## The sync is a background job, not a request
 *
 * A first sync is one Web API call plus one store call per game, spaced a
 * second and a half apart — minutes for a real library, against nginx's
 * sixty-second proxy timeout. So `startSync` returns at once and the admin
 * screen polls `status()`. Progress is held in memory: this is one process,
 * and a restart mid-sync simply leaves the unfetched games `pending` for the
 * next run to pick up. Nothing is lost and nothing needs resuming by hand.
 *
 * ## What the sync may write
 *
 * Only the sync-owned half of a game (`game.entity.ts`). It never updates an
 * admin-owned column on an existing row, never deletes a game, and cannot
 * match a manual game at all because it keys on `steam_app_id`. The single
 * exception is `is_hidden` on the very first details fetch: something that
 * turns out to be software, a demo or a soundtrack arrives hidden, once, and
 * is hers to unhide from then on. See `looksLikeAGame`.
 */
@Injectable()
export class SteamService {
  private readonly logger = new Logger(SteamService.name);
  private progress: SteamSyncProgress = { running: false, phase: null, done: 0, total: 0 };

  constructor(
    @InjectRepository(SteamConnectionEntity)
    private readonly connections: Repository<SteamConnectionEntity>,
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
    @InjectRepository(GameScreenshotEntity)
    private readonly screenshots: Repository<GameScreenshotEntity>,
    private readonly gamesService: GamesService,
    private readonly client: SteamClient,
    private readonly authConfig: AuthConfig,
  ) {}

  async status(): Promise<SteamStatus> {
    const row = await this.connection();
    return {
      connected: Boolean(row),
      needsReconnect: Boolean(row) && this.readKey(row!) === null,
      fixtureMode: this.client.fixtureMode,
      steamId: row?.steamId ?? null,
      vanity: row?.vanity ?? null,
      personaName: row?.personaName ?? null,
      connectedAt: row?.connectedAt ?? null,
      lastSync: {
        at: row?.lastSyncAt ?? null,
        status: row?.lastSyncStatus ?? null,
        error: row?.lastSyncError ?? null,
        gameCount: row?.lastSyncGameCount ?? null,
      },
      sync: { ...this.progress },
    };
  }

  /**
   * Stores the key and the account, having proved both against Steam first.
   *
   * Verified before it is saved, because a key that is wrong fails at the
   * next sync otherwise — hours later, in a log, with the admin long gone
   * from the screen that could have told them.
   */
  async connect(dto: ConnectSteamDto): Promise<SteamStatus> {
    if (this.progress.running) {
      throw new ConflictException('A sync is running. Wait for it to finish, then reconnect.');
    }
    const target = parseProfile(dto.steamProfile);

    let steamId: string;
    let personaName: string | null;
    try {
      if (target.steamId) {
        steamId = target.steamId;
      } else {
        const resolved = await this.client.resolveVanity(dto.apiKey, target.vanity!);
        if (!resolved) {
          throw new BadRequestException(
            `Steam has no profile called "${target.vanity}". Paste the profile's full address instead.`,
          );
        }
        steamId = resolved;
      }
      personaName = await this.client.personaName(dto.apiKey, steamId);
    } catch (error) {
      throw toHttpError(error);
    }
    if (personaName === null) {
      throw new BadRequestException('Steam has no account with that id.');
    }

    await this.connections.save(
      this.connections.create({
        id: CONNECTION_ID,
        steamId,
        vanity: target.vanity ?? null,
        apiKeySealed: seal(dto.apiKey, this.authConfig.encryptionSecret),
        personaName: personaName || null,
        connectedAt: new Date(),
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        lastSyncGameCount: null,
      }),
    );
    this.startSync();
    return this.status();
  }

  /**
   * Forgets the key and the account. The games stay: they carry her ratings,
   * reviews and stream history, and she may be reconnecting in a minute.
   */
  async disconnect(): Promise<SteamStatus> {
    if (this.progress.running) {
      throw new ConflictException('A sync is running. Wait for it to finish, then disconnect.');
    }
    await this.connections.delete({ id: CONNECTION_ID });
    return this.status();
  }

  /** Starts a sync unless one is already running. Returns immediately. */
  startSync(): void {
    if (this.progress.running) return;
    this.progress = { running: true, phase: 'library', done: 0, total: 0 };
    void this.run().finally(() => {
      this.progress = { running: false, phase: null, done: 0, total: 0 };
    });
  }

  /** `POST /admin/steam/sync` — refuses when there is nothing to sync from. */
  async requestSync(): Promise<SteamStatus> {
    const row = await this.connection();
    if (!row) throw new BadRequestException('Connect a Steam account first.');
    if (this.readKey(row) === null) {
      throw new BadRequestException('The stored Steam key can no longer be read. Reconnect Steam.');
    }
    this.startSync();
    return this.status();
  }

  /** Whether the daily job has anything to do. */
  async isConnected(): Promise<boolean> {
    const row = await this.connection();
    return Boolean(row) && this.readKey(row!) !== null;
  }

  /** Re-fetches one game's store page now — the "Refresh from Steam" button. */
  async refreshGame(gameId: string): Promise<void> {
    const game = await this.games.findOne({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Not found');
    if (!game.steamAppId) {
      throw new BadRequestException('This game was added by hand, so there is nothing to refresh.');
    }
    try {
      await this.fetchDetails(game);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  // ---------- the sync ----------

  private async run(): Promise<void> {
    const row = await this.connection();
    const apiKey = row ? this.readKey(row) : null;
    if (!row || apiKey === null) return;

    let status: SteamSyncStatus = 'ok';
    let message: string | null = null;
    let gameCount: number | null = row.lastSyncGameCount;

    try {
      gameCount = await this.syncLibrary(apiKey, row.steamId);
      const complete = await this.syncDetails();
      if (!complete) {
        status = 'partial';
        message = 'Steam asked us to slow down. The remaining games will be filled in on the next sync.';
      }
    } catch (error) {
      status = 'failed';
      message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Steam sync failed: ${message}`);
    }

    await this.connections.update(CONNECTION_ID, {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: message ? message.slice(0, 500) : null,
      lastSyncGameCount: gameCount,
    });
  }

  /** Phase one: what she owns and how long she has played it. */
  private async syncLibrary(apiKey: string, steamId: string): Promise<number> {
    const owned = await this.client.ownedGames(apiKey, steamId);
    if (owned === null) {
      throw new Error(
        'Steam returned no game list. In Steam, open Profile → Edit Profile → Privacy Settings and set "Game details" to Public, then sync again.',
      );
    }

    const existing = await this.games.find({ where: { steamAppId: Not(IsNull()) } });
    const byAppId = new Map(existing.map((game) => [game.steamAppId!, game]));
    this.progress = { running: true, phase: 'library', done: 0, total: owned.length };

    for (const item of owned) {
      const game = byAppId.get(item.appId);
      if (game) {
        await this.games.update(game.id, {
          steamName: item.name,
          playtimeMinutes: item.playtimeMinutes,
          playtimeRecentMinutes: item.playtimeRecentMinutes,
          lastPlayedAt: item.lastPlayedAt,
          steamOwned: true,
        });
      } else {
        await this.games.insert({
          id: randomUUID(),
          slug: await this.gamesService.uniqueSlug(item.name, item.appId),
          source: 'steam',
          steamAppId: item.appId,
          steamName: item.name,
          playtimeMinutes: item.playtimeMinutes,
          playtimeRecentMinutes: item.playtimeRecentMinutes,
          lastPlayedAt: item.lastPlayedAt,
          steamOwned: true,
          steamDetailsStatus: 'pending',
        });
      }
      this.progress.done += 1;
    }

    // Something that has left the library is marked, never deleted: its
    // reviews and stream history stay attached to it.
    const ownedIds = new Set(owned.map((item) => item.appId));
    const gone = existing.filter((game) => game.steamOwned && !ownedIds.has(game.steamAppId!));
    if (gone.length) {
      await this.games.update({ id: In(gone.map((game) => game.id)) }, { steamOwned: false });
    }
    return owned.length;
  }

  /**
   * Phase two: the store page for every game that has none yet, then a few of
   * the stalest. Returns false if Steam rate-limited us before the end.
   */
  private async syncDetails(): Promise<boolean> {
    const pending = await this.games.find({
      where: { steamAppId: Not(IsNull()), steamDetailsStatus: 'pending' },
      order: { playtimeMinutes: 'DESC' },
    });
    const stale = await this.games.find({
      where: {
        steamAppId: Not(IsNull()),
        steamDetailsStatus: Not('pending'),
        steamDetailsFetchedAt: LessThan(new Date(Date.now() - DETAILS_STALE_MS)),
      },
      order: { steamDetailsFetchedAt: 'ASC' },
      take: STALE_REFRESHES_PER_SYNC,
    });

    const queue = [...pending, ...stale];
    this.progress = { running: true, phase: 'details', done: 0, total: queue.length };

    for (const [index, game] of queue.entries()) {
      if (index > 0) await sleep(STORE_CALL_GAP_MS);
      try {
        await this.fetchDetails(game);
      } catch (error) {
        if (error instanceof SteamApiError && error.failure === 'rate_limited') return false;
        // One game's store page failing is not a reason to abandon the rest.
        this.logger.warn(
          `Store details for app ${game.steamAppId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.progress.done += 1;
    }
    return true;
  }

  private async fetchDetails(game: GameEntity): Promise<void> {
    const details = await this.client.appDetails(game.steamAppId!);
    const firstFetch = game.steamDetailsFetchedAt === null;

    if (!details) {
      // No store page — delisted, or region-locked. The name from the library
      // call is still there, and the client draws a lettered tile for it.
      await this.games.update(game.id, {
        steamDetailsStatus: 'missing',
        steamDetailsFetchedAt: new Date(),
      });
      return;
    }

    await this.games.update(game.id, {
      steamType: details.type?.slice(0, 24) ?? null,
      steamSummary: details.summary?.slice(0, 1000) ?? null,
      steamHeaderUrl: details.headerUrl,
      steamCapsuleUrl: details.capsuleUrl,
      steamDevelopers: details.developers.join(', ').slice(0, 300) || null,
      steamPublishers: details.publishers.join(', ').slice(0, 300) || null,
      steamGenres: details.genres,
      steamReleaseText: details.releaseText?.slice(0, 60) ?? null,
      steamDetailsStatus: 'ok',
      steamDetailsFetchedAt: new Date(),
      // The one admin-owned column the sync ever writes, and only on arrival.
      ...(firstFetch && !looksLikeAGame(details) ? { isHidden: true } : {}),
    });
    await this.syncScreenshots(game.id, details);
  }

  /**
   * Brings the Steam half of a gallery in line with the store. Uploaded shots
   * are untouched, and an existing Steam shot keeps its place and its hidden
   * flag — only its URLs are refreshed.
   */
  private async syncScreenshots(gameId: string, details: AppDetails): Promise<void> {
    const existing = await this.screenshots.find({ where: { gameId } });
    const steamShots = existing.filter((shot) => shot.source === 'steam');
    const bySteamId = new Map(steamShots.map((shot) => [shot.steamShotId!, shot]));
    let nextOrder = existing.reduce((max, shot) => Math.max(max, shot.sortOrder + 1), 0);

    const seen = new Set<number>();
    for (const shot of details.screenshots) {
      seen.add(shot.id);
      const row = bySteamId.get(shot.id);
      if (row) {
        if (row.urlThumb !== shot.thumbUrl || row.urlFull !== shot.fullUrl) {
          await this.screenshots.update(row.id, {
            urlThumb: shot.thumbUrl,
            urlFull: shot.fullUrl,
          });
        }
      } else {
        await this.screenshots.insert({
          id: randomUUID(),
          gameId,
          source: 'steam',
          steamShotId: shot.id,
          urlThumb: shot.thumbUrl,
          urlFull: shot.fullUrl,
          sortOrder: nextOrder,
        });
        nextOrder += 1;
      }
    }

    // A shot the store has withdrawn would only be a broken image here.
    const withdrawn = steamShots.filter((shot) => !seen.has(shot.steamShotId!));
    if (withdrawn.length) await this.screenshots.remove(withdrawn);
  }

  // ---------- the connection ----------

  private connection(): Promise<SteamConnectionEntity | null> {
    return this.connections.findOne({ where: { id: CONNECTION_ID } });
  }

  /**
   * The key in the clear, or `null` when it cannot be opened — which is what
   * a rotated `SESSION_ENCRYPTION_SECRET` looks like. Reported as "reconnect",
   * never thrown: a status page that 500s cannot tell anyone what to do.
   */
  private readKey(row: SteamConnectionEntity): string | null {
    try {
      return open(row.apiKeySealed, this.authConfig.encryptionSecret);
    } catch {
      return null;
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What the admin typed, as either a SteamID or a custom URL name.
 *
 * Accepts the 17-digit id, `steamcommunity.com/profiles/<id>`,
 * `steamcommunity.com/id/<name>`, or the bare name.
 */
function parseProfile(input: string): { steamId?: string; vanity?: string } {
  const value = input.trim().replace(/\/+$/, '');
  if (/^\d{17}$/.test(value)) return { steamId: value };

  const profile = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(value);
  if (profile) return { steamId: profile[1] };

  const custom = /steamcommunity\.com\/id\/([^/?#]+)/i.exec(value);
  const vanity = custom ? custom[1] : value;
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(vanity)) {
    throw new BadRequestException(
      'Paste the address of the Steam profile — it looks like https://steamcommunity.com/id/yourname or https://steamcommunity.com/profiles/7656119…',
    );
  }
  return { vanity };
}

/** A Steam failure as something the admin screen can show. */
function toHttpError(error: unknown): Error {
  if (!(error instanceof SteamApiError)) return error as Error;
  if (error.failure === 'bad_key') {
    return new BadRequestException(
      'Steam refused that API key. Copy it again from steamcommunity.com/dev/apikey.',
    );
  }
  if (error.failure === 'rate_limited') {
    return new BadGatewayException('Steam asked us to slow down. Try again in a few minutes.');
  }
  return new BadGatewayException(error.message);
}
