/**
 * Calendar-day arithmetic without a date library, for the backends that do
 * not carry one.
 */

/** The calendar day `date` falls on in `zone`, as `YYYY-MM-DD`. */
export function dayInZone(date: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * An all-day entry stored as instants (midnight to midnight, in whichever
 * zone the browser that saved it was in) as the days it covers in `zone`.
 * Each end is nudged to the middle of its day before reading the date, so
 * an entry saved a few hours east or west still lands on the right days.
 * `end` comes back exclusive, as ICS wants.
 */
export function allDaySpan(startsAt: Date, endsAt: Date | null, zone: string): { start: string; end: string } {
  const HALF_DAY = 12 * 3_600_000;
  const start = dayInZone(new Date(startsAt.getTime() + HALF_DAY), zone);
  const end = endsAt ? dayInZone(new Date(endsAt.getTime() + HALF_DAY), zone) : addDays(start, 1);
  return { start, end: end > start ? end : addDays(start, 1) };
}

/** A timed entry's end, defaulting to `minutes` after the start; never before it. */
export function timedEnd(startsAt: Date, endsAt: Date | null, minutes: number): Date {
  const end = endsAt ?? new Date(startsAt.getTime() + minutes * 60_000);
  return end < startsAt ? startsAt : end;
}
