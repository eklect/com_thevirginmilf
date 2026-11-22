import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Repository } from 'typeorm';
import { ALLOWED_IMAGE_TYPES } from '../common/storage/image-sniff';
import type { UploadEntity } from './upload.entity';

/**
 * One page of the image library, newest first.
 *
 * The same file in every venture's backend, so the picker dialog in every
 * client talks to the same contract. It is self-contained on purpose: the
 * query DTO, the cursor and the search escape all live here, and a service
 * adds one short method that maps the rows it gets back.
 *
 * ## The cursor
 *
 * Opaque to the client: base64url over `{ c: epoch ms, id }` of the last row
 * handed out. `created_at` is `datetime(6)` in most schemas and the driver
 * reads it back to the millisecond, so the comparison treats one millisecond
 * as one instant and breaks the tie on `id`. Anything that does not parse
 * reads as "from the start" instead of an error.
 */
export const UPLOAD_PAGE_DEFAULT = 50;
export const UPLOAD_PAGE_MAX = 100;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListUploadsQueryDto {
  /** Matched anywhere in the original filename, literally. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(UPLOAD_PAGE_MAX)
  limit?: number;

  /** Comma-separated mime types, for a slot that takes fewer formats than the library holds. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;
}

/**
 * True when the caller asked for a page. A bare `GET` is the older contract,
 * every row at once, which the Images page still reads.
 */
export function isPagedUploadQuery(query: ListUploadsQueryDto): boolean {
  return (
    query.limit !== undefined ||
    query.cursor !== undefined ||
    query.q !== undefined ||
    query.type !== undefined
  );
}

export interface UploadRowPage {
  rows: UploadEntity[];
  nextCursor: string | null;
  hasMore: boolean;
  /** How many rows match the search and type filter, across every page. */
  total: number;
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: at.getTime(), id })).toString('base64url');
}

function decodeCursor(raw: string | undefined): { c: number; id: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { c, id } = parsed as { c?: unknown; id?: unknown };
    return typeof c === 'number' && Number.isFinite(c) && typeof id === 'string'
      ? { c, id }
      : null;
  } catch {
    return null;
  }
}

/** `%`, `_` and the escape character itself mean nothing special in a filename search. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The requested mime types that the library can actually hold; unknown ones are dropped. */
function wantedTypes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => ALLOWED_IMAGE_TYPES.has(part));
}

/**
 * @param scope Restricts the page to one `uploads.scope`, for a backend whose
 *   admin library lists only its public images.
 */
export async function pageUploads(
  repo: Repository<UploadEntity>,
  query: ListUploadsQueryDto,
  scope?: string,
): Promise<UploadRowPage> {
  const limit = Math.min(Math.max(query.limit ?? UPLOAD_PAGE_DEFAULT, 1), UPLOAD_PAGE_MAX);
  const cursor = decodeCursor(query.cursor);
  const types = wantedTypes(query.type);

  const qb = repo.createQueryBuilder('u');
  if (scope) qb.andWhere('u.scope = :scope', { scope });
  if (query.q) {
    qb.andWhere("u.original_filename LIKE :q ESCAPE '\\\\'", {
      q: `%${escapeLike(query.q)}%`,
    });
  }
  if (query.type !== undefined) {
    // A filter naming no type the library holds matches nothing, not everything.
    if (types.length === 0) qb.andWhere('1 = 0');
    else qb.andWhere('u.mime_type IN (:...types)', { types });
  }

  const total = await qb.getCount();

  if (cursor) {
    qb.andWhere(
      '(u.created_at < :from OR (u.created_at < :until AND u.id < :id))',
      { from: new Date(cursor.c), until: new Date(cursor.c + 1), id: cursor.id },
    );
  }
  const found = await qb
    .orderBy('u.createdAt', 'DESC')
    .addOrderBy('u.id', 'DESC')
    .take(limit + 1)
    .getMany();

  const hasMore = found.length > limit;
  const rows = found.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    hasMore,
    total,
  };
}
