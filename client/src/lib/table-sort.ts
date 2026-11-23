/**
 * Ordering for admin tables. Imports nothing, so the same file is copied into
 * every client.
 *
 * A column is sorted by its underlying value (a date by its instant, money by
 * its number, a status by a rank the view supplies), never by the string drawn.
 */

export type SortDir = 'asc' | 'desc';

/** Every value a column accessor may hand back. */
export type SortValue = string | number | boolean | Date | null | undefined;

/** Off → ascending → descending → off, so the list's own order stays reachable. */
export function nextDir(dir: SortDir | null): SortDir | null {
  return dir === null ? 'asc' : dir === 'asc' ? 'desc' : null;
}

/** `2026-11-23` or `2026-11-23T10:00:00Z` — what our APIs send for dates. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function toNumber(value: SortValue): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 0 : 1; // true first when ascending
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/**
 * One collator for every comparison: `localeCompare` with options builds a new
 * one per call, which is slow on a list of thousands. Locale-aware rather than
 * `<`, which would put every capital ahead of every lowercase letter;
 * `numeric` puts "Episode 9" before "Episode 10".
 */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Ascending comparison of two present values. */
export function compareValues(a: SortValue, b: SortValue): number {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return collator.compare(String(a), String(b));
}

/**
 * A stable sort of `rows` by one accessor. Empty values go last in BOTH
 * directions — a column of blanks is never the first thing a reader sees.
 */
export function sortRows<T>(rows: readonly T[], accessor: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((x, y) => {
      const ex = isEmpty(x.value);
      const ey = isEmpty(y.value);
      if (ex || ey) return ex === ey ? x.index - y.index : ex ? 1 : -1;
      return sign * compareValues(x.value, y.value) || x.index - y.index;
    })
    .map((entry) => entry.row);
}
