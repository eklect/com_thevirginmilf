import { uploadUrl } from '../uploads/upload-url';
import { GameScreenshotEntity } from './game-screenshot.entity';
import { GameEntity } from './game.entity';

/**
 * What the site shows for a game, resolved from its two halves.
 *
 * `admin ?? steam`, in one place. Every reader — the public cards, the detail
 * page, the admin list, a stream's "playing" line, an alert email — goes
 * through here, so the override rule cannot be applied differently in two of
 * them. See `game.entity.ts` for why the columns are split.
 */

export interface GameCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  source: 'steam' | 'manual';
  /** "Steam", or the manual game's own platform label. */
  platform: string | null;
  rating: number | null;
  isFavorite: boolean;
  /** Whole hours, one decimal under ten. Null for a game with no playtime to show. */
  playtimeHours: number | null;
  lastPlayedAt: Date | null;
  genres: string[];
}

export interface GameScreenshot {
  id: string;
  thumbUrl: string;
  fullUrl: string;
}

export const gameTitle = (game: GameEntity): string =>
  game.title?.trim() || game.steamName?.trim() || 'Untitled game';

export const gameCoverUrl = (game: GameEntity): string | null =>
  game.coverUploadId ? uploadUrl(game.coverUploadId) : game.steamHeaderUrl;

export function playtimeHours(minutes: number): number | null {
  if (!minutes || minutes <= 0) return null;
  const hours = minutes / 60;
  return hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
}

export function toGameCard(game: GameEntity): GameCard {
  return {
    id: game.id,
    slug: game.slug,
    title: gameTitle(game),
    summary: game.summary ?? game.steamSummary,
    coverUrl: gameCoverUrl(game),
    source: game.source,
    platform: game.source === 'steam' ? 'Steam' : game.platformLabel,
    rating: game.rating,
    isFavorite: game.isFavorite,
    playtimeHours: playtimeHours(game.playtimeMinutes),
    lastPlayedAt: game.lastPlayedAt,
    genres: game.steamGenres ?? [],
  };
}

export interface GameDetail extends GameCard {
  description: string | null;
  developer: string | null;
  publisher: string | null;
  releaseText: string | null;
  /** The Steam store page, for a Steam game. */
  storeUrl: string | null;
}

export function toGameDetail(game: GameEntity): GameDetail {
  return {
    ...toGameCard(game),
    description: game.description,
    developer: game.developer ?? game.steamDevelopers,
    publisher: game.publisher ?? game.steamPublishers,
    releaseText: game.releaseText ?? game.steamReleaseText,
    storeUrl: game.steamAppId
      ? `https://store.steampowered.com/app/${game.steamAppId}/`
      : null,
  };
}

/** Null for a row with nothing to draw — an upload whose file has gone. */
export function toScreenshot(shot: GameScreenshotEntity): GameScreenshot | null {
  if (shot.source === 'upload') {
    if (!shot.uploadId) return null;
    const url = uploadUrl(shot.uploadId);
    return { id: shot.id, thumbUrl: url, fullUrl: url };
  }
  const fullUrl = shot.urlFull ?? shot.urlThumb;
  if (!fullUrl) return null;
  return { id: shot.id, thumbUrl: shot.urlThumb ?? fullUrl, fullUrl };
}

/** By title, the way a person reads a shelf: case-blind, "The" included. */
export const byTitle = (a: GameEntity, b: GameEntity): number =>
  gameTitle(a).localeCompare(gameTitle(b), 'en', { sensitivity: 'base', numeric: true });
