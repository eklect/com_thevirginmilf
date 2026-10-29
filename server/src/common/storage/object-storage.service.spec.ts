import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buildObjectKey, buildStagingKey } from './object-key';
import { ObjectStorageService } from './object-storage.service';

/**
 * Round trip against a real S3 endpoint — the dev box's RustFS, or a scratch
 * bucket. Skipped unless the OBJECT_STORE_* variables are in the environment,
 * so an ordinary `npm test` needs no bucket:
 *
 *   OBJECT_STORE_ENDPOINT=http://127.0.0.1:9000 OBJECT_STORE_REGION=us-east-1 \
 *   OBJECT_STORE_BUCKET=muccico-dev OBJECT_STORE_ACCESS_KEY=… OBJECT_STORE_SECRET_KEY=… \
 *   OBJECT_STORE_FORCE_PATH_STYLE=true OBJECT_PUBLIC_BASE_URL=https://objects.mucciandco.test \
 *   npx jest object-storage.service
 *
 * Everything it writes sits under one `uploads/<random actor>/…` prefix and is
 * removed at the end with `deletePrefix`.
 */
const configured = Boolean(process.env.OBJECT_STORE_ENDPOINT && process.env.OBJECT_STORE_SECRET_KEY);
const maybe = configured ? describe : describe.skip;

maybe('ObjectStorageService (integration)', () => {
  // Built in beforeAll, not at describe time: jest evaluates a skipped
  // describe's body too, and the constructor refuses to run without the env.
  let storage: ObjectStorageService;
  const actor = `spec-${randomUUID()}`;
  const prefix = `uploads/${actor}/`;

  beforeAll(() => {
    storage = new ObjectStorageService(new ConfigService(process.env as Record<string, string>));
  });

  afterAll(async () => {
    await storage.deletePrefix(prefix);
    storage.onModuleDestroy();
  });

  it('puts, heads, reads (whole and ranged) and deletes a buffer', async () => {
    const id = randomUUID();
    const key = buildObjectKey({ actor, module: 'spec', action: 'image', id, originalName: 'Hello World.png', extension: '.png' });
    const bytes = Buffer.from('0123456789abcdef');

    const stored = await storage.putBuffer(key, bytes, { contentType: 'image/png', acl: 'public-read', originalName: 'Hello World.png', rowId: id });
    expect(stored.byteSize).toBe(16);
    expect(stored.sha256).toHaveLength(64);

    const head = await storage.head(key);
    expect(head?.byteSize).toBe(16);
    expect(head?.contentType).toBe('image/png');

    const whole = await storage.getBuffer(key);
    expect(whole.toString()).toBe('0123456789abcdef');

    // Inclusive at both ends, as HTTP means it.
    const part = await storage.getBuffer(key, { start: 2, end: 5 });
    expect(part.toString()).toBe('2345');

    expect(storage.publicUrl(key)).toBe(`${process.env.OBJECT_PUBLIC_BASE_URL}/${key}`);

    await storage.deleteQuietly(key);
    expect(await storage.head(key)).toBeNull();
  });

  it('streams into staging and promotes to the final key', async () => {
    const id = randomUUID();
    const staging = buildStagingKey(id, '.bin');
    const payload = Buffer.alloc(3 * 1024 * 1024, 7);
    const stored = await storage.uploadStream(staging, Readable.from([payload.subarray(0, 1_000_000), payload.subarray(1_000_000)]), 'application/octet-stream');
    expect(stored.byteSize).toBe(payload.byteLength);

    const final = buildObjectKey({ actor, module: 'spec', action: 'blob', id, originalName: null, extension: '.bin' });
    await storage.promote(staging, final, { contentType: 'application/octet-stream', acl: 'private', rowId: id });

    expect(await storage.head(staging)).toBeNull();
    const head = await storage.head(final);
    expect(head?.byteSize).toBe(payload.byteLength);
    expect(head?.contentType).toBe('application/octet-stream');
  });

  it('uploads a multipart-sized stream', async () => {
    const id = randomUUID();
    const staging = buildStagingKey(id, '.bin');
    // Above one 8 MiB part, so lib-storage goes multipart.
    const chunks = Array.from({ length: 10 }, (_, i) => Buffer.alloc(1024 * 1024, i));
    const stored = await storage.uploadStream(staging, Readable.from(chunks), 'application/octet-stream');
    expect(stored.byteSize).toBe(10 * 1024 * 1024);
    const head = await storage.head(staging);
    expect(head?.byteSize).toBe(10 * 1024 * 1024);
    await storage.deleteQuietly(staging);
  });

  it('refuses a key outside uploads/ and staging/', async () => {
    await expect(storage.putBuffer('images/x.png', Buffer.from('x'), { contentType: 'image/png', acl: 'private' })).rejects.toThrow();
    await expect(storage.deletePrefix('')).rejects.toThrow();
  });
});
