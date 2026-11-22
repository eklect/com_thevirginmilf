/**
 * Unsaved writing, kept in this browser until it is saved for real.
 *
 * The same file in every Mucci & Co client. It imports nothing, so it drops
 * into the hand-written-CSS clients and into modules that may not import the
 * API layer. The Vue half is `composables/useDraft.ts`.
 *
 * ## What is stored
 *
 * One entry per form or composer, under `draft:1:<owner>:<scope>`:
 *
 * - `owner` is the signed-in person's MAP id, or `anon` when nobody is signed
 *   in. A draft is only ever read back by the person who wrote it.
 * - `scope` is the caller's name for the thing being written, e.g.
 *   `post:new`, `post:<id>`, `post:<id>:comment:new`.
 * - The value is a `DraftEnvelope`: the text of each field, when it was
 *   written, and a hash of the saved values the writing started from, so a
 *   draft is never laid over a record that has changed since.
 *
 * ## When it goes away
 *
 * On a successful save (the caller's `clear()`), when the person discards it,
 * when they sign out (`clearDraftsFor`), and after seven days (`sweepDrafts`,
 * run once at start-up).
 *
 * ## Storage that is not there
 *
 * Private windows, blocked site data and a full quota all make `localStorage`
 * throw. Every access is wrapped: a draft that cannot be written is skipped
 * without a word, because the form itself still works.
 */

export interface DraftBackend {
  get(key: string): string | null;
  /** False when the value could not be stored. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** Every key this backend holds, drafts or not. */
  keys(): string[];
}

export interface DraftEnvelope {
  v: 1;
  /** Epoch ms of the last write. */
  at: number;
  /** `hashFields` of the saved values this draft was started from. */
  base: string;
  fields: Record<string, string>;
}

const PREFIX = 'draft:1:';
const ANON = 'anon';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A body past this is not worth a slice of a 5 MB quota shared by the whole site. */
const MAX_CHARS = 1_000_000;

const localBackend: DraftBackend = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove from storage that cannot be reached.
    }
  },
  keys() {
    try {
      const found: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key !== null) found.push(key);
      }
      return found;
    } catch {
      return [];
    }
  },
};

let backend: DraftBackend = localBackend;
let ttlMs = 7 * DAY_MS;
let owner = ANON;
let readOnly = false;

/** For a client whose storage goes through its own gate, or wants another lifetime. */
export function configureDrafts(options: { backend?: DraftBackend; ttlMs?: number }): void {
  if (options.backend) backend = options.backend;
  if (options.ttlMs !== undefined) ttlMs = options.ttlMs;
}

/**
 * Whose drafts these are from now on. Call it whenever the session is
 * resolved. `readOnly` turns drafts off entirely, for a session that is
 * looking at somebody else's account and must leave nothing behind.
 */
export function setDraftOwner(id: string | null, options: { readOnly?: boolean } = {}): void {
  owner = id || ANON;
  readOnly = options.readOnly === true;
}

function keyFor(scope: string): string {
  return `${PREFIX}${owner}:${scope}`;
}

function parse(raw: string | null): DraftEnvelope | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DraftEnvelope> | null;
    if (
      !value ||
      value.v !== 1 ||
      typeof value.at !== 'number' ||
      typeof value.base !== 'string' ||
      typeof value.fields !== 'object' ||
      value.fields === null
    ) {
      return null;
    }
    for (const text of Object.values(value.fields)) {
      if (typeof text !== 'string') return null;
    }
    return value as DraftEnvelope;
  } catch {
    return null;
  }
}

export function readDraft(scope: string): DraftEnvelope | null {
  if (readOnly) return null;
  const key = keyFor(scope);
  const envelope = parse(backend.get(key));
  if (!envelope) return null;
  if (Date.now() - envelope.at > ttlMs) {
    backend.remove(key);
    return null;
  }
  return envelope;
}

/** False when nothing was stored: drafts are off, the text is too long, or storage refused. */
export function writeDraft(scope: string, fields: Record<string, string>, base: string): boolean {
  if (readOnly) return false;
  let size = 0;
  for (const text of Object.values(fields)) size += text.length;
  if (size > MAX_CHARS) return false;

  const key = keyFor(scope);
  const value = JSON.stringify({ v: 1, at: Date.now(), base, fields } satisfies DraftEnvelope);
  if (backend.set(key, value)) return true;
  // Most likely a full quota. Expired drafts are the only thing here that is
  // ours to throw away, so make that room and try once more.
  sweepDrafts();
  return backend.set(key, value);
}

export function removeDraft(scope: string): void {
  if (readOnly) return;
  backend.remove(keyFor(scope));
}

/** Sign-out: every draft this person wrote in this browser. */
export function clearDraftsFor(ownerId: string | null): void {
  const prefix = `${PREFIX}${ownerId || ANON}:`;
  for (const key of backend.keys()) {
    if (key.startsWith(prefix)) backend.remove(key);
  }
}

/** Start-up: drop every draft past its lifetime, and anything unreadable. */
export function sweepDrafts(now: number = Date.now()): void {
  for (const key of backend.keys()) {
    if (!key.startsWith(PREFIX)) continue;
    const envelope = parse(backend.get(key));
    if (!envelope || now - envelope.at > ttlMs) backend.remove(key);
  }
}

/** FNV-1a, with the length alongside. A change detector, not a secret. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}.${text.length}`;
}

/** One hash over a set of fields, the same whatever order they were listed in. */
export function hashFields(fields: Record<string, string>): string {
  return hashText(
    Object.keys(fields)
      .sort()
      .map((name) => `${name}\u0000${fields[name]}`)
      .join('\u0001'),
  );
}

/** "just now", "3 minutes ago", "2 hours ago", "4 days ago". */
export function draftAge(at: number, now: number = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
