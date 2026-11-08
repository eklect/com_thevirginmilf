import { createHash } from 'node:crypto';
import type { ExportItem } from './detail-level';

/**
 * A small RFC 5545 writer — enough for one-off downloads and subscription
 * feeds, with no dependency. Every item arrives already redacted to its
 * detail level; this file only formats.
 */

export interface IcsCalendar {
  /** `-//Mucci & Co//<product>//EN`. */
  prodId: string;
  /** The calendar's name in the subscriber's list. */
  name?: string;
  /** Set on a subscription feed: how often a client should re-read it. */
  refresh?: boolean;
  items: Array<ExportItem & { private?: boolean }>;
  now?: Date;
}

const CRLF = '\r\n';

export function buildIcs(calendar: IcsCalendar): string {
  const now = calendar.now ?? new Date();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${calendar.prodId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (calendar.name) lines.push(`X-WR-CALNAME:${escapeText(calendar.name)}`);
  if (calendar.refresh) lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const item of calendar.items) lines.push(...eventLines(item, now));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

function eventLines(item: ExportItem & { private?: boolean }, now: Date): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${escapeText(item.uid)}`, `DTSTAMP:${utcStamp(now)}`];
  if (item.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(item.start)}`, `DTEND;VALUE=DATE:${compactDate(item.end)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(new Date(item.start))}`, `DTEND:${utcStamp(new Date(item.end))}`);
  }
  lines.push(`SUMMARY:${escapeText(item.title)}`);
  if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (item.url) lines.push(`URL:${item.url}`);
  if (item.updatedAt) {
    lines.push(`LAST-MODIFIED:${utcStamp(item.updatedAt)}`, `SEQUENCE:${sequenceOf(item.updatedAt)}`);
  }
  lines.push(`STATUS:${item.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE');
  if (item.private) lines.push('CLASS:PRIVATE');
  lines.push('END:VEVENT');
  return lines;
}

/** TEXT escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next line after one space, never splitting a character. */
export function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // the leading space counts
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function compactDate(value: string): string {
  return value.slice(0, 10).replace(/-/g, '');
}

/** Minutes since 2020 — rises with every edit, fits in an int, so a re-import replaces the older copy. */
function sequenceOf(updatedAt: Date): number {
  return Math.max(0, Math.floor((updatedAt.getTime() - Date.UTC(2020, 0, 1)) / 60_000));
}

/** A filename for `Content-Disposition`, from a title. */
export function icsFilename(title: string): string {
  const stem = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return `${stem || 'event'}.ics`;
}

/**
 * A stable UID that says nothing about the item: the same key gives the same
 * UID on every export, so a re-import or a feed refresh updates in place, but
 * a "Busy" entry does not reveal that it is a birthday or a court date.
 */
export function opaqueUid(key: string, host: string): string {
  return `${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 32)}@${host}`;
}
