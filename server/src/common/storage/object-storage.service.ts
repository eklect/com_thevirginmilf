import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
  type ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { assertObjectKey, isLegacyKey } from './object-key';
import { ObjectStoreConfig, readObjectStoreConfig } from './object-store.config';
import { resolveWithin } from './safe-path';
import { readUploadMaxBytes } from './storage.config';

/** Who may read an object: everyone who holds the URL, or only this app. */
export type ObjectAcl = 'public-read' | 'private';

export interface PutOptions {
  contentType: string;
  acl: ObjectAcl;
  /** Stored as `x-amz-meta-original-filename` so a bare listing still shows it. */
  originalName?: string | null;
  /** The row the object belongs to, as `x-amz-meta-row-id`. */
  rowId?: string;
}

export interface StoredObject {
  byteSize: number;
  sha256: string;
}

export interface ObjectHead {
  byteSize: number;
  contentType: string | null;
  etag: string | null;
}

export interface ObjectRange {
  /** Inclusive, as HTTP means it. */
  start: number;
  /** Inclusive. */
  end: number;
}

export interface ObjectStream {
  body: Readable;
  /** Bytes in THIS response (the range's length for a partial read). */
  contentLength: number;
  contentType: string | null;
}

/** 8 MiB parts: multipart from the second part on, so a video never sits in the heap. */
const PART_SIZE = 8 * 1024 * 1024;
/** `public-read` objects never change under their key — a re-upload is a new row. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Everything this application does to stored files.
 *
 * One service, so the rules exist in one place: every key is validated on the
 * way in (`assertObjectKey`), every public object carries the immutable cache
 * header and its original filename as metadata, and nothing else in the
 * codebase holds an S3 client. A module that built its own would be a module
 * that could put a file outside `uploads/`.
 *
 * Two SDK settings are load-bearing. `requestChecksumCalculation` and
 * `responseChecksumValidation` are `WHEN_REQUIRED` because the 2025 SDK default
 * signs CRC32 trailers that DigitalOcean Spaces and the dev box's RustFS both
 * refuse, and the refusal reads as a signature mismatch, not as a checksum
 * problem.
 *
 * ## The legacy fallback
 *
 * A row whose key does not start with `uploads/` was written before the move,
 * as a path under the old `STORAGE_ROOT`. Until `storage_migrate.py` has
 * carried it into the bucket and rewritten the row, `head`, `getStream` and
 * `deleteQuietly` answer for such a key from `LEGACY_STORAGE_ROOT`, read-only
 * (`deleteQuietly` removes the file, since the row is gone). Nothing ever
 * WRITES a legacy key. When the migration is verified for this role, the env
 * line goes, and this fallback goes in the release after.
 */
