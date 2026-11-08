import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { GamesModule } from '../games/games.module';
import { PushModule } from '../push/push.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SettingsModule } from '../settings/settings.module';
import { SiteSettingEntity } from '../settings/site-setting.entity';
import { CalendarFeedTokenEntity } from '../streams/calendar-feed-token.entity';
import { StreamExportService } from '../streams/export.service';
import { StreamEventEntity } from '../streams/stream-event.entity';
import { StreamsModule } from '../streams/streams.module';
import { CalendarExportController, CalendarFeedPublicController, StreamExportController } from './calendar-export.controller';
import { SiteController } from './site.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarFeedTokenEntity, StreamEventEntity, SiteSettingEntity]),
    SettingsModule,
    ChannelsModule,
    StreamsModule,
    GamesModule,
    CategoriesModule,
    ReviewsModule,
    PushModule,
  ],
  controllers: [StreamExportController, SiteController, CalendarExportController, CalendarFeedPublicController],
  providers: [StreamExportService],
})
export class SiteModule {}
