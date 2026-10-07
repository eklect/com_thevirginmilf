import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/auth/auth.decorators';
import { RequireScope } from '../service-auth/service-auth.decorators';
import { ServiceTokenGuard } from '../service-auth/service-token.guard';
import { ArchiveTemplatesDto, SaveTemplateDto } from './dto/email-templates.dto';
import { EmailImagesService } from './email-images.service';
import { EmailTemplatesService } from './email-templates.service';
import { assertFolder } from './template-name';

/**
 * The email-template service plane: what the My Company Tools app calls.
 *
 * Public to the staff-session guard — the caller is a server holding a token
 * from `/service/oauth/token` — and `ServiceTokenGuard` is what authenticates
 * it. Reads need `email-templates:read`, every write `email-templates:write`.
 * The request shapes are generic on purpose: JSON `{ html, text }` for a
 * template, multipart `file` for an image, so one client in the app talks to
 * every venture.
 */
@Public()
@UseGuards(ServiceTokenGuard)
@Controller('service/email-templates')
export class EmailTemplatesController {
  constructor(
    private readonly templates: EmailTemplatesService,
    private readonly images: EmailImagesService,
  ) {}

  @Get('status')
  @RequireScope('email-templates:read')
  status() {
    return this.templates.status();
  }

  @Get('live')
  @RequireScope('email-templates:read')
  async live() {
    return { items: await this.templates.listLive() };
  }

  @Get('versions')
  @RequireScope('email-templates:read')
  async versions() {
    return { items: await this.templates.listVersions() };
  }

  @Get('archive')
  @RequireScope('email-templates:read')
  async archive() {
    return { items: await this.templates.listArchive() };
  }

  /** `file` is `<name>.html` in every folder; `live/<name>` without the extension works too. */
  @Get(':folder/:file')
  @RequireScope('email-templates:read')
  async read(@Param('folder') folder: string, @Param('file') file: string) {
    return { item: await this.templates.read(assertFolder(folder), file) };
  }

  @Put('live/:name')
  @RequireScope('email-templates:write')
  save(@Param('name') name: string, @Body() dto: SaveTemplateDto) {
    return this.templates.save(name, { html: dto.html, text: dto.text ?? null });
  }

  @Post('archive')
  @RequireScope('email-templates:write')
  @HttpCode(200)
  archiveMany(@Body() dto: ArchiveTemplatesDto) {
    return this.templates.archive(dto.names);
  }

  @Post('versions/:file/restore')
  @RequireScope('email-templates:write')
  @HttpCode(200)
  restore(@Param('file') file: string) {
    return this.templates.restore(file);
  }

  @Delete('versions/:file')
  @RequireScope('email-templates:write')
  @HttpCode(204)
  async deleteVersion(@Param('file') file: string) {
    await this.templates.deleteStored('versions', file);
  }

  @Delete('archive/:file')
  @RequireScope('email-templates:write')
  @HttpCode(204)
  async deleteArchived(@Param('file') file: string) {
    await this.templates.deleteStored('archive', file);
  }

  @Get('images')
  @RequireScope('email-templates:read')
  async listImages() {
    return { items: await this.images.list() };
  }

  @Post('images')
  @RequireScope('email-templates:write')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File | undefined, @Query('overwrite') overwrite?: string) {
    if (!file?.buffer) {
      throw new BadRequestException('Send the image as the multipart field "file"');
    }
    return { item: await this.images.upload(file, overwrite === 'true') };
  }

  @Delete('images/:stem')
  @RequireScope('email-templates:write')
  @HttpCode(204)
  async deleteImage(@Param('stem') stem: string) {
    await this.images.delete(stem);
  }
}
