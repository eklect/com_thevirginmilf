import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';

/**
 * Where the bucket is and how to reach it. Seven keys, identical in every
 * backend, differing only in value between the dev box and production:
 *
 *   OBJECT_STORE_ENDPOINT          http://objects:9000 | https://sfo3.digitaloceanspaces.com
 *   OBJECT_STORE_REGION            us-east-1 (Spaces wants an AWS region NAME in the
 *                                  SDK; the datacenter is in the endpoint)
 *   OBJECT_STORE_BUCKET            muccico-dev | muccico-prod
 *   OBJECT_STORE_ACCESS_KEY        this role's own key
 *   OBJECT_STORE_SECRET_KEY
 *   OBJECT_STORE_FORCE_PATH_STYLE  true for RustFS, false for Spaces (virtual-hosted,
 *                                  which the CDN needs)
 *   OBJECT_PUBLIC_BASE_URL         https://objects.mucciandco.test |
 *                                  https://muccico-prod.sfo3.cdn.digitaloceanspaces.com
 *
 * Plus one that is temporary:
 *
 *   LEGACY_STORAGE_ROOT   the old STORAGE_ROOT, read-only, so rows whose key is
 *                         still a disk path keep serving until storage_migrate.py
 *                         has moved them. Delete the line once that has run; the
 *                         code that reads it goes in the release after.
 */
export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  /** No trailing slash. */
  publicBaseUrl: string;
  /** Absolute, or null when the role has finished migrating. */
  legacyRoot: string | null;
}

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/**
 * Reads and validates. Fails closed: an app that boots with no bucket would
 * accept an upload and lose it, so every missing or malformed value is a boot
 * error with every problem listed at once.
 */
export function readObjectStoreConfig(config: ConfigService): ObjectStoreConfig {
  const problems: string[] = [];
  const read = (key: string): string => config.get<string>(key, '').trim();
  const required = (key: string): string => {
    const value = read(key);
    if (!value) problems.push(`${key} is required`);
    return value;
  };
  const url = (key: string, value: string): string => {
    if (value && !/^https?:\/\/[^/\s]+/.test(value)) problems.push(`${key} must be an http(s) URL`);
    return value.replace(/\/+$/, '');
  };

  const endpoint = url('OBJECT_STORE_ENDPOINT', required('OBJECT_STORE_ENDPOINT'));
  const region = required('OBJECT_STORE_REGION');
  const bucket = required('OBJECT_STORE_BUCKET');
  if (bucket && !BUCKET.test(bucket)) problems.push('OBJECT_STORE_BUCKET is not a valid bucket name');
  const accessKey = required('OBJECT_STORE_ACCESS_KEY');
  const secretKey = required('OBJECT_STORE_SECRET_KEY');
  const rawPathStyle = read('OBJECT_STORE_FORCE_PATH_STYLE').toLowerCase();
  if (rawPathStyle !== 'true' && rawPathStyle !== 'false') {
    problems.push("OBJECT_STORE_FORCE_PATH_STYLE must be 'true' or 'false'");
  }
  const publicBaseUrl = url('OBJECT_PUBLIC_BASE_URL', required('OBJECT_PUBLIC_BASE_URL'));

  const rawLegacy = read('LEGACY_STORAGE_ROOT');
  let legacyRoot: string | null = null;
  if (rawLegacy) {
    legacyRoot = path.resolve(rawLegacy);
    const appDir = path.resolve(process.cwd());
    if (legacyRoot === appDir || legacyRoot.startsWith(appDir + path.sep)) {
      problems.push(`LEGACY_STORAGE_ROOT (${legacyRoot}) is inside the application directory`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid object-store configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return {
    endpoint,
    region,
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: rawPathStyle === 'true',
    publicBaseUrl,
    legacyRoot,
  };
}
