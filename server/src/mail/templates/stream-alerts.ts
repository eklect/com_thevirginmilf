import { Brand, RenderedEmail, renderEmail } from './layout';

/**
 * What both stream alerts are built from. Plain values, resolved by the
 * caller — this file knows nothing about entities, settings or time zones.
 */
export interface StreamAlertArgs {
  streamerName: string;
  title: string;
  /** "Friday, October 3 at 7:00 PM EDT". */
  when: string;
  /** The channel names, in order — "Twitch", "YouTube". */
  channels: string[];
  gameTitle: string | null;
  /** The stream's page on this site. Signing in there shows the link. */
  eventUrl: string;
  /** The unsubscribe PAGE, for the footer link a person clicks. */
  unsubscribeUrl: string;
}

const where = (channels: string[]): string | null => {
  if (!channels.length) return null;
  if (channels.length === 1) return `Watch on ${channels[0]}.`;
  return `Watch on ${channels.slice(0, -1).join(', ')} or ${channels[channels.length - 1]}.`;
};

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
      ...(args.gameTitle ? [`Playing ${args.gameTitle}.`] : []),
      ...(where(args.channels) ? [where(args.channels)!] : []),
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
    paragraphs: [
      `${args.title} starts on ${args.when}.`,
      ...(args.gameTitle ? [`Playing ${args.gameTitle}.`] : []),
      ...(where(args.channels) ? [where(args.channels)!] : []),
    ],
    ...shared(args),
  });
}