@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly config: ObjectStoreConfig;
  private readonly client: S3Client;
  private readonly uploadMaxBytes: number;

  constructor(configService: ConfigService) {
    this.config = readObjectStoreConfig(configService);
    this.uploadMaxBytes = readUploadMaxBytes(configService);
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      forcePathStyle: this.config.forcePathStyle,
      credentials: { accessKeyId: this.config.accessKey, secretAccessKey: this.config.secretKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    if (this.config.legacyRoot) {
      this.logger.warn(
        `LEGACY_STORAGE_ROOT is set (${this.config.legacyRoot}): rows with a pre-move key are served ` +
          'from disk. Run storage_migrate.py for this role, then delete the variable.',
      );
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  /** The cap on a small in-memory image upload (`UPLOAD_MAX_BYTES`). */
  get maxUploadBytes(): number {
    return this.uploadMaxBytes;
  }

  get bucket(): string {
    return this.config.bucket;
  }

  /** Whether this role still serves pre-move keys from disk. */
  get hasLegacyRoot(): boolean {
    return this.config.legacyRoot !== null;
  }

  /** Where the browser (or anyone) fetches a public-read object. */
  publicUrl(key: string): string {
    assertObjectKey(key);
    return `${this.config.publicBaseUrl}/${key}`;
  }

  /** Stores bytes already in memory (a small image). Returns what was written. */
  async putBuffer(key: string, bytes: Buffer, options: PutOptions): Promise<StoredObject> {
    assertObjectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ...this.objectHeaders(options),
      }),
    );
    return { byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  /**
   * Streams a request body into the bucket under a STAGING key, hashing and
   * counting as it goes, multipart above one part. Used by the multer engine;
   * services then `promote` the staged object once the row exists.
   */
  async uploadStream(
    stagingKey: string,
    body: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<StoredObject> {
    assertObjectKey(stagingKey);
    const hash = createHash('sha256');
    let byteSize = 0;
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      byteSize += chunk.byteLength;
    });
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.config.bucket, Key: stagingKey, Body: body, ContentType: contentType },
      partSize: PART_SIZE,
      queueSize: 2,
      leavePartsOnError: false,
      abortController: signal ? abortControllerFrom(signal) : undefined,
    });
    await upload.done();
    return { byteSize, sha256: hash.digest('hex') };
  }

  /**
   * Moves a staged object to its final key: a server-side copy (no bytes
   * through Node), then the staged copy is deleted. The copy REPLACES the
   * metadata, which is where the ACL, the cache header and the original name
   * are set — the staging put knows none of them.
   */
  async promote(stagingKey: string, finalKey: string, options: PutOptions): Promise<void> {
    assertObjectKey(stagingKey);
    assertObjectKey(finalKey);
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: finalKey,
        CopySource: `/${this.config.bucket}/${encodeURI(stagingKey)}`,
        MetadataDirective: 'REPLACE',
        ...this.objectHeaders(options),
      }),
    );
    await this.deleteQuietly(stagingKey);
  }

  /** Flips one object's visibility after the fact (a `scope` change on its row). */
  async setAcl(key: string, acl: ObjectAcl): Promise<void> {
    assertObjectKey(key);
    await this.client.send(new PutObjectAclCommand({ Bucket: this.config.bucket, Key: key, ACL: acl }));
  }

  /** Size and type, or null when the object is not there. */
  async head(key: string): Promise<ObjectHead | null> {
    if (isLegacyKey(key)) return this.legacyHead(key);
    assertObjectKey(key);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return {
        byteSize: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * The bytes, or a range of them. `range` is inclusive at both ends, as HTTP
   * means it — not as `slice()` means it. Getting that wrong drops the last
   * byte of every ranged response.
   */
  async getStream(key: string, range?: ObjectRange): Promise<ObjectStream | null> {
    if (isLegacyKey(key)) return this.legacyStream(key, range);
    assertObjectKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      );
      if (!result.Body) return null;
      return {
        body: result.Body as Readable,
        contentLength: result.ContentLength ?? (range ? range.end - range.start + 1 : 0),
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** The whole object in memory. For the small things a publisher posts by value. */
  async getBuffer(key: string, range?: ObjectRange): Promise<Buffer<ArrayBuffer>> {
    const stream = await this.getStream(key, range);
    if (!stream) throw new Error(`Object '${key}' is not in the bucket`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  /**
   * Deletes without caring whether it worked.
   *
   * Used after the row is gone, where a stray object is a housekeeping matter
   * and not a reason to fail the request that removed it.
   */
  async deleteQuietly(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      if (isLegacyKey(key)) {
        await this.legacyUnlink(key);
        return;
      }
      assertObjectKey(key);
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Could not remove '${key}': ${String(error)}`);
    }
  }

  /**
   * Deletes everything under a prefix, 1000 keys a batch. For a tenant that is
   * gone and for tests; a person's purge is `user_purge.py`'s job.
   */
  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.startsWith('uploads/') && !prefix.startsWith('staging/')) {
      throw new Error(`Refusing to delete outside uploads/ and staging/: '${prefix}'`);
    }
    let removed = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean);
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return removed;
  }

  // ---------- the headers every durable object carries ----------

  private objectHeaders(options: PutOptions) {
    const metadata: Record<string, string> = {};
    if (options.originalName) metadata['original-filename'] = asciiMetadata(options.originalName);
    if (options.rowId) metadata['row-id'] = options.rowId;
    return {
      ContentType: options.contentType,
      ACL: options.acl as ObjectCannedACL,
      CacheControl: options.acl === 'public-read' ? IMMUTABLE : 'private, no-store',
      Metadata: metadata,
    };
  }

  // ---------- legacy disk fallback (read-only; goes when the migration has run) ----------

  private legacyPath(key: string): string | null {
    const root = this.config.legacyRoot;
    if (!root) return null;
    const segments = key.split('/').filter(Boolean);
    const filename = segments.pop() ?? '';
    if (!filename || filename.includes('..') || filename.includes(path.sep)) return null;
    try {
      const resolved = path.resolve(resolveWithin(root, ...segments), filename);
      return resolved.startsWith(root + path.sep) ? resolved : null;
    } catch {
      return null;
    }
  }

  private async legacyHead(key: string): Promise<ObjectHead | null> {
    const file = this.legacyPath(key);
    if (!file) return null;
    try {
      const stat = await fsp.stat(file);
      return { byteSize: stat.size, contentType: null, etag: null };
    } catch {
      return null;
    }
  }

  private async legacyStream(key: string, range?: ObjectRange): Promise<ObjectStream | null> {
    const file = this.legacyPath(key);
    if (!file) return null;
    let size: number;
    try {
      size = (await fsp.stat(file)).size;
    } catch {
      return null;
    }
    const body = fs.createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
    return { body, contentLength: range ? range.end - range.start + 1 : size, contentType: null };
  }

  private async legacyUnlink(key: string): Promise<void> {
    const file = this.legacyPath(key);
    if (!file) return;
    try {
      await fsp.unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/** S3 metadata is ASCII; keep the readable part of a name and drop the rest. */
function asciiMetadata(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?').slice(0, 255);
}

function abortControllerFrom(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}
