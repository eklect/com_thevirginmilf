/**
 * The one HTTP `Range` header form that matters here: `bytes=<start>-<end>`.
 *
 * A network fetching a video by URL, and the `<video>` preview in the
 * composer, both seek by byte range. Ported from `com_shapedpodcast`.
 * Multi-range requests are deliberately unsupported — ignoring the header is
 * a legal response, and no client in this space sends them.
 */
export interface ByteRange {
  /** Inclusive, as HTTP means it. */
  start: number;
  /** Inclusive, as HTTP means it. */
  end: number;
}

export type RangeResult =
  | { kind: 'full' }
  | { kind: 'partial'; range: ByteRange }
  | { kind: 'unsatisfiable' };

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'full' };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: 'full' };

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return { kind: 'full' };

  let start: number;
  let end: number;

  if (rawStart === '') {
    // `bytes=-500` — the LAST 500 bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return { kind: 'full' };
  if (start >= size || start < 0) return { kind: 'unsatisfiable' };
  if (end >= size) end = size - 1;
  if (end < start) return { kind: 'unsatisfiable' };

  return { kind: 'partial', range: { start, end } };
}
