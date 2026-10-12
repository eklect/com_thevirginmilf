/**
 * Typed date and time entry, for `components/date/`.
 *
 * Those components replace `<input type="date|time|datetime-local">`, which
 * on a phone opens no keyboard and, in several of our layouts, no picker
 * either. The models they speak are the same strings the native inputs did:
 * `YYYY-MM-DD`, `HH:mm` and `YYYY-MM-DDTHH:mm` — so no caller's code changes
 * beyond the tag. What the person sees and types is US style: 10/11/2026,
 * 7:30 PM.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for a year, month (1–12) and day; no validation. */
export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** Parts of a real calendar date in `YYYY-MM-DD`, or null. */
export function parseIsoDate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Today in the browser's zone, as `YYYY-MM-DD`. */
export function todayIso(): string {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** `2026-10-11` → `10/11/2026`; anything unparseable → ''. */
export function isoToDisplay(value: string | null | undefined): string {
  const parts = parseIsoDate(value);
  return parts ? `${pad(parts.month)}/${pad(parts.day)}/${String(parts.year).padStart(4, '0')}` : '';
}

/**
 * What the person typed, re-formatted as they type: digits only, slashes
 * added for them (a phone's number pad has no `/`). A slash they typed
 * themselves after one digit pads it, so `1/5/2026` reads as `01/05/2026`.
 * `inserting` is false on a delete, so backspacing over a slash is not undone.
 */
export function formatTypedDate(raw: string, inserting: boolean): string {
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(raw);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const parts = raw.split('/').map((p) => p.replace(/\D/g, ''));
  let digits = parts[0];
  if (parts.length > 1) {
    const month = parts[0].length === 1 ? `0${parts[0]}` : parts[0].slice(0, 2);
    if (parts.length > 2) {
      const day = parts[1].length === 1 ? `0${parts[1]}` : parts[1].slice(0, 2);
      digits = month + day + parts.slice(2).join('');
    } else {
      digits = month + parts[1];
    }
  }
  digits = digits.slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `/${digits.slice(4)}`;
  if (inserting && (digits.length === 2 || digits.length === 4)) out += '/';
  return out;
}

/** `10/11/2026` → `2026-10-11`; null unless it is a complete, real date. */
export function displayToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = isoDate(Number(match[3]), Number(match[1]), Number(match[2]));
  return parseIsoDate(iso) ? iso : null;
}

/** `09:30` / `21:30` → `9:30 AM` / `9:30 PM`; anything else → ''. */
export function timeToDisplay(value: string | null | undefined): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * A typed time as `HH:mm`, or null. Takes what people actually type:
 * `7pm`, `7:30 pm`, `730p`, `19:30`, `1930`. With no AM/PM it is read as a
 * 24-hour clock, and the field shows the result back as `7:00 AM` on blur,
 * so a surprise is visible before anything is saved.
 */
export function parseTypedTime(text: string): string | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])\.?\s*(?:m\.?)?$/i.exec(text.trim())
    ?? /^(\d{1,2})(?::?(\d{2}))?()$/.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (minute > 59) return null;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}
