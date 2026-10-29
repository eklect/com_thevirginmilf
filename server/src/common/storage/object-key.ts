/**
 * The ONE place an object key is composed.
 *
 * Every uploaded file in the estate lives in one S3 bucket (DigitalOcean
 * Spaces in production, the dev box's RustFS locally), laid out so a person
 * browsing the bucket with no UI can find any file:
 *
 *   uploads/<tenant>/<map_sub>/<venture>/<app>/<module>/<action>/<stem>--<row-id>.<ext>
 *   uploads/<map_sub>/<venture>/<app>/<module>/<action>/<stem>--<row-id>.<ext>
 *
 * The tenant comes first when the row has one (a firm, a family, an account,
 * a sponsor), kind-prefixed so a top-level listing tells a firm from a person;
 * then the MAP `sub` of whoever uploaded it, or the literal `system` for a
 * machine (a Steam sync, a migration of rows with no uploader); then the brand
 * and the repo; then the Nest module and what the file IS; then a filename a
 * human can read, tied to its row by the uuid.
 *
 * `VENTURE` and `APP` are constants and not env on purpose: two deployments
 * of one repo must never disagree about where they file things, and a wrong
 * value here would mis-file every object silently.
 *
 * Nothing in this file touches the network or the filesystem; it is pure and
 * unit-tested. The same `fileStem` rule is implemented in
 * `muccico_devops/.../storage_recipes.py` for the migration; the fixture file
 * `object-key.fixture.json` is what keeps the two honest.
 */

export const VENTURE = 'thevirginmilf';
export const APP = 'com_thevirginmilf';

/** Every durable object sits under this prefix; a key that does not is a legacy disk path. */
export const UPLOADS_PREFIX = 'uploads';
/** In-flight uploads land here and are promoted; the bucket's lifecycle rule expires leftovers in a day. */
export const STAGING_PREFIX = 'staging';
/** The actor segment for a file no person uploaded. */
export const SYSTEM_ACTOR = 'system';

export type TenantKind = 'firm' | 'family' | 'account' | 'sponsor';

export interface KeyParts {
  /** The row's tenant, when the app has one. Omitted for an untenanted app. */
  tenant?: { kind: TenantKind; id: string };
  /** MAP `sub`, or `SYSTEM_ACTOR`. */
  actor: string;
  /** The Nest module folder, e.g. `evidence`, `social`, `uploads`. `[a-z0-9-]`. */
  module: string;
  /** What the file is, e.g. `attachment`, `media`, `image`, `avatar`. `[a-z0-9-]`. */
  action: string;
  /** The row's uuid — the one thing that ties the object back to the database. */
  id: string;
  /** The client's filename, for the readable stem. May be null. */
  originalName: string | null;
  /** With the dot, from the SNIFFER — never the client's claim. `''` for none. */
  extension: string;
}

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR = /^[A-Za-z0-9_-]{1,64}$/;
const EXTENSION = /^\.[a-z0-9]{1,8}$/;
/** What a stored key may contain, character by character. */
const KEY_CHARS = /^[A-Za-z0-9._\-/]+$/;
/** Matches the `storage_key` columns, widened to this in every backend. */
export const MAX_KEY_LENGTH = 512;
const MAX_STEM = 80;

function requireSegment(value: string, what: string): string {
  if (!SEGMENT.test(value)) {
    throw new Error(`Object key ${what} '${value}' must match ${SEGMENT}`);
  }
  return value;
}

/**
 * A readable filename stem from the client's name.
 *
 * The rule, in order (the Python migration tool implements the same list):
 *   1. drop one trailing extension (`.PDF`, `.tar` — up to 8 alphanumerics)
 *   2. Unicode NFKD, then strip combining marks (é → e)
 *   3. lowercase
 *   4. every run of anything outside [a-z0-9] becomes one `-`
 *   5. trim `-` from both ends, cut to 80 characters, trim again
 *   6. empty → `fallback` (the action name, so the file still reads as something)
 */
