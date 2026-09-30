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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminOnly } from '../common/auth/auth.decorators';
import { CurrentPrincipal } from '../common/auth/principal';
import type { RequestUser } from '../common/auth/principal';
import { UploadsService } from '../uploads/uploads.service';

@AdminOnly()
@Controller('admin/uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get()
  async list() {
    return { uploads: await this.uploads.list() };
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
