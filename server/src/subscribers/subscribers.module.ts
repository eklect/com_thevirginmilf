import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { SubscriberEntity } from './subscriber.entity';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  // SettingsModule is not optional here: `SubscribersController` is behind
  // `PageEnabledGuard('settings')`, and that guard injects `SettingsService`.
  imports: [TypeOrmModule.forFeature([SubscriberEntity]), SettingsModule],
  controllers: [SubscribersController, UnsubscribeController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
