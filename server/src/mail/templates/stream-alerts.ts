import { Brand, RenderedEmail, renderEmail } from './layout';

/**
 * What both stream alerts are built from: the same plain strings the editable
 * `live/stream_*` files are given, resolved by the caller — this file knows
 * nothing about entities, settings or time zones.
 */
export interface StreamAlertArgs {
  streamerName: string;
  title: string;
  /** "Friday, October 3 at 7:00 PM EDT". */
  when: string;
  /** "Playing Hades II." — empty when the stream has no visible game. */
  gameLine: string;
  /** "Watch on Twitch or YouTube." — empty when no channel is published. */
  whereLine: string;
  /** The stream's page on this site. Signing in there shows the link. */
  eventUrl: string;
  /** The unsubscribe PAGE, for the footer link a person clicks. */
  unsubscribeUrl: string;
}

/** The "Playing …" sentence, or '' for a stream with no visible game. */
export function gameLine(gameTitle: string | null): string {
  return gameTitle ? `Playing ${gameTitle}.` : '';
}

/** The "Watch on …" sentence over the channel names in order, or ''. */
export function whereLine(channels: string[]): string {
  if (!channels.length) return '';
  if (channels.length === 1) return `Watch on ${channels[0]}.`;
  return `Watch on ${channels.slice(0, -1).join(', ')} or ${channels[channels.length - 1]}.`;
}

/**
 * An empty line is left out here. The editable file draws its paragraph
 * whatever the value, so a file-rendered alert for a stream with no game shows
 * an empty paragraph where this one shows none.
 */
const optional = (...lines: string[]) => lines.filter((line) => line);

const shared = (args: StreamAlertArgs) => ({
  cta: { label: 'Get the stream link', url: args.eventUrl },
  notes: ['You are getting this because you asked to hear about streams.'],
  footerLink: { label: 'Unsubscribe', url: args.unsubscribeUrl },
});

/** Sent once, when a stream is published to the calendar. */
export function streamAnnouncedEmail(brand: Brand, args: StreamAlertArgs): RenderedEmail {
  return renderEmail(brand, {
    subject: `New stream: ${args.title}`,
    preheader: args.when,
    heading: args.title,
    paragraphs: [
      `${args.streamerName} is going live on ${args.when}.`,
      ...optional(args.gameLine, args.whereLine),
    ],
    ...shared(args),
  });
}

/** Sent shortly before the stream starts. `lead` reads "in 30 minutes". */
export function streamReminderEmail(
  brand: Brand,
  args: StreamAlertArgs & { lead: string },
): RenderedEmail {
  return renderEmail(brand, {
    subject: `Going live ${args.lead}: ${args.title}`,
    preheader: args.when,
    heading: `Going live ${args.lead}`,
    paragraphs: [`${args.title} starts on ${args.when}.`, ...optional(args.gameLine, args.whereLine)],
    ...shared(args),
  });
}
