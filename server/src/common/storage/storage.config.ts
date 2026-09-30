import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'node:os';
import * as path from 'node:path';

export interface StorageConfig {
  /** Absolute path holding every uploaded file. */
  root: string;
  /** Hard cap on a single upload, in bytes. */
  maxUploadBytes: number;
}

/** 5 MiB. Deliberately below nginx's `max_body_size: "6m"` — see .env.example. */
const DEFAULT_MAX_UPLOAD_BYTES = 5_242_880;

const logger = new Logger('StorageConfig');

/**
 * Reads and validates the storage settings.
 *
 * `STORAGE_ROOT` must not sit inside the application directory, and the app
 * refuses to boot if it does. On the dev box this repo is bind-mounted, so a
 * storage directory inside it shows up in `git status`; in production the
 * deploy hard-resets the clone, destroying anything inside it. The right values
 * are `/var/lib/muccico/storage/thevirginmilf_api` (dev box, a named volume) and
 * `/srv/muccico/storage/thevirginmilf_api` (production, a sibling of the clone).
 *
 * Unset falls back to a temp directory with a loud warning, so a fresh checkout
 * runs with no setup and nothing silently persists where it should not.
 */
export function readStorageConfig(config: ConfigService): StorageConfig {
  const configured = config.get<string>('STORAGE_ROOT', '').trim();

  let root: string;
  if (configured) {
    root = path.resolve(configured);
  } else {
    root = path.join(os.tmpdir(), 'thevirginmilf-storage');
    logger.warn(
      `STORAGE_ROOT is not set — uploaded files will go to ${root}, which the ` +
        'operating system may clear. Set it in .env before storing anything real.',
    );
  }

  const appDir = path.resolve(process.cwd());
  if (root === appDir || root.startsWith(appDir + path.sep)) {
    throw new Error(
      `STORAGE_ROOT (${root}) is inside the application directory (${appDir}). ` +
        'Uploads must live outside the deployed tree: the dev box bind-mounts ' +
        'the repo there, and production hard-resets it on deploy.',
    );
  }

  const raw = config.get<string>('UPLOAD_MAX_BYTES', '').trim();
  let maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`UPLOAD_MAX_BYTES must be a positive integer, got '${raw}'`);
    }
    maxUploadBytes = parsed;
  }

  return { root, maxUploadBytes };
}
