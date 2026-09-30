import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { OutboundPushEntity } from './outbound-push.entity';
import { PushQueueScheduler } from './push-queue.scheduler';
import { PushQueueService } from './push-queue.service';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushConfig } from './push.config';
import { PushController } from './push.controller';
import { PushTransport } from './push.transport';

/**
 * Web Push: who asked for notifications, and the queue that delivers them.
 *
 * Features enqueue; nothing but the scheduler sends. Requires
 * `ScheduleModule.forRoot()` in the app module.
 */
@Module({
  // SettingsModule is not optional: `PushController` is behind
  // `PageEnabledGuard('settings')`, and that guard injects `SettingsService`.
  imports: [TypeOrmModule.forFeature([PushSubscriptionEntity, OutboundPushEntity]), SettingsModule],
  controllers: [PushController],
  providers: [
    PushConfig,
    PushTransport,
    PushSubscriptionsService,
    PushQueueService,
    PushQueueScheduler,
  ],
  exports: [PushConfig, PushSubscriptionsService, PushQueueService],
})
export class PushModule {}
