/**
 * The detail levels an outside calendar can get, as the server defines them
 * (`server/src/calendar-export/detail-level.ts`). The server applies the cap
 * whatever the client sends; these are labels and a remembered choice.
 */
export type DetailLevel = 'busy' | 'basic' | 'full';

export const LEVEL_INFO: Record<DetailLevel, { label: string; description: string }> = {
  busy: { label: 'Busy', description: 'The time only. It shows as "Busy".' },
  basic: { label: 'Title and time', description: 'The title and the time, nothing else.' },
  full: { label: 'Full details', description: 'Title, time, notes, location and a link back.' },
};

const ORDER: DetailLevel[] = ['busy', 'basic', 'full'];

/** The remembered choice, or the most the cap allows. Storage may be unavailable. */
export function rememberedLevel(storageKey: string, levels: DetailLevel[]): DetailLevel {
  const fallback = levels[levels.length - 1] ?? 'busy';
  try {
    const saved = localStorage.getItem(storageKey) as DetailLevel | null;
    return saved && levels.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function rememberLevel(storageKey: string, level: DetailLevel): void {
  try {
    localStorage.setItem(storageKey, level);
  } catch {
    // a private window — the choice just isn't kept
  }
}

export function sortLevels(levels: DetailLevel[]): DetailLevel[] {
  return ORDER.filter((level) => levels.includes(level));
}

export interface AddLinks {
  level: DetailLevel;
  google: string;
  outlook: string;
  office365: string;
}

export interface SubscribeLinks {
  url: string;
  webcal: string;
  google: string;
  outlook: string;
  office365: string;
}
