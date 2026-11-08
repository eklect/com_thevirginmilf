/**
 * How much of an item may leave the site for somebody else's calendar.
 *
 * - `busy`  — the time only. The title is "Busy" and nothing else goes out.
 * - `basic` — the title and the time.
 * - `full`  — title, time, description, location and a link back here.
 *
 * Two parties decide it: an administrator sets the most that may leave (the
 * cap), and the person exporting picks at or below that. The server applies
 * `effectiveLevel` every time — on each one-off export and on every fetch of
 * a subscription feed — so lowering the cap reaches feeds that already exist.
 */
export const DETAIL_LEVELS = ['busy', 'basic', 'full'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

const RANK: Record<DetailLevel, number> = { busy: 0, basic: 1, full: 2 };

export function isDetailLevel(value: unknown): value is DetailLevel {
  return typeof value === 'string' && (DETAIL_LEVELS as readonly string[]).includes(value);
}

/** The lower of the two; an unknown or missing choice falls to the cap. */
export function effectiveLevel(cap: DetailLevel, chosen: unknown): DetailLevel {
  if (!isDetailLevel(chosen)) return cap;
  return RANK[chosen] <= RANK[cap] ? chosen : cap;
}

/** The levels a person may pick under a cap, lowest first — what the client offers. */
export function levelsUnder(cap: DetailLevel): DetailLevel[] {
  return DETAIL_LEVELS.filter((level) => RANK[level] <= RANK[cap]);
}

/**
 * One dated item, in the shape every exporter writes. Each venture builds it
 * from the view it already shows the viewer — never from a raw row — so a
 * field the viewer may not see here can never reach their calendar.
 */
export interface ExportItem {
  /** Stable across exports, so a re-import or a feed refresh updates in place. */
  uid: string;
  title: string;
  /** An ISO instant, or `YYYY-MM-DD` when `allDay`. */
  start: string;
  /**
   * An ISO instant, or — when `allDay` — the day AFTER the last day
   * (exclusive), which is what both ICS and Google expect. Mappers convert.
   */
  end: string;
  allDay: boolean;
  /** Plain text. Run Markdown through `markdownToText` first. */
  description?: string | null;
  location?: string | null;
  /** An absolute link back to the item on the site. */
  url?: string | null;
  cancelled?: boolean;
  updatedAt?: Date | null;
}

/** The item as it may leave at `level`. Times always go; everything else is earned. */
export function redact(item: ExportItem, level: DetailLevel): ExportItem & { private: boolean } {
  const base = {
    uid: item.uid,
    start: item.start,
    end: item.end,
    allDay: item.allDay,
    cancelled: item.cancelled ?? false,
    updatedAt: item.updatedAt ?? null,
  };
  if (level === 'busy') return { ...base, title: 'Busy', private: true };
  if (level === 'basic') return { ...base, title: item.title, private: false };
  return {
    ...base,
    title: item.title,
    description: item.description?.trim() || null,
    location: item.location?.trim() || null,
    url: item.url ?? null,
    private: false,
  };
}

/**
 * Markdown source as readable plain text, for a calendar's notes field.
 * Links keep their address, images keep their alt text, and the marks that
 * only mean something to a renderer go.
 */
export function markdownToText(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => (label === url ? url : `${label} (${url})`))
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
