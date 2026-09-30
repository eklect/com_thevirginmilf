import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from '../common/auth/auth.decorators';
import { MailQueueService } from '../mail/mail-queue.service';
import { PushQueueService } from '../push/push-queue.service';
import { PushSubscriptionsService } from '../push/push-subscriptions.service';
import { SubscribersService } from '../subscribers/subscribers.service';

/**
 * Who is being kept in the loop, read-only: the email list, how many browsers
 * have notifications on, and the state of both queues.
 *
 * Deliberately has no write routes. Somebody else's subscription is theirs:
 * they set it on their account page and they clear it from any email's
 * unsubscribe link. An admin button that could opt somebody IN would be the
 * one thing in this application capable of manufacturing consent, so it does
 * not exist.
 */
@AdminOnly()
@Controller('admin/subscribers')
export class AdminSubscribersController {
  constructor(
    private readonly subscribers: SubscribersService,
    private readonly queue: MailQueueService,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly pushQueue: PushQueueService,
  ) {}

  @Get()
  async list() {
    const [summary, subscribers, queue, push, pushQueue] = await Promise.all([
      this.subscribers.summary(),
      this.subscribers.list(),
      this.queue.counts(),
      this.pushSubscriptions.summary(),
      this.pushQueue.counts(),
    ]);
    return { summary, subscribers, queue, push, pushQueue };
  }
}
