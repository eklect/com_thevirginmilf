/**
 * The shapes the API returns, and the few pure helpers every view shares.
 *
 * Hand-written to mirror the server rather than generated: the surface is
 * small, and each type below names the server file it follows so a change
 * there has an obvious second place to make it.
 */

// ---------- identity ----------

/** `GET /api/auth/me`. */
export interface Me {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

// ---------- settings and pages — `server/src/settings/settings.keys.ts` ----------

export const SITE_SETTING_KEYS = [
  'site_name',
  'streamer_name',
  'tagline',
  'home_intro',
  'streams_intro',
  'live_intro',
  'games_intro',
  'favorites_intro',
  'links_intro',
  'subscribe_intro',
  'about_body',
  'headshot_upload_id',
  'logo_upload_id',
  'mail_from_name',
  'favorites_auto_count',
  'notify_announce',
  'notify_reminder',
  'reminder_lead_minutes',
  'alerts_timezone',
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];
export type SiteSettings = Record<SiteSettingKey, string>;

export const PAGE_KEYS = [
  'home',
  'streams',
  'live',
  'games',
  'favorites',
  'links',
  'about',
  'signup',
  'settings',
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

/** Where each page lives. Nesting in the nav never changes a page's URL. */
export const PAGE_PATHS: Record<PageKey, string> = {
  home: '/',
  streams: '/streams',
  live: '/live',
  games: '/games',
  favorites: '/favorites',
  links: '/links',
  about: '/about',
  signup: '/signup',
  settings: '/account',
};

/**
 * The pages that are never in the header nav: `home` is the wordmark, and
 * `signup` / `settings` sit in the account cluster. Mirrors
 * `NON_NESTABLE_PAGE_KEYS` on the server. (Privacy is no longer a page here —
 * the footer links to Mucci & Co's policy.)
 */
export const NON_NESTABLE_PAGE_KEYS: readonly PageKey[] = ['home', 'signup', 'settings'];

export interface PageSetting {
  key: PageKey;
  enabled: boolean;
  navLabel: string;
  parentKey: PageKey | null;
  sortOrder: number;
}

export interface NavNode {
  page: PageSetting;
  children: PageSetting[];
}

// ---------- channels — `server/src/channels/channel.entity.ts` ----------

export const CHANNEL_PLATFORMS = [
  'twitch',
  'youtube',
  'kick',
  'tiktok',
  'x',
  'instagram',
  'discord',
  'facebook',
  'email',
  'other',
] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<ChannelPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tiktok: 'TikTok',
  x: 'X',
  instagram: 'Instagram',
  discord: 'Discord',
  facebook: 'Facebook',
  email: 'Email',
  other: 'Other',
};

/** A published channel, as `/api/site/bootstrap` carries it. */
export interface Channel {
  id: string;
  slug: string;
  name: string;
  platform: ChannelPlatform;
  url: string;
  handle: string | null;
  description: string | null;
  isStreamChannel: boolean;
  showOnLinks: boolean;
}

/** The admin's row: the same, plus what the public plane leaves out. */
export interface AdminChannel extends Channel {
  sortOrder: number;
  isPublished: boolean;
}

export interface Bootstrap {
  settings: SiteSettings;
  pages: PageSetting[];
  channels: Channel[];
  mapPortalUrl: string;
  /** Empty when the server has no VAPID key, which hides the push control. */
  pushPublicKey: string;
}

// ---------- streams — `server/src/streams/streams.serializer.ts` ----------

export interface StreamChannel {
  id: string;
  name: string;
  platform: ChannelPlatform;
  /** ABSENT for a signed-out visitor — the server never sends it. */
  url?: string;
}

export interface Stream {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  isPublished: boolean;
  game: { slug: string; title: string; coverUrl: string | null } | null;
  channels: StreamChannel[];
  linksLocked: boolean;
}

export interface AdminStream extends Stream {
  notify: boolean;
  gameId: string | null;
  announcedAt: string | null;
  remindedStartAt: string | null;
  channelLinks: { channelId: string; urlOverride: string | null }[];
}

// ---------- games — `server/src/games/games.serializer.ts` ----------

export interface GameCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  source: 'steam' | 'manual';
  platform: string | null;
  rating: number | null;
  isFavorite: boolean;
  playtimeHours: number | null;
  lastPlayedAt: string | null;
  genres: string[];
}

