import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { ObjectStorageService } from '../common/storage/object-storage.service';
import { redirectOrStream } from '../common/storage/stream-object';
import { UploadsService } from './uploads.service';

/** The bytes under an id never change — a re-upload is a new row. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * The stable address of an uploaded image: `/api/uploads/:id`.
 *
 * Public, because a game's cover has to load for everyone. The bytes
 * themselves live in the object store, so a `public` upload answers a
 * cacheable 302 to its bucket URL (the CDN, in production) and the browser
 * keeps that for a year; `games.serializer.ts` and the settings that built
 * `/api/uploads/<id>` go on working unchanged. A `restricted` upload is a 404
 * here — an owner-checking route serves it. A row still carrying a pre-move
 * disk key is streamed from `LEGACY_STORAGE_ROOT` until the migration has run.
 */
@Public()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: ObjectStorageService,
  ) {}

  // Express answers HEAD from a GET handler; `streamObject` sends headers only for it.
  @Get(':id')
  async serve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const upload = await this.uploads.get(id);
    if (upload.scope !== 'public') throw new NotFoundException('Not found');
    await redirectOrStream(this.storage, request, response, upload.storageKey, {
      contentType: upload.mimeType,
      sha256: upload.sha256,
      cacheControl: IMMUTABLE,
      contentDisposition: 'inline',
      sandbox: true,
    });
  }
}
