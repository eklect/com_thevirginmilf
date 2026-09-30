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
import { CreateStreamDto, UpdateStreamDto } from '../streams/dto/stream.dto';
import { toAdminStreamView } from '../streams/streams.serializer';
import { StreamsService } from '../streams/streams.service';

/**
 * The stream calendar's write plane.
 *
 * Hand-written for the same reason `StreamsService` is: there is no
 * `sort_order` to reorder, so the generic factory's `PUT /order` route would
 * be a lie. The list is flat and latest-first; the public plane is the one
 * that cuts it into a calendar range.
 *
 * Saving a published stream is what notifies people — not here, but in
 * `StreamAlertsScheduler`, a couple of minutes after the last edit.
 */
@AdminOnly()
@Controller('admin/streams')
export class AdminStreamsController {
  constructor(private readonly streams: StreamsService) {}

  @Get()
  async list() {
    return { streams: (await this.streams.list()).map(toAdminStreamView) };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { stream: toAdminStreamView(await this.streams.get(id)) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStreamDto) {
    return { stream: toAdminStreamView(await this.streams.create(dto)) };
  }

  @Put(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStreamDto) {
    return { stream: toAdminStreamView(await this.streams.update(id, dto)) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.streams.remove(id);
  }
}
