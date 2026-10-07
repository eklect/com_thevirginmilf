import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { EmailImagesService } from './email-images.service';

/**
 * `GET /email-images/<stem>` — the images a sent email loads.
 *
 * Public: a mail client fetches these with no session. Extension-free on
 * purpose: nginx's static block claims every `*.png` URL before the `/api/`
 * proxy sees it. An hour's cache rather than a year's — the stem is reusable
 * (`overwrite=true`), so the bytes under a URL can change.
 */
@Public()
@Controller('email-images')
export class EmailImagesController {
  constructor(private readonly images: EmailImagesService) {}

  @Get(':stem')
  async serve(@Param('stem') stem: string, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const found = await this.images.resolve(stem);
    if (!found) throw new NotFoundException('No such image');
    response.setHeader('Content-Type', found.mimeType);
    response.setHeader('Content-Length', String(found.bytes));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(createReadStream(found.path));
  }
}
