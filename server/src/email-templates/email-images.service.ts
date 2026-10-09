import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ALLOWED_IMAGE_TYPES, sniffImageType } from '../common/storage/image-sniff';
import { EmailTemplatesConfig } from './email-templates.config';
import { GitSyncService } from './git-sync.service';
import { IMAGE_STEM, assertImageStem, imageStemFrom, within } from './template-name';

export interface TemplateImage {
  stem: string;
  ext: string;
  mimeType: string;
  bytes: number;
  modifiedAt: string;
  /** Absolute, extension-free: what a template's `<img src>` should carry. */
  url: string;
}

const MIME_BY_EXT = new Map(Array.from(ALLOWED_IMAGE_TYPES, ([mime, ext]) => [ext, mime]));

/**
 * `<venture>/images` — the raster files a venture's templates reference.
 *
 * Named by a stem, not a UUID, because the person writing the template types
 * the URL. The stem is unique across extensions, since the public route takes
 * no extension (nginx's static regex would otherwise swallow `.png`). Bytes are
 * sniffed and the four raster types are the whole allowlist; SVG is refused
 * for the same reason as blog covers — this API shares the site's origin.
 */
@Injectable()
export class EmailImagesService {
  constructor(
    private readonly config: EmailTemplatesConfig,
    private readonly git: GitSyncService,
  ) {}

  get dir(): string {
    return path.join(this.config.ventureDir, 'images');
  }

  async list(): Promise<TemplateImage[]> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => []);
    const items: TemplateImage[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const stem = entry.name.slice(0, -ext.length);
      const mime = MIME_BY_EXT.get(ext);
      if (!mime || !IMAGE_STEM.test(stem)) continue;
      const stat = await fs.stat(path.join(this.dir, entry.name));
      items.push(this.describe(stem, ext, mime, stat.size, stat.mtime));
    }
    return items.sort((a, b) => a.stem.localeCompare(b.stem));
  }

  async upload(file: { buffer: Buffer; originalname: string }, overwrite: boolean): Promise<TemplateImage> {
    const mime = sniffImageType(file.buffer);
    if (!mime) throw new BadRequestException('Only PNG, JPEG, GIF and WebP images are accepted');
    const ext = ALLOWED_IMAGE_TYPES.get(mime)!;
    const stem = imageStemFrom(file.originalname);

    const existing = await this.find(stem);
    if (existing && !overwrite) {
      throw new ConflictException(`An image named '${stem}' already exists; pass overwrite=true to replace it`);
    }
    if (existing && existing.ext !== ext) await fs.rm(within(this.dir, `${stem}${existing.ext}`), { force: true });

    const target = within(this.dir, `${stem}${ext}`);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, file.buffer, { mode: 0o644 });
    await fs.rename(tmp, target);
    const stat = await fs.stat(target);
    void this.git.commit(`${existing ? 'replace' : 'add'} image ${stem}`);
    return this.describe(stem, ext, mime, stat.size, stat.mtime);
  }

  async delete(rawStem: string): Promise<void> {
    const stem = assertImageStem(rawStem);
    const found = await this.find(stem);
    if (!found) throw new NotFoundException(`No image '${stem}'`);
    await fs.rm(within(this.dir, `${stem}${found.ext}`), { force: true });
    void this.git.commit(`delete image ${stem}`);
  }

  /** The file behind a public URL, or null. */
  async resolve(rawStem: string): Promise<{ path: string; mimeType: string; bytes: number } | null> {
    const stem = assertImageStem(rawStem);
    const found = await this.find(stem);
    if (!found) return null;
    const file = within(this.dir, `${stem}${found.ext}`);
    const stat = await fs.stat(file);
    return { path: file, mimeType: found.mimeType, bytes: stat.size };
  }

  private async find(stem: string): Promise<{ ext: string; mimeType: string } | null> {
    for (const [ext, mimeType] of MIME_BY_EXT) {
      if (await exists(within(this.dir, `${stem}${ext}`))) return { ext, mimeType };
    }
    return null;
  }

  private describe(stem: string, ext: string, mimeType: string, bytes: number, mtime: Date): TemplateImage {
    return {
      stem,
      ext,
      mimeType,
      bytes,
      modifiedAt: mtime.toISOString(),
      url: `${this.config.imageBaseUrl ?? `${this.config.publicApiBase}/email-images`}/${stem}`,
    };
  }
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}
