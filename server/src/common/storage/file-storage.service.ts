import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { resolveWithin } from './safe-path';
import { readStorageConfig, StorageConfig } from './storage.config';

/** The subtree under `STORAGE_ROOT` that uploaded images occupy. */
export const IMAGES_PREFIX = 'images';

/**
 * Everything this application does to the filesystem.
 *
 * One service, so the path-construction rules exist in one place. Nothing else
 * in the codebase calls `fs` for stored files — a module that built its own
 * path would be a module that could build one outside the root.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly config: StorageConfig;

  constructor(configService: ConfigService) {
    this.config = readStorageConfig(configService);
  }

  get root(): string {
    return this.config.root;
  }

  get maxUploadBytes(): number {
    return this.config.maxUploadBytes;
  }

  /** The storage key for an image. Relative to the root, POSIX separators. */
  buildKey(id: string, extension: string): string {
    // `path.posix`, not `path.join`: the key is stored in a database column and
    // read back on whatever platform is running.
    return path.posix.join(IMAGES_PREFIX, `${id}${extension}`);
  }

  /**
   * Absolute path for a stored key, re-validated.
   *
   * The key was written by this server, so in principle it is trustworthy. It
   * is still re-checked, because this is the point where a value from the
   * database becomes a filesystem path.
   */
  resolveKey(key: string): string {
    const segments = key.split('/').filter(Boolean);
    const filename = segments.pop() ?? '';
    if (filename.includes('..') || filename.includes(path.sep)) {
      throw new Error(`Refusing to resolve suspicious storage key '${key}'`);
    }
    const dir = resolveWithin(this.config.root, ...segments);
    const resolved = path.resolve(dir, filename);
    if (!resolved.startsWith(this.config.root + path.sep)) {
      throw new Error(`Storage key '${key}' escapes the storage root`);
    }
    return resolved;
  }

  /** Writes the bytes for a key, creating the directory on first use. */
  async write(key: string, bytes: Buffer): Promise<string> {
    const destination = this.resolveKey(key);
    await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fsp.writeFile(destination, bytes, { mode: 0o600 });
    return destination;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes without caring whether it worked.
   *
   * Used after the row is gone, where a stray file is a housekeeping matter
   * and not a reason to fail the request that removed it.
   */
  async unlinkQuietly(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      await fsp.unlink(this.resolveKey(key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Could not remove '${key}': ${String(error)}`);
      }
    }
  }
}
