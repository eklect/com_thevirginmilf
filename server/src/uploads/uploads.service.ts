import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ALLOWED_IMAGE_TYPES, sniffImageType } from '../common/storage/image-sniff';
import { buildObjectKey } from '../common/storage/object-key';
import { ObjectStorageService } from '../common/storage/object-storage.service';
import { sanitizeFilename } from '../common/storage/safe-path';
import { GameScreenshotEntity } from '../games/game-screenshot.entity';
import { GameEntity } from '../games/game.entity';
import { SiteSettingEntity } from '../settings/site-setting.entity';
import { UploadEntity, UploadScope } from './upload.entity';

export interface UploadSummary {
  id: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
  scope: UploadScope;
  /** Where the browser fetches it: the object's public URL, or the API route for a restricted or legacy one. */
  url: string;
  createdAt: Date;
}

/** Where in the key an upload files: the module and what the file is. */
export interface StoreOptions {
  /** Default `uploads`. */
  module?: string;
  /** Default `image`. */
  action?: string;
  /** Default `public`. */
  scope?: UploadScope;
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(UploadEntity)
    private readonly repo: Repository<UploadEntity>,
    @InjectRepository(GameEntity)
    private readonly games: Repository<GameEntity>,
    @InjectRepository(GameScreenshotEntity)
    private readonly screenshots: Repository<GameScreenshotEntity>,
    @InjectRepository(SiteSettingEntity)
    private readonly settings: Repository<SiteSettingEntity>,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Stores an uploaded image. The bytes decide the type; the client's declared
   * type and filename are recorded for display and trusted for nothing. The
   * object is filed under the uploader's MAP `sub` (see `object-key.ts`) and
   * is `public-read` unless the caller says `restricted`.
   *
   * `/admin/uploads` does not say what an image is for — a cover, a
   * screenshot, the headshot — so everything through it files as
   * `uploads/image`.
   */
  async store(
    file: { buffer: Buffer; originalname: string },
    createdBy: string,
    options: StoreOptions = {},
  ): Promise<UploadSummary> {
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) {
      throw new UnsupportedMediaTypeException(
        'Only PNG, JPEG, GIF and WebP images can be uploaded.',
      );
    }

    const id = randomUUID();
    const scope: UploadScope = options.scope ?? 'public';
    const originalFilename = sanitizeFilename(file.originalname);
    const key = buildObjectKey({
      actor: createdBy,
      module: options.module ?? 'uploads',
      action: options.action ?? 'image',
      id,
      originalName: originalFilename,
      extension: ALLOWED_IMAGE_TYPES.get(mimeType)!,
    });
    const stored = await this.storage.putBuffer(key, file.buffer, {
      contentType: mimeType,
      acl: scope === 'public' ? 'public-read' : 'private',
      originalName: originalFilename,
      rowId: id,
    });

    try {
      const row = await this.repo.save(
        this.repo.create({
          id,
          storageKey: key,
          mimeType,
          byteSize: stored.byteSize,
          originalFilename,
          sha256: stored.sha256,
          scope,
          createdBy,
        }),
      );
      return this.summarize(row);
    } catch (error) {
      // The row is what makes the file reachable; without it the object is an
      // orphan, so do not leave it behind.
      await this.storage.deleteQuietly(key);
      throw error;
    }
  }

  async get(id: string): Promise<UploadEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async list(): Promise<UploadSummary[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.summarize(row));
  }

  /**
   * Refuses while anything still points at the file.
   *
   * Every column that can hold an upload id has to be counted here. The
   * foreign keys would let the delete through — a game's cover is `ON DELETE
   * SET NULL`, a screenshot row is `CASCADE` — so a missed one does not
   * corrupt anything; it silently blanks an image somebody chose, which is
   * worse to diagnose than a refusal. The settings check is a value match
   * rather than a join, because `site_settings` is a key/value table and
   * `headshot_upload_id` is stored as its text.
   */
  async remove(id: string): Promise<void> {
    const row = await this.get(id);
    const [covers, screenshots, settingRefs] = await Promise.all([
      this.games.count({ where: { coverUploadId: id } }),
      this.screenshots.count({ where: { uploadId: id } }),
      this.settings.count({ where: { value: id } }),
    ]);
    if (covers + screenshots + settingRefs > 0) {
      throw new ConflictException(
        'This image is still in use. Change or clear it there first.',
      );
    }
    await this.repo.remove(row);
    await this.storage.deleteQuietly(row.storageKey);
  }

  /** The browser-facing URL: straight to the bucket for a public object, the API route otherwise. */
  urlFor(row: Pick<UploadEntity, 'id' | 'storageKey' | 'scope'>): string {
    if (row.scope === 'public' && row.storageKey.startsWith('uploads/')) {
      return this.storage.publicUrl(row.storageKey);
    }
    return `/api/uploads/${row.id}`;
  }

  summarize(row: UploadEntity): UploadSummary {
    return {
      id: row.id,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      originalFilename: row.originalFilename,
      scope: row.scope,
      url: this.urlFor(row),
      createdAt: row.createdAt,
    };
  }
}
