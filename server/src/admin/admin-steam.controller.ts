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
import { GamesService } from '../games/games.service';
import { ConnectSteamDto } from '../steam/dto/steam.dto';
import { SteamService } from '../steam/steam.service';

/**
 * The Steam connection.
 *
 * No route here returns the API key, sealed or otherwise — `status` reports
 * that one is stored and whether it can still be read, and that is all the
 * screen needs. Replacing it is a fresh `PUT`.
 */
@AdminOnly()
@Controller('admin/steam')
export class AdminSteamController {
  constructor(
    private readonly steam: SteamService,
    private readonly games: GamesService,
  ) {}

  @Get()
  async status() {
    return { steam: await this.steam.status() };
  }

  /** Verifies the key and the profile against Steam, stores them, starts a sync. */
  @Put('connection')
  async connect(@Body() dto: ConnectSteamDto) {
    return { steam: await this.steam.connect(dto) };
  }

  @Delete('connection')
  async disconnect() {
    return { steam: await this.steam.disconnect() };
  }

  /**
   * 202: the sync has started, not finished. It runs for as long as the
   * library is large — poll `GET /admin/steam` for `sync.done` / `sync.total`.
   */
  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async sync() {
    return { steam: await this.steam.requestSync() };
  }

  /** One game's store page, fetched now. Short enough to wait for. */
  @Post('games/:id/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.steam.refreshGame(id);
    return this.games.adminGet(id);
  }
}
