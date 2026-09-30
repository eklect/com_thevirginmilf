import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthConfig } from '../auth/auth.config';
import { CategoriesService } from '../categories/categories.service';
import { ChannelsService } from '../channels/channels.service';
import { Public } from '../common/auth/auth.decorators';
import { GamesService } from '../games/games.service';
import { PushConfig } from '../push/push.config';
import { ReviewsService } from '../reviews/reviews.service';
import { SettingsService } from '../settings/settings.service';
import { StreamRangeQueryDto } from '../streams/dto/stream.dto';
import { StreamViewer, toStreamView } from '../streams/streams.serializer';
import { StreamsService } from '../streams/streams.service';
import { PageEnabledGuard } from './page-enabled.guard';

/** A stream response depends on who is asking, so nothing may cache it. */
const PER_VIEWER = 'private, no-store';

const viewerOf = (request: Request): StreamViewer => ({
  signedIn: Boolean(request.user),
  isAdmin: Boolean(request.user?.isAdmin),
});

/**
 * The public read plane — everything the site shows a visitor.
 *
 * Every list here is visible rows only: published streams, channels and
 * categories, games that are not hidden. The admin plane under `/admin`
 * returns the same collections unfiltered.
 *
 * The `request.user?.isAdmin` checks are what let an admin preview a draft
 * stream or a hidden game at its real URL without switching anything on.
 *
 * ## The stream routes answer differently to a signed-in caller
 *
 * They are `@Public()`, and `MapSessionGuard` still attaches `request.user`
 * when a session cookie is present. `toStreamView` uses that to decide
 * whether the links go out — see `streams.serializer.ts`. Those three routes
 * also send `Cache-Control: private, no-store`, so a signed-in response can
 * never be replayed to somebody who is not.
 */
@Public()
@Controller('site')
export class SiteController {
  constructor(
    private readonly authConfig: AuthConfig,
    private readonly pushConfig: PushConfig,
    private readonly settings: SettingsService,
    private readonly channels: ChannelsService,
    private readonly streams: StreamsService,
    private readonly games: GamesService,
    private readonly categories: CategoriesService,
    private readonly reviews: ReviewsService,
  ) {}

  /**
   * One call on first load: settings, page toggles, the channels the footer
   * and the Links and Live pages draw, where MAP's portal is, and the VAPID
   * public key a browser needs to subscribe to notifications.
   *
   * EVERYTHING HERE IS PUBLIC. `site_settings` goes out whole to anonymous
   * visitors, which is why no secret is ever stored in it.
   */
  @Get('bootstrap')
  async bootstrap() {
    const [settings, pages, channels] = await Promise.all([
      this.settings.all(),
      this.settings.pageSettings(),
      this.channels.list(true),
    ]);
    return {
      settings,
      pages,
      channels: channels.map(({ id, slug, name, platform, url, handle, description, isStreamChannel, showOnLinks }) => ({
        id,
        slug,
        name,
        platform,
        url,
        handle,
        description,
        isStreamChannel,
        showOnLinks,
      })),
      mapPortalUrl: this.authConfig.issuerUrl,
      pushPublicKey: this.pushConfig.clientPublicKey,
    };
  }

  /** The front page in one call: what is next, what she loves, what she wrote. */
  @Get('home')
  @Header('Cache-Control', PER_VIEWER)
  async home(@Req() request: Request) {
    const viewer = viewerOf(request);
    const [upcoming, favorites, recentlyPlayed, latestReviews] = await Promise.all([
      this.streams.upcoming(3, !viewer.isAdmin),
      this.games.favorites(),
      this.games.recentlyPlayed(4),
      this.reviews.latest(3),
    ]);
    return {
      upcoming: upcoming.map((event) => toStreamView(event, viewer)),
      favorites: [...favorites.hearted, ...favorites.mostPlayed].slice(0, 6),
      recentlyPlayed,
      latestReviews,
    };
  }

  // ---------- streams ----------

  /** The calendar's visible range. `from` and `to` are ISO instants, in UTC. */
  @Get('streams')
  @UseGuards(PageEnabledGuard('streams'))
  @Header('Cache-Control', PER_VIEWER)
  async streamRange(@Query() query: StreamRangeQueryDto, @Req() request: Request) {
    const viewer = viewerOf(request);
    const events = await this.streams.range(
      new Date(query.from),
      new Date(query.to),
      !viewer.isAdmin,
    );
    return { streams: events.map((event) => toStreamView(event, viewer)) };
  }

  /** `upcoming` is declared before `:id` so the literal wins. */
  @Get('streams/upcoming')
  @UseGuards(PageEnabledGuard('streams'))
  @Header('Cache-Control', PER_VIEWER)
  async streamUpcoming(@Req() request: Request) {
    const viewer = viewerOf(request);
    const events = await this.streams.upcoming(12, !viewer.isAdmin);
    return { streams: events.map((event) => toStreamView(event, viewer)) };
  }

  @Get('streams/:id')
  @UseGuards(PageEnabledGuard('streams'))
  @Header('Cache-Control', PER_VIEWER)
  async streamDetail(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) {
    const viewer = viewerOf(request);
    const event = await this.streams.getVisible(id, viewer.isAdmin);
    return { stream: toStreamView(event, viewer) };
  }

  // ---------- games ----------

  @Get('games')
  @UseGuards(PageEnabledGuard('games'))
  async gameList() {
    const [games, categories, counts] = await Promise.all([
      this.games.publicList(),
      this.categories.list(true),
      this.games.visibleCountsByCategory(),
    ]);
    return {
      games,
      // An empty collection is not offered as a filter.
      categories: categories
        .map((category) => ({
          slug: category.slug,
          name: category.name,
          description: category.description,
          gameCount: counts.get(category.id) ?? 0,
        }))
        .filter((category) => category.gameCount > 0),
    };
  }

  @Get('games/:slug')
  @UseGuards(PageEnabledGuard('games'))
  async gameDetail(@Param('slug') slug: string, @Req() request: Request) {
    const isAdmin = Boolean(request.user?.isAdmin);
    const detail = await this.games.publicDetail(slug, isAdmin);
    const reviews = await this.reviews.forGame(detail.game.id, !isAdmin);
    return {
      ...detail,
      reviews: reviews.map(({ id, title, body, isPublished, publishedAt }) => ({
        id,
        title,
        body,
        isPublished,
        publishedAt,
      })),
    };
  }

  @Get('categories/:slug')
  @UseGuards(PageEnabledGuard('games'))
  async categoryDetail(@Param('slug') slug: string, @Req() request: Request) {
    const category = await this.categories.findBySlug(slug, !request.user?.isAdmin);
    return {
      category: {
        slug: category.slug,
        name: category.name,
        description: category.description,
      },
      games: await this.games.publicList(category.id),
    };
  }

  @Get('favorites')
  @UseGuards(PageEnabledGuard('favorites'))
  async favorites() {
    return this.games.favorites();
  }
}
