import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { timedEnd } from '../calendar-export/dates';
import { effectiveLevel, isDetailLevel, levelsUnder, markdownToText, redact, type DetailLevel, type ExportItem } from '../calendar-export/detail-level';
import { FEED_DAYS_AHEAD, FEED_DAYS_BACK, hashFeedToken, looksLikeFeedToken, newFeedToken } from '../calendar-export/feed-token';
import { buildIcs, icsFilename, opaqueUid } from '../calendar-export/ics';
import { addLinks, subscribeLinks, type AddLinks, type SubscribeLinks } from '../calendar-export/links';
import { MapOptoutsService } from '../map-optouts/map-optouts.service';
import { SiteSettingEntity } from '../settings/site-setting.entity';
import { CalendarFeedTokenEntity } from './calendar-feed-token.entity';
import { StreamEventEntity } from './stream-event.entity';
import { toStreamView, type StreamView, type StreamViewer } from './streams.serializer';
import { StreamsService } from './streams.service';

/** In `site_settings`, but off the generic list: written only through `PATCH /calendar/export/settings`. */
const CAP_KEY = 'calendar_export_cap';
/** A stream with no end is drawn three hours long on the calendar; the same here. */
const DEFAULT_MINUTES = 180;

export interface ExportSettings {
  cap: DetailLevel;
  levels: DetailLevel[];
}

export interface FeedState extends ExportSettings {
  feed: { name: string; level: DetailLevel; sources: null; createdAt: Date; lastFetchedAt: Date | null } | null;
}

/**
 * Streams to Google, Outlook or a file, and a signed-in visitor's private
 * feed of the stream calendar.
 *
 * Built from `toStreamView`, never the entity: an anonymous visitor's view
 * has no watch links, so neither does anything they export. A feed answers
 * as its signed-in owner, and stops once they remove the site from their
 * Mucci & Co apps.
 */
@Injectable()
export class StreamExportService {
  private readonly siteUrl: string;
  private readonly uidHost: string;

  constructor(
    @InjectRepository(CalendarFeedTokenEntity)
    private readonly tokens: Repository<CalendarFeedTokenEntity>,
    @InjectRepository(StreamEventEntity)
    private readonly events: Repository<StreamEventEntity>,
    @InjectRepository(SiteSettingEntity)
    private readonly settings: Repository<SiteSettingEntity>,
    private readonly streams: StreamsService,
    private readonly optouts: MapOptoutsService,
    config: ConfigService,
  ) {
    this.siteUrl = (config.get<string>('PUBLIC_SITE_URL') ?? '').replace(/\/+$/, '');
    this.uidHost = new URL(this.siteUrl || 'https://localhost').host;
  }

  async exportSettings(): Promise<ExportSettings> {
    const cap = await this.cap();
    return { cap, levels: levelsUnder(cap) };
  }

  async setCap(cap: DetailLevel): Promise<ExportSettings> {
    await this.settings.save(this.settings.create({ key: CAP_KEY, value: cap }));
    return this.exportSettings();
  }

  private async cap(): Promise<DetailLevel> {
    const row = await this.settings.findOne({ where: { key: CAP_KEY } });
    return isDetailLevel(row?.value) ? row.value : 'full';
  }

  private async siteName(): Promise<string> {
    const row = await this.settings.findOne({ where: { key: 'site_name' } });
    return row?.value?.trim() || this.uidHost;
  }

  async streamLinks(id: string, viewer: StreamViewer, chosen: unknown): Promise<{ level: DetailLevel } & AddLinks> {
    const { item, level } = await this.one(id, viewer, chosen);
    return { level, ...addLinks(item) };
  }

  async streamIcs(id: string, viewer: StreamViewer, chosen: unknown): Promise<{ filename: string; body: string }> {
    const { item, level } = await this.one(id, viewer, chosen);
    return {
      filename: icsFilename(level === 'busy' ? 'busy' : item.title),
      body: buildIcs({ prodId: `-//${await this.siteName()}//Streams//EN`, items: [item] }),
    };
  }

  private async one(id: string, viewer: StreamViewer, chosen: unknown) {
    const view = toStreamView(await this.streams.getVisible(id, viewer.isAdmin), viewer);
    const level = effectiveLevel(await this.cap(), chosen);
    return { item: redact(this.fromStream(view), level), level };
  }

