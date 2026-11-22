import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminOnly } from '../common/auth/auth.decorators';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { ListUploadsQueryDto, isPagedUploadQuery } from '../uploads/upload-page';
import { UploadsService } from '../uploads/uploads.service';

@AdminOnly()
@Controller('admin/uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * With no query this is every row at once, which the Images page reads.
   * Any of `limit`, `cursor`, `q` or `type` asks for a page instead: newest
   * first, with `nextCursor` for the one after it.
   */
  @Get()
  async list(@Query() query: ListUploadsQueryDto) {
    if (!isPagedUploadQuery(query)) return { uploads: await this.uploads.list() };
    return this.uploads.listPage(query);
  }

  /** One image's details, so a picker can name its current choice without the whole list. */
  @Get(':id')
  async one(@Param('id', new ParseUUIDPipe()) id: string) {
    return { upload: this.uploads.summarize(await this.uploads.get(id)) };
  }

  /** Multipart, one part named `file`. Limits come from `UploadsModule`. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentPrincipal() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Attach an image as `file`.');
    return { upload: await this.uploads.store(file, user.id) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.uploads.remove(id);
  }
}
