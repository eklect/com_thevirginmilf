import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { FileStorageService } from '../common/storage/file-storage.service';
import { UploadsService } from './uploads.service';

/**
 * Serves uploaded images. Public, because a game's cover has to load for
 * everyone — and served by this process rather than nginx, so the
 * storage root never needs to be readable by anything but the app user.
 */
@Public()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: FileStorageService,
  ) {}

  @Get(':id')
  async serve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const upload = await this.uploads.get(id);
    const filePath = this.storage.resolveKey(upload.storageKey);

    response.setHeader('Content-Type', upload.mimeType);
    response.setHeader('Content-Length', String(upload.byteSize));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    // The id is a UUID minted per file and the bytes never change under it, so
    // the browser may keep it for as long as it likes.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Belt and braces for a raster image: even if a sniffer disagreed with us,
    // nothing here may run script or load anything else.
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    return new StreamableFile(createReadStream(filePath));
  }
}
