import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

/**
 * The names a template file may have, and nothing else.
 *
 * `safe-path.ts` is stricter than this (no dots) because its segments are
 * server-minted UUIDs; a template is named by a person, and `welcome.v2` is a
 * reasonable name. The traversal defence is the same two checks: the segment
 * test, which rejects `..`, separators and NUL outright, then the resolved
 * path proven to be under the folder it was joined to.
 */
export const TEMPLATE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;
export const VERSION_FILE = /^(\d{10,16})-([a-z0-9][a-z0-9._-]{0,80})\.html$/;
export const ARCHIVE_FILE = /^Archive-(?:(\d{10,16})-)?([a-z0-9][a-z0-9._-]{0,80})\.html$/;
/** An image stem: the public URL is `/api/email-images/<stem>`, no extension. */
export const IMAGE_STEM = /^[a-z0-9][a-z0-9_-]{0,80}$/;

export type TemplateFolder = 'live' | 'versions' | 'archive';
export const TEMPLATE_FOLDERS: readonly TemplateFolder[] = ['live', 'versions', 'archive'];

export function assertTemplateName(name: string): string {
  if (!TEMPLATE_NAME.test(name) || name.includes('..')) {
    throw new BadRequestException(
      `'${name}' is not a template name: lower-case letters, digits, dots, hyphens and underscores, up to 81 characters`,
    );
  }
  return name;
}

export function assertImageStem(stem: string): string {
  if (!IMAGE_STEM.test(stem)) {
    throw new BadRequestException(`'${stem}' is not an image name`);
  }
  return stem;
}

export function parseVersionFile(file: string): { epoch: number; name: string } {
  const match = VERSION_FILE.exec(file);
  if (!match || file.includes('..')) throw new BadRequestException(`'${file}' is not a version file`);
  return { epoch: Number(match[1]), name: match[2] };
}

export function parseArchiveFile(file: string): { epoch: number | null; name: string } {
  const match = ARCHIVE_FILE.exec(file);
  if (!match || file.includes('..')) throw new BadRequestException(`'${file}' is not an archive file`);
  return { epoch: match[1] ? Number(match[1]) : null, name: match[2] };
}

export function assertFolder(folder: string): TemplateFolder {
  if (!(TEMPLATE_FOLDERS as readonly string[]).includes(folder)) {
    throw new BadRequestException(`'${folder}' is not one of live, versions, archive`);
  }
  return folder as TemplateFolder;
}

/** Joins `file` beneath `dir` and proves it stayed there. */
export function within(dir: string, file: string): string {
  const resolved = path.resolve(dir, file);
  if (path.dirname(resolved) !== path.resolve(dir)) {
    throw new BadRequestException('Resolved path escapes its folder');
  }
  return resolved;
}

/** `welcome.v2.html` → `welcome.v2`; anything without `.html` → null. */
export function htmlStem(file: string): string | null {
  return file.endsWith('.html') ? file.slice(0, -5) : null;
}

/** `image.name.PNG` → `image-name`, the stem the public URL will carry. */
export function imageStemFrom(originalName: string): string {
  const base = path.basename(originalName || 'image').replace(/\.[a-zA-Z0-9]+$/, '');
  const stem = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 81);
  return IMAGE_STEM.test(stem) ? stem : `image-${Date.now()}`;
}
