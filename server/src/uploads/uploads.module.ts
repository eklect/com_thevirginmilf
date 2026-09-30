import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { AdminUploadsController } from '../admin/admin-uploads.controller';
import { FileStorageService } from '../common/storage/file-storage.service';
import { GameScreenshotEntity } from '../games/game-screenshot.entity';
import { GameEntity } from '../games/game.entity';
import { SiteSettingEntity } from '../settings/site-setting.entity';
import { UploadEntity } from './upload.entity';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * `MulterModule` is registered here, with its limits read from the storage
 * config, so the admin upload route can use a bare `FileInterceptor('file')`.
 *
 * `memoryStorage`: an image is capped at a few megabytes, so buffering it is
 * fine, and it means the bytes can be sniffed and refused before anything
 * touches the disk.
 *
 * ## Why `AdminUploadsController` is declared here, and why Multer is not exported
 *
 * Multer options resolve per injector, not per controller. This app has only
 * one registration today, so the clash `com_shapedpodcast` hit — two upload
 * controllers in `AdminModule`, one registration winning for both, and every
 * image upload dying in `sniffImageType` on an undefined `file.buffer` — cannot
 * happen here yet.
 *
 * The structure is what keeps it that way. Declaring the controller in the
 * module whose Multer options it needs, and not exporting `MulterModule`, means
 * the day a second registration appears (a stream clip, an audio file) it cannot
 * silently capture this route.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UploadEntity,
      GameEntity,
      GameScreenshotEntity,
      SiteSettingEntity,
    ]),
    MulterModule.registerAsync({
      inject: [FileStorageService],
      useFactory: (storage: FileStorageService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: storage.maxUploadBytes,
          files: 1,
          fields: 4,
          parts: 8,
          fieldSize: 4096,
        },
      }),
    }),
  ],
  controllers: [UploadsController, AdminUploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
