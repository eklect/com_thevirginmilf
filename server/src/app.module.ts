import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthSessionModule } from './auth/auth-session.module';
import { CategoriesModule } from './categories/categories.module';
import { ChannelsModule } from './channels/channels.module';
import { AuthModule } from './common/auth/auth.module';
import { StorageModule } from './common/storage/storage.module';
import { buildTypeOrmOptions } from './database/typeorm.options';
import { GamesModule } from './games/games.module';
import { HealthController } from './health.controller';
import { MailModule } from './mail/mail.module';
import { MapClientModule } from './map-client/map-client.module';
import { MapOptoutsModule } from './map-optouts/map-optouts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { RegisterModule } from './register/register.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SettingsModule } from './settings/settings.module';
import { SiteModule } from './site/site.module';
import { SteamModule } from './steam/steam.module';
import { StreamsModule } from './streams/streams.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { UploadsModule } from './uploads/uploads.module';
import { ServiceAuthModule } from './service-auth/service-auth.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    // Registers every `@Cron` job: the stream alert sweep, the two queue
    // drains, the MAP opt-out sync and the daily Steam sync. Each logs from
    // `onApplicationBootstrap`, because this module does not populate its
    // registry until its own bootstrap hook runs.
    ScheduleModule.forRoot(),

    // Cross-cutting: the relying-party half of MAP, the guards, file storage,
    // the service-plane client that creates accounts at signup, the mirror of
    // who opted out of this venture at MAP, and the two outbound queues.
    AuthSessionModule,
    AuthModule,
    StorageModule,
    MapClientModule,
    MapOptoutsModule,
    SubscribersModule,
    MailModule,
    PushModule,

    // Content.
    SettingsModule,
    ChannelsModule,
    StreamsModule,
    GamesModule,
    CategoriesModule,
    ReviewsModule,
    SteamModule,
    UploadsModule,

    // Surfaces: the public read plane, signup, the admin write plane, and the
    // scheduler that turns a published stream into email and push.
    SiteModule,
    RegisterModule,
    AdminModule,
    NotificationsModule,

    // API keys for other servers (/admin/api-access, /service/oauth/token) and
    // the email-template service plane the My Company Tools app edits through.
    ServiceAuthModule,
    EmailTemplatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
