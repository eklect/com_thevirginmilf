import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AdminOnly } from '../common/auth/auth.decorators';
import {
  AddVideoDto,
  SaveVideoConnectionDto,
  UpdateVideoDto,
} from '../videos/dto/video.dto';
import { toAdminVideoView } from '../videos/videos.serializer';
import { VideosService } from '../videos/videos.service';

/**
 * The Live page's videos: the Twitch and YouTube keys, the sync, and the list.
 *
 * No route returns a secret. `connection` reports whether each key is stored
 * and can still be read, and the Twitch Client ID (which is not a secret —
 * Twitch sends it in a header on every call). Replacing a key is a fresh PUT.
 */
@AdminOnly()
@Controller('admin/videos')
export class AdminVideosController {
  constructor(private readonly videos: VideosService) {}

  @Get('connection')
  async status() {
    return { connection: await this.videos.status() };
  }

  /** Verifies whatever keys were sent against their platform, stores them, starts a sync. */
  @Put('connection')
  async save(@Body() dto: SaveVideoConnectionDto) {
    return { connection: await this.videos.saveConnection(dto) };
  }

  /** 202: started, not finished. Poll `GET connection` for `sync.running`. */
  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async sync() {
    return { connection: await this.videos.requestSync() };
  }

  @Get()
  async list() {
    return { videos: (await this.videos.adminList()).map(toAdminVideoView) };
  }

  /** A pasted link. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(@Body() dto: AddVideoDto) {
    return { video: toAdminVideoView(await this.videos.addCustom(dto)) };
  }

  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return { video: toAdminVideoView(await this.videos.update(id, dto)) };
  }

  /** Pasted links only; a synced video is hidden instead. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.videos.remove(id);
  }
}
