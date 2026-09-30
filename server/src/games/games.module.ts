import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../categories/category.entity';
import { GameCategoryEntity } from '../categories/game-category.entity';
import { ReviewEntity } from '../reviews/review.entity';
import { SettingsModule } from '../settings/settings.module';
import { UploadEntity } from '../uploads/upload.entity';
import { GameScreenshotEntity } from './game-screenshot.entity';
import { GameEntity } from './game.entity';
import { GamesService } from './games.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameEntity,
      GameScreenshotEntity,
      GameCategoryEntity,
      CategoryEntity,
      ReviewEntity,
      UploadEntity,
    ]),
    SettingsModule,
  ],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
