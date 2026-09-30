import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoryEntity } from './category.entity';
import { GameCategoryEntity } from './game-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity, GameCategoryEntity])],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