export interface GameDetail extends GameCard {
  description: string | null;
  developer: string | null;
  publisher: string | null;
  releaseText: string | null;
  storeUrl: string | null;
}

export interface Screenshot {
  id: string;
  thumbUrl: string;
  fullUrl: string;
}

export interface AdminScreenshot extends Screenshot {
  source: 'steam' | 'upload';
  isHidden: boolean;
}

export interface Review {
  id: string;
  title: string;
  body: string;
  isPublished: boolean;
  publishedAt: string | null;
}

export interface ReviewSummary {
  id: string;
  title: string;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
  game: { id: string; slug: string; title: string; coverUrl: string | null; rating: number | null };
}

export interface Category {
  slug: string;
  name: string;
  description: string | null;
  gameCount: number;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
}

/** `server/src/games/games.service.ts` — `AdminGame`. */
export interface AdminGame extends GameDetail {
  steamAppId: number | null;
  isHidden: boolean;
  favoritesExcluded: boolean;
  steamOwned: boolean;
  steamType: string | null;
  steamDetailsStatus: 'pending' | 'ok' | 'missing' | null;
  playtimeMinutes: number;
  overrides: {
    title: string | null;
    summary: string | null;
    developer: string | null;
    publisher: string | null;
    releaseText: string | null;
    platformLabel: string | null;
    coverUploadId: string | null;
  };
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

// ---------- steam — `server/src/steam/steam.service.ts` ----------

export interface SteamStatus {
  connected: boolean;
  needsReconnect: boolean;
  fixtureMode: boolean;
  steamId: string | null;
  vanity: string | null;
  personaName: string | null;
  connectedAt: string | null;
  lastSync: {
    at: string | null;
    status: 'ok' | 'partial' | 'failed' | null;
    error: string | null;
    gameCount: number | null;
  };
  sync: { running: boolean; phase: 'library' | 'details' | null; done: number; total: number };
}

// ---------- account, uploads, subscribers ----------

export interface AccountSettings {
  emailAlerts: boolean;
  email: string;
  unsubscribeToken: string;
}

export interface Upload {
  id: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
  createdAt: string;
}

export interface SubscriberRow {
  id: string;
  email: string;
  isSubscribed: boolean;
  suppressedAt: string | null;
  createdAt: string;
}

// ---------- helpers ----------

/** The browser's path to an uploaded image. Mirrors `uploads/upload-url.ts`. */
export const uploadUrl = (id: string): string => `/api/uploads/${id}`;

/** "September 29, 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** "Mon, Sep 29, 7:00 PM" — in the viewer's own time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "7:00 PM". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * When a stream is, for a person: "Friday, October 3 · 7:00 PM – 10:00 PM EDT".
 * The viewer's own zone, and it says which — a stream time with no zone on it
 * is a guess for anybody not where she is.
 */
export function formatStreamWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const day = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const zone =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(start)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  const range = endsAt ? `${formatTime(startsAt)} – ${formatTime(endsAt)}` : formatTime(startsAt);
  return `${day} · ${range}${zone ? ` ${zone}` : ''}`;
}

/** Whether a stream is on right now. No end time reads as three hours long. */
export function isLiveNow(stream: Pick<Stream, 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  const start = new Date(stream.startsAt).getTime();
  const end = stream.endsAt ? new Date(stream.endsAt).getTime() : start + 3 * 3_600_000;
  return start <= now && now < end;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "142 hours", "1 hour", "0.5 hours". */
export function formatHours(hours: number | null): string {
  if (hours === null) return '';
  return `${hours.toLocaleString('en-US')} ${hours === 1 ? 'hour' : 'hours'}`;
}
