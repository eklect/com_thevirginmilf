import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameScreenshotEntity } from '../games/game-screenshot.entity';
import { GameEntity } from '../games/game.entity';
import { GamesModule } from '../games/games.module';
import { SteamConnectionEntity } from './steam-connection.entity';
import { SteamClient } from './steam.client';
import { SteamScheduler } from './steam.scheduler';
import { SteamService } from './steam.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SteamConnectionEntity, GameEntity, GameScreenshotEntity]),
    GamesModule,
  ],
  providers: [SteamClient, SteamService, SteamScheduler],
  exports: [SteamService],
})
export class SteamModule {}
