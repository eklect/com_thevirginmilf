import type { ChannelPlatform } from '../channels/channel.entity';
import { gameCoverUrl, gameTitle } from '../games/games.serializer';
import { StreamEventEntity } from './stream-event.entity';

export interface StreamChannelView {
  id: string;
  name: string;
  platform: ChannelPlatform;
  /**
   * Where to watch. ABSENT — not null, not empty — for an anonymous caller;
   * see `toStreamView`.
   */
  url?: string;
}

export interface StreamView {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isPublished: boolean;
  game: { slug: string; title: string; coverUrl: string | null } | null;
  channels: StreamChannelView[];
  /** True when the links were withheld because nobody is signed in. */
  linksLocked: boolean;
}

export interface StreamViewer {
  signedIn: boolean;
  isAdmin: boolean;
}

/**
 * The one place a stream becomes JSON for the public plane.
 *
 * ## The sign-in gate lives here, on the server
 *
 * "Sign in to get the link" is only true if an anonymous response does not
 * contain the link. So for a caller with no session the `url` key is never
 * written at all — there is nothing for the client to hide, and nothing in
 * the network tab to find. Every public route returns through this function
 * rather than returning the entity, which carries both the channel's URL and
 * the per-stream override.
 *
 * It is a nudge to sign up, not a secret: her Twitch channel is on the Links
 * page for everybody. What the gate withholds is *this* stream's link.
 *
 * A hidden game and an unpublished channel are dropped for everyone but an
 * admin — each is hidden everywhere, not everywhere except the calendar.
 */
export function toStreamView(event: StreamEventEntity, viewer: StreamViewer): StreamView {
  const links = [...(event.channelLinks ?? [])]
    .filter((link) => link.channel && (viewer.isAdmin || link.channel.isPublished))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const game =
    event.game && (viewer.isAdmin || !event.game.isHidden)
      ? {
          slug: event.game.slug,
          title: gameTitle(event.game),
          coverUrl: gameCoverUrl(event.game),
        }
      : null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    isPublished: event.isPublished,
    game,
    channels: links.map((link) => ({
      id: link.channelId,
      name: link.channel!.name,
      platform: link.channel!.platform,
      ...(viewer.signedIn ? { url: link.urlOverride ?? link.channel!.url } : {}),
    })),
    linksLocked: !viewer.signedIn,
  };
}

/** The admin's view: everything, including the alert scheduler's two stamps. */
export interface AdminStreamView extends StreamView {
  notify: boolean;
  gameId: string | null;
  announcedAt: Date | null;
  remindedStartAt: Date | null;
  channelLinks: { channelId: string; urlOverride: string | null }[];
}

export function toAdminStreamView(event: StreamEventEntity): AdminStreamView {
  const links = [...(event.channelLinks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    ...toStreamView(event, { signedIn: true, isAdmin: true }),
    notify: event.notify,
    gameId: event.gameId,
    announcedAt: event.announcedAt,
    remindedStartAt: event.remindedStartAt,
    channelLinks: links.map((link) => ({
      channelId: link.channelId,
      urlOverride: link.urlOverride,
    })),
  };
}
