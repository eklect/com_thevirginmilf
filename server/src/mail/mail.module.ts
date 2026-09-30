import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailConfig } from './mail.config';
import { MailQueueScheduler } from './mail-queue.scheduler';
import { MailQueueService } from './mail-queue.service';
import { MailTransport } from './mail.transport';
import { OutboundEmailEntity } from './outbound-email.entity';

/**
 * Transactional mail through SendGrid.
 *
 * The same module is carried by MAP, `com_simplicourt`, `com_simplicourt_app`,
 * `com_mycotools` and `com_mycotools_app`. Only `mail.config.ts`'s two
 * constants and the `templates/` differ; keep the rest identical so a fix in
 * one is a copy to the others. This copy differs in two more places, both
 * additive: `OUTBOUND_KINDS` carries the two stream alerts, and the layout has
 * a `footerLink` for their unsubscribe link. `MAIL_ENABLED` decides whether a venture's mail
 * is live — see `MailConfig`.
 *
 * Global so any feature can enqueue without importing it. Features enqueue;
 * nothing but the scheduler sends. Requires `ScheduleModule.forRoot()` in the
 * app module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboundEmailEntity])],
  providers: [MailConfig, MailTransport, MailQueueService, MailQueueScheduler],
  exports: [MailConfig, MailQueueService],
})
export class MailModule {}
