import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEntity } from '../games/game.entity';
import { ReviewEntity } from './review.entity';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewEntity, GameEntity])],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
