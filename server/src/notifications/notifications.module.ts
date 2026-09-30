import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushModule } from '../push/push.module';
import { SettingsModule } from '../settings/settings.module';
import { StreamEventEntity } from '../streams/stream-event.entity';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { StreamAlertsScheduler } from './stream-alerts.scheduler';

/**
 * Where a stream becomes email and push. The mail queue is global; the push
 * queue and both recipient lists are imported.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StreamEventEntity]),
    SettingsModule,
    SubscribersModule,
    PushModule,
  ],
  providers: [StreamAlertsScheduler],
})
export class NotificationsModule {}