  async feedState(sub: string): Promise<FeedState> {
    const [row, settings] = await Promise.all([this.liveToken(sub), this.exportSettings()]);
    return {
      ...settings,
      feed: row ? { name: row.name, level: row.level, sources: null, createdAt: row.createdAt, lastFetchedAt: row.lastFetchedAt } : null,
    };
  }

  async createFeed(sub: string, input: { name?: string | null; level: DetailLevel }): Promise<FeedState & { links: SubscribeLinks }> {
    const level = effectiveLevel(await this.cap(), input.level);
    await this.revokeFeed(sub);
    const { token, hash } = newFeedToken();
    const name = input.name?.trim() || `${await this.siteName()} streams`;
    await this.tokens.insert({ id: randomUUID(), ownerUserId: sub, name, level, tokenHash: hash, lastFetchedAt: null, revokedAt: null });
    return { ...(await this.feedState(sub)), links: subscribeLinks(`${this.siteUrl}/api/calendar-feed/${token}`, name) };
  }

  async revokeFeed(sub: string): Promise<void> {
    await this.tokens.update({ ownerUserId: sub, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private liveToken(ownerUserId: string) {
    return this.tokens.findOne({ where: { ownerUserId, revokedAt: IsNull() } });
  }

  /** The feed, for whoever holds the address. `null` becomes a 404. */
  async publicFeed(token: string): Promise<string | null> {
    if (!looksLikeFeedToken(token)) return null;
    const row = await this.tokens.findOne({ where: { tokenHash: hashFeedToken(token), revokedAt: IsNull() } });
    if (!row) return null;
    if (await this.optouts.isRemoved(row.ownerUserId)) return null;

    const level = effectiveLevel(await this.cap(), row.level);
    const now = Date.now();
    const rows = await this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.channelLinks', 'link')
      .leftJoinAndSelect('link.channel', 'channel')
      .leftJoinAndSelect('event.game', 'game')
      .where('event.isPublished = 1')
      .andWhere('event.startsAt >= :from AND event.startsAt < :to', {
        from: new Date(now - FEED_DAYS_BACK * 86_400_000),
        to: new Date(now + FEED_DAYS_AHEAD * 86_400_000),
      })
      .orderBy('event.startsAt', 'ASC')
      .getMany();
    // The owner is a signed-in visitor, never an admin: drafts and hidden games stay out.
    const viewer: StreamViewer = { signedIn: true, isAdmin: false };

    if (!row.lastFetchedAt || now - row.lastFetchedAt.getTime() > 10 * 60_000) {
      await this.tokens.update({ id: row.id }, { lastFetchedAt: new Date() });
    }
    return buildIcs({
      prodId: `-//${await this.siteName()}//Streams//EN`,
      name: row.name,
      refresh: true,
      items: rows.map((event) => redact(this.fromStream(toStreamView(event, viewer), event.updatedAt), level)),
    });
  }

  /** A stream at Full details; `redact` takes away the rest. Watch links only if the view has them. */
  fromStream(view: StreamView, updatedAt?: Date | null): ExportItem {
    const startsAt = new Date(view.startsAt);
    const watch = view.channels.filter((c) => c.url).map((c) => `${c.name}: ${c.url}`);
    const lines = [
      view.game ? `Playing ${view.game.title}` : '',
      markdownToText(view.description),
      watch.length ? `Watch:\n${watch.join('\n')}` : view.linksLocked ? `Sign in at ${this.siteUrl} for the watch link.` : '',
    ].filter(Boolean);
    return {
      uid: opaqueUid(`stream_events:${view.id}`, this.uidHost),
      title: view.title,
      allDay: false,
      start: startsAt.toISOString(),
      end: timedEnd(startsAt, view.endsAt ? new Date(view.endsAt) : null, DEFAULT_MINUTES).toISOString(),
      description: lines.join('\n\n'),
      location: view.channels.map((c) => c.name).join(', ') || null,
      url: `${this.siteUrl}/streams/${view.id}`,
      updatedAt: updatedAt ?? null,
    };
  }
}
