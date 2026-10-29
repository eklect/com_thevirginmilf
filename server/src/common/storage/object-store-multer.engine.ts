import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { randomUUID } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { buildStagingKey } from './object-key';
import { ObjectStorageService } from './object-storage.service';

/**
 * What a route receives on `req.file` from this engine: the object is already
 * in the bucket under `stagingKey`; the service builds the final key from the
 * row id and calls `promote`. `head` is the leading bytes, so a service that
 * decides the type late (Inventory's image-or-delivery-file) can still sniff.
 */
export interface StagedUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  /** What the CLIENT declared. Evidence of nothing; see `mimeType`. */
  mimetype: string;
  /** What the sniffer decided, or the tidied declared type when no sniffer ran. */
  mimeType: string;
  /** From the sniffer (with the dot), or from the filename when no sniffer ran. */
  extension: string;
  stagingKey: string;
  /** Counted as the bytes went by, never the request's claim. */
  size: number;
  sha256: string;
  /** The first `sniffBytes` of the file. */
  head: Buffer;
}

/** Decides the stored type from the leading bytes; `null` refuses the upload before a byte is sent. */
export type UploadSniffer = (
  head: Buffer,
  declared: string | undefined,
  originalName: string,
) => { mimeType: string; extension: string } | null;

export interface ObjectStoreEngineOptions {
  /** Omit to accept any bytes (the service checks later from `head`). */
  sniff?: UploadSniffer;
  /** How many leading bytes to collect before deciding. Default 4096. */
  sniffBytes?: number;
  /** The message a refused upload answers with. */
  refusedMessage?: string;
}

const DEFAULT_SNIFF_BYTES = 4096;
const EXTENSION_FROM_NAME = /\.([a-z0-9]{1,8})$/i;

/**
 * A multer `StorageEngine` that streams an upload straight into the bucket.
 *
 * Replaces every `diskStorage` in the estate: no uploaded byte is ever written
 * to a container's disk, not even in transit. The part's stream is read until
 * `sniffBytes` have arrived, the sniffer rules on them, and only then do the
 * bytes start flowing to `staging/<app>/<uuid><ext>` — a refused file costs
 * nothing but the head. SHA-256 and the size are computed as the bytes pass.
 *
 * multer's `limits.fileSize` still applies: busboy truncates the part, the
 * engine sees `truncated`, aborts the multipart upload and reports the limit
 * error multer expects. A process that dies mid-upload leaves a `staging/`
 * object the bucket's lifecycle rule expires in a day; nothing to sweep.
 *
 *     MulterModule.registerAsync({
 *       inject: [ObjectStorageService],
 *       useFactory: (storage) => ({
 *         storage: objectStoreEngine(storage, { sniff: sniffMediaUpload }),
 *         limits: { fileSize: … },
 *       }),
 *     })
 */
export function objectStoreEngine(
  storage: ObjectStorageService,
  options: ObjectStoreEngineOptions = {},
): StorageEngine {
  const sniffBytes = options.sniffBytes ?? DEFAULT_SNIFF_BYTES;
  return {
    _handleFile(req: Request, file: Express.Multer.File, callback) {
      handleFile(storage, options, sniffBytes, req, file)
        .then((info) => callback(null, info as unknown as Partial<Express.Multer.File>))
        .catch((error: unknown) => callback(error as Error));
    },
    _removeFile(_req: Request, file: Express.Multer.File, callback) {
      const staged = file as unknown as Partial<StagedUpload>;
      storage.deleteQuietly(staged.stagingKey).then(() => callback(null), (error) => callback(error as Error));
    },
  };
}

async function handleFile(
  storage: ObjectStorageService,
  options: ObjectStoreEngineOptions,
  sniffBytes: number,
  req: Request,
  file: Express.Multer.File,
): Promise<StagedUpload> {
  const source = file.stream;
  const { head, ended } = await readHead(source, sniffBytes);

  let mimeType: string;
  let extension: string;
  if (options.sniff) {
    const decided = options.sniff(head, file.mimetype, file.originalname);
    if (!decided) {
      // Let the rest of the part drain so the request can be answered.
      source.resume();
      throw new UnsupportedMediaTypeException(
        options.refusedMessage ?? 'This kind of file cannot be uploaded.',
      );
    }
    mimeType = decided.mimeType;
    extension = decided.extension;
  } else {
    mimeType = tidyDeclaredMime(file.mimetype);
    const match = EXTENSION_FROM_NAME.exec(file.originalname ?? '');
    extension = match ? `.${match[1]!.toLowerCase()}` : '';
  }

  const stagingKey = buildStagingKey(randomUUID(), extension);

  // Re-assemble the part: the head we already consumed, then the rest. A part
  // shorter than the head has already ended, and piping an ended stream would
  // never close the body — so it is ended here instead.
  const body = new PassThrough();
  if (ended) {
    body.end(head);
  } else {
    body.write(head);
    source.pipe(body);
    source.on('error', (error) => body.destroy(error));
  }

  const aborter = new AbortController();
  const onClose = () => {
    if (!req.complete) aborter.abort();
  };
  req.once('close', onClose);

  try {
    const stored = await storage.uploadStream(stagingKey, body, mimeType, aborter.signal);
    if ((source as Readable & { truncated?: boolean }).truncated) {
      await storage.deleteQuietly(stagingKey);
      throw limitError(file.fieldname);
    }
    return {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      mimeType,
      extension,
      stagingKey,
      size: stored.byteSize,
      sha256: stored.sha256,
      head,
    };
  } catch (error) {
    await storage.deleteQuietly(stagingKey);
    throw error;
  } finally {
    req.off('close', onClose);
  }
}

/**
 * The first `count` bytes of a stream (fewer if it ends first), leaving the
 * rest unread, and whether the stream has already ended.
 */
function readHead(stream: Readable, count: number): Promise<{ head: Buffer; ended: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let collected = 0;
    let ended = false;
    const finish = () => {
      stream.off('readable', onReadable);
      stream.off('end', onEnd);
      stream.off('error', onError);
      resolve({ head: Buffer.concat(chunks).subarray(0, count), ended });
    };
    const onReadable = () => {
      let chunk: Buffer | null;
      while (collected < count && (chunk = stream.read() as Buffer | null) !== null) {
        chunks.push(chunk);
        collected += chunk.byteLength;
      }
      if (collected >= count) {
        // Put back what we did not need: the body stream gets it from `pipe`.
        const all = Buffer.concat(chunks);
        const rest = all.subarray(count);
        if (rest.byteLength > 0) stream.unshift(rest);
        chunks.length = 0;
        chunks.push(all.subarray(0, count));
        finish();
      }
    };
    const onEnd = () => {
      ended = true;
      finish();
    };
    const onError = (error: Error) => {
      stream.off('readable', onReadable);
      stream.off('end', onEnd);
      reject(error);
    };
    stream.on('readable', onReadable);
    stream.once('end', onEnd);
    stream.once('error', onError);
  });
}

/** The error multer itself raises for `limits.fileSize`, so the interceptor maps it to 413. */
function limitError(field: string): Error {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MulterError } = require('multer') as { MulterError: new (code: string, field?: string) => Error };
  return new MulterError('LIMIT_FILE_SIZE', field);
}

/** `type/subtype` and nothing else, or `application/octet-stream`. */
export function tidyDeclaredMime(declared: string | undefined): string {
  const value = (declared ?? '').trim().toLowerCase().split(';')[0] ?? '';
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(value) && value.length <= 128 ? value : 'application/octet-stream';
}
