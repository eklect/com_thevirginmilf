import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { GamesModule } from '../games/games.module';
import { PushModule } from '../push/push.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SettingsModule } from '../settings/settings.module';
import { SteamModule } from '../steam/steam.module';
import { StreamsModule } from '../streams/streams.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import {
  AdminCategoriesController,
  AdminChannelsController,
} from './admin-collections.controllers';
import { AdminGamesController } from './admin-games.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSteamController } from './admin-steam.controller';
import { AdminStreamsController } from './admin-streams.controller';
import { AdminSubscribersController } from './admin-subscribers.controller';

/**
 * The write plane. Every controller here is `@AdminOnly()` at class level, so
 * a route added later cannot be forgotten open — and every route is under
 * `/admin/`, which is the path the dev box's `markdown_content` WAF exclusion
 * is scoped to. A prose-writing route anywhere else is refused by ModSecurity
 * before this process sees it.
 *
 * Note what is NOT here: `AdminUploadsController` is declared in
 * `UploadsModule`, not this one. Multer's options resolve per injector rather
 * than per controller, so moving it here would silently hand it the wrong
 * storage engine. `com_shapedpodcast` learned that the hard way.
 */
@Module({
  imports: [
    SettingsModule,
    ChannelsModule,
    CategoriesModule,
    StreamsModule,
    GamesModule,
    ReviewsModule,
    SteamModule,
    SubscribersModule,
    PushModule,
  ],
  controllers: [
    AdminStreamsController,
    AdminChannelsController,
    AdminGamesController,
    AdminCategoriesController,
    AdminReviewsController,
    AdminSteamController,
    AdminSubscribersController,
    AdminSettingsController,
  ],
})
export class AdminModule {}
