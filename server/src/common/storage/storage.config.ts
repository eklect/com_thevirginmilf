import { ConfigService } from '@nestjs/config';

/** 5 MiB. Deliberately below nginx's `max_body_size: "6m"` — see .env.example. */
const DEFAULT_MAX_UPLOAD_BYTES = 5_242_880;

/**
 * The cap on a small image upload (`UploadsModule`'s in-memory multer).
 *
 * This file used to read `STORAGE_ROOT` too. Uploaded files no longer touch
 * the disk — they go to the object store (`object-store.config.ts`) — so the
 * root, and the boot check that it sat outside the repo, are gone with it.
 */
export function readUploadMaxBytes(config: ConfigService): number {
  const raw = config.get<string>('UPLOAD_MAX_BYTES', '').trim();
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`UPLOAD_MAX_BYTES must be a positive integer, got '${raw}'`);
  }
  return parsed;
}
