import type { ExportItem } from './detail-level';
import { utcStamp } from './ics';

/**
 * The one-click "add" links. Built on the server from an item that is
 * already redacted, so a link never carries more than its level allows —
 * and whatever is in it goes to Google or Microsoft in the URL itself.
 */

export interface AddLinks {
  google: string;
  outlook: string;
  office365: string;
}

/** Calendar URLs have limits; a long description is cut rather than refused. */
const DESCRIPTION_MAX = 1500;

export function addLinks(item: ExportItem): AddLinks {
  const details = clip(item.description ?? '', item.url ?? null);
  const google = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates: googleDates(item) });
  if (details) google.set('details', details);
  if (item.location) google.set('location', item.location);

  const outlook = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: item.title,
    startdt: item.allDay ? item.start.slice(0, 10) : new Date(item.start).toISOString(),
    enddt: item.allDay ? item.end.slice(0, 10) : new Date(item.end).toISOString(),
    allday: item.allDay ? 'true' : 'false',
  });
  if (details) outlook.set('body', details);
  if (item.location) outlook.set('location', item.location);
  const query = outlook.toString();

  return {
    google: `https://calendar.google.com/calendar/render?${google.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?${query}`,
    office365: `https://outlook.office.com/calendar/0/action/compose?${query}`,
  };
}

export interface SubscribeLinks {
  /** The feed itself, https. */
  url: string;
  /** The same address on `webcal:` — Apple Calendar and Outlook desktop open it as a subscription. */
  webcal: string;
  google: string;
  outlook: string;
  office365: string;
}

export function subscribeLinks(feedUrl: string, name: string): SubscribeLinks {
  const webcal = feedUrl.replace(/^https?:/, 'webcal:');
  const outlook = new URLSearchParams({ url: feedUrl, name });
  return {
    url: feedUrl,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?${outlook.toString()}`,
    office365: `https://outlook.office.com/calendar/0/addfromweb?${outlook.toString()}`,
  };
}

function googleDates(item: ExportItem): string {
  if (item.allDay) return `${item.start.slice(0, 10).replace(/-/g, '')}/${item.end.slice(0, 10).replace(/-/g, '')}`;
  return `${utcStamp(new Date(item.start))}/${utcStamp(new Date(item.end))}`;
}

function clip(description: string, url: string | null): string {
  const text = description.length > DESCRIPTION_MAX ? `${description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : description;
  return [text, url].filter(Boolean).join('\n\n');
}
