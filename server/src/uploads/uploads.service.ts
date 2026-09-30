import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ALLOWED_IMAGE_TYPES, sniffImageType } from '../common/storage/image-sniff';
import { FileStorageService } from '../common/storage/file-storage.service';
import { sanitizeFilename } from '../common/storage/safe-path';
import { GameScreenshotEntity } from '../games/game-screenshot.entity';
import { GameEntity } from '../games/game.entity';
import { SiteSettingEntity } from '../settings/site-setting.entity';
import { UploadEntity } from './upload.entity';

export interface UploadSummary {
  id: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
  createdAt: Date;
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
    private readonly storage: FileStorageService,
  ) {}

  /**
   * Stores an uploaded image. The bytes decide the type; the client's declared
   * type and filename are recorded for display and trusted for nothing.
   */
  async store(
    file: { buffer: Buffer; originalname: string },
    createdBy: string,
  ): Promise<UploadSummary> {
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) {
      throw new UnsupportedMediaTypeException(
        'Only PNG, JPEG, GIF and WebP images can be uploaded.',
      );
    }

    const id = randomUUID();
    const key = this.storage.buildKey(id, ALLOWED_IMAGE_TYPES.get(mimeType)!);
    await this.storage.write(key, file.buffer);

    try {
      const row = await this.repo.save(
        this.repo.create({
          id,
          storageKey: key,
          mimeType,
          byteSize: file.buffer.byteLength,
          originalFilename: sanitizeFilename(file.originalname),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          createdBy,
        }),
      );
      return summarize(row);
    } catch (error) {
      // The row is what makes the file reachable; without it the bytes are an
      // orphan, so do not leave them behind.
      await this.storage.unlinkQuietly(key);
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
    return rows.map(summarize);
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
    await this.storage.unlinkQuietly(row.storageKey);
  }
}

function summarize(row: UploadEntity): UploadSummary {
  return {
    id: row.id,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    originalFilename: row.originalFilename,
    createdAt: row.createdAt,
  };
}
