import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ObjectStorageService } from './object-storage.service';
import { parseRange } from './range';

export interface StreamObjectOptions {
  contentType: string;
  /** From the row; becomes the ETag. Falls back to the bucket's. */
  sha256?: string | null;
  cacheControl: string;
  /** e.g. `inline`, or `attachment; filename="…"`. */
  contentDisposition?: string;
  /** Add the raster-image CSP (`default-src 'none'; sandbox`). */
  sandbox?: boolean;
}

/**
 * Streams a PRIVATE object through this process with HTTP Range, ETag and
 * conditional requests — the one helper every authenticated byte route uses
 * (evidence, family media, deliverable downloads). The route has already
 * decided the caller may see the file; this moves the bytes.
 *
 * Public objects do not come through here: their routes answer a 302 to
 * `storage.publicUrl(key)` and the CDN does the work.
 *
 * `HEAD` is honoured (headers, no body). Multi-range requests are answered
 * whole, which is legal; no client in this space sends them.
 */
export async function streamObject(
  storage: ObjectStorageService,
  request: Request,
  response: Response,
  key: string,
  options: StreamObjectOptions,
): Promise<void> {
  const head = await storage.head(key);
  if (!head) {
    response.status(HttpStatus.NOT_FOUND).end();
    return;
  }
  const etag = options.sha256 ? `"${options.sha256}"` : head.etag;

  response
    .setHeader('Content-Type', options.contentType)
    .setHeader('Accept-Ranges', 'bytes')
    .setHeader('Cache-Control', options.cacheControl)
    .setHeader('X-Content-Type-Options', 'nosniff')
    .setHeader('Content-Disposition', options.contentDisposition ?? 'inline');
  if (etag) response.setHeader('ETag', etag);
  if (options.sandbox) response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

  if (etag && request.headers['if-none-match'] === etag) {
    response.status(HttpStatus.NOT_MODIFIED).end();
    return;
  }

  const size = head.byteSize;
  const parsed = parseRange(request.headers.range, size);
  if (parsed.kind === 'unsatisfiable') {
    response.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).setHeader('Content-Range', `bytes */${size}`).end();
    return;
  }

  if (parsed.kind === 'partial') {
    const { start, end } = parsed.range;
    response
      .status(HttpStatus.PARTIAL_CONTENT)
      .setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
      .setHeader('Content-Length', String(end - start + 1));
  } else {
    response.status(HttpStatus.OK).setHeader('Content-Length', String(size));
  }

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = await storage.getStream(key, parsed.kind === 'partial' ? parsed.range : undefined);
  if (!stream) {
    response.status(HttpStatus.NOT_FOUND).end();
    return;
  }
  stream.body.on('error', () => response.destroy());
  response.on('close', () => stream.body.destroy());
  stream.body.pipe(response);
}

/**
 * A public object's route: a cacheable redirect to the bucket (or the CDN in
 * production). The browser follows it once and keeps the target for a year.
 * A legacy key, still on disk, is streamed instead so nothing 404s during the
 * migration.
 */
export async function redirectOrStream(
  storage: ObjectStorageService,
  request: Request,
  response: Response,
  key: string,
  options: StreamObjectOptions,
): Promise<void> {
  if (key.startsWith('uploads/')) {
    response
      .status(HttpStatus.FOUND)
      .setHeader('Location', storage.publicUrl(key))
      .setHeader('Cache-Control', options.cacheControl)
      .end();
    return;
  }
  await streamObject(storage, request, response, key, options);
}
