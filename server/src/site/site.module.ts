import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { GamesModule } from '../games/games.module';
import { PushModule } from '../push/push.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SettingsModule } from '../settings/settings.module';
import { StreamsModule } from '../streams/streams.module';
import { SiteController } from './site.controller';

@Module({
  imports: [
    SettingsModule,
    ChannelsModule,
    StreamsModule,
    GamesModule,
    CategoriesModule,
    ReviewsModule,
    PushModule,
  ],
  controllers: [SiteController],
})
export class SiteModule {}
