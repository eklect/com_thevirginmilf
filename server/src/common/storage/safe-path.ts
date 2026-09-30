import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

/**
 * A path segment that is safe to join: a UUID, and nothing else.
 *
 * Every segment of an upload storage path is a server-generated id — the
 * firm, the evidence row, the attachment — so the pattern can be this strict.
 * That strictness is the actual traversal defence: `..`, `/`, `\`, a NUL byte
 * and an absolute path all fail the test before `path.join` ever sees them.
 */
const SAFE_SEGMENT = /^[0-9a-fA-F-]{36}$|^[0-9a-zA-Z_-]{1,64}$/;

/**
 * Joins segments beneath `root` and proves the result is still beneath it.
 *
 * Two checks, and the second is deliberately unreachable given the first.
 * That is the point: it stays correct when someone later adds a segment that
 * is not a UUID, which is exactly when the first check stops being sufficient.
 */
export function resolveWithin(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    if (!SAFE_SEGMENT.test(segment)) {
      throw new BadRequestException('Invalid storage path segment');
    }
  }

  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new BadRequestException('Resolved path escapes the storage root');
  }
  return resolved;
}

/**
 * The client's filename, made safe to STORE and to echo back in a header.
 *
 * It never becomes a path component — the on-disk name is a UUID — so this is
 * not a traversal defence. It exists because the value is round-tripped into a
 * `Content-Disposition`, where a CR or LF is header injection and a quote
 * truncates the parameter.
 */
export function sanitizeFilename(filename: string): string {
  const cleaned = (filename || 'upload')
    // C0 controls, DEL, quote, backslash, and both path separators.
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_')
    .trim();
  // 255 is the practical filesystem limit and comfortably under the column's
  // 500, leaving room for the multi-byte characters a UTF-8 name may carry.
  return (cleaned || 'upload').slice(0, 255);
}
