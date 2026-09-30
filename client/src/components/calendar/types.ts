import type { DateTime } from 'luxon';

/**
 * The shared calendar's contract. A caller maps its own records into
 * `CalendarEvent` and reads `meta` back on `select`; nothing in
 * `components/calendar/` knows what a stream is.
 *
 * This folder is a copy of `com_mycotools_app/client/src/components/calendar/`
 * — the estate's month/week/day calendar — with two differences, both in
 * `CalendarEntry.vue` and the view shells: an entry with an `end` prints its
 * time range, and the frames use this site's hard black rule instead of the
 * hairline. The state and arithmetic in `useCalendar.ts` are untouched, so a
 * fix there is a straight copy in either direction.
 */
export type CalendarView = 'month' | 'week' | 'day';

/** A colour intent, resolved against the app's theme tokens by `CalendarEntry`. */
export type CalendarTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'pending';

export interface CalendarEvent {
  id: string;
  /** ISO-8601, any zone; rendered in the viewer's. */
  start: string;
  end?: string;
  title: string;
  subtitle?: string;
  tone?: CalendarTone;
  /** Whatever the tool wants back when the entry is selected. */
  meta?: unknown;
}

export interface CalendarRange {
  from: DateTime;
  to: DateTime;
}

/** 1 = Monday (ISO), 7 = Sunday. */
export type WeekStart = 1 | 7;