export function fileStem(originalName: string | null | undefined, fallback: string): string {
  const raw = (originalName ?? '').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const ascii = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let stem = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (stem.length > MAX_STEM) stem = stem.slice(0, MAX_STEM).replace(/-+$/g, '');
  return stem || fallback;
}

/** The tenant segment: `firm-<uuid>`, `account-<uuid>`, … */
export function tenantSegment(kind: TenantKind, id: string): string {
  if (!UUID.test(id) && !ACTOR.test(id)) throw new Error(`Tenant id '${id}' is not a safe key segment`);
  return `${kind}-${id.toLowerCase()}`;
}

/** The object key for a stored file. Throws on anything that would not file correctly. */
export function buildObjectKey(parts: KeyParts): string {
  const actor = parts.actor === SYSTEM_ACTOR ? SYSTEM_ACTOR : parts.actor;
  if (!ACTOR.test(actor)) throw new Error(`Object key actor '${actor}' is not a safe segment`);
  if (!UUID.test(parts.id)) throw new Error(`Object key id '${parts.id}' is not a uuid`);
  if (parts.extension !== '' && !EXTENSION.test(parts.extension)) {
    throw new Error(`Object key extension '${parts.extension}' must be like '.pdf'`);
  }
  const action = requireSegment(parts.action, 'action');
  const segments = [UPLOADS_PREFIX];
  if (parts.tenant) segments.push(tenantSegment(parts.tenant.kind, parts.tenant.id));
  segments.push(
    actor,
    requireSegment(VENTURE, 'venture'),
    APP,
    requireSegment(parts.module, 'module'),
    action,
    `${fileStem(parts.originalName, action)}--${parts.id.toLowerCase()}${parts.extension}`,
  );
  const key = segments.join('/');
  assertObjectKey(key);
  return key;
}

/** Where an in-flight upload lands before its row exists: `staging/<app>/<id><ext>`. */
export function buildStagingKey(id: string, extension: string): string {
  if (!UUID.test(id)) throw new Error(`Staging id '${id}' is not a uuid`);
  if (extension !== '' && !EXTENSION.test(extension)) {
    throw new Error(`Staging extension '${extension}' must be like '.mp4'`);
  }
  return `${STAGING_PREFIX}/${APP}/${id.toLowerCase()}${extension}`;
}

/**
 * The point where a value from the database becomes a request to the bucket.
 *
 * The key was written by this server, so in principle it is trustworthy. It is
 * still re-checked — "it came from our own database" has been the premise of
 * a great many traversals — and the check is the same whether the key is
 * about to be fetched, copied, deleted or turned into a public URL.
 */
export function assertObjectKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0) throw new Error('Empty object key');
  if (key.length > MAX_KEY_LENGTH) throw new Error(`Object key longer than ${MAX_KEY_LENGTH}: '${key.slice(0, 40)}…'`);
  if (!KEY_CHARS.test(key)) throw new Error(`Object key '${key}' has characters outside [A-Za-z0-9._-/]`);
  if (!key.startsWith(`${UPLOADS_PREFIX}/`) && !key.startsWith(`${STAGING_PREFIX}/`)) {
    throw new Error(`Object key '${key}' is outside '${UPLOADS_PREFIX}/' and '${STAGING_PREFIX}/'`);
  }
  const segments = key.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`Object key '${key}' has an empty or dot segment`);
    }
  }
}

/**
 * A key written before the move to the bucket: a path relative to the old
 * `STORAGE_ROOT` (`images/<uuid>.png`, `media/<account>/<uuid>.mp4`). Served
 * from `LEGACY_STORAGE_ROOT` until `storage_migrate.py` has rewritten the row.
 */
export function isLegacyKey(key: string): boolean {
  return !key.startsWith(`${UPLOADS_PREFIX}/`) && !key.startsWith(`${STAGING_PREFIX}/`);
}
