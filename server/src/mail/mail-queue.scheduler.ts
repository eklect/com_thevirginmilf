import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailQueueService } from './mail-queue.service';
import { MailTransport } from './mail.transport';

const DRAIN_SCHEDULE = '* * * * *';

/**
 * Drains `outbound_emails` every minute.
 *
 * It stays armed when `MAIL_ENABLED` is off, on purpose: the drain then writes
 * each message to the log and marks it `logged`, so the whole enqueue → drain
 * path is exercised on a venture whose mail is not live yet. Turning mail on
 * is then an env change, not the first run of untested code.
 *
 * `@nestjs/schedule` will start a tick while the last is still running;
 * `running` stops one process stacking drains on itself. Across processes the
 * claim in `MailQueueService.drain` already keeps two drains off the same row.
 */
@Injectable()
export class MailQueueScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailQueueScheduler.name);
  private running = false;

  constructor(
    private readonly queue: MailQueueService,
    private readonly transport: MailTransport,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(
      `Mail queue drain armed (${DRAIN_SCHEDULE}) — ` +
        (this.transport.canDeliver ? 'delivering through SendGrid.' : 'logging only.'),
    );
  }

  @Cron(DRAIN_SCHEDULE, { name: 'mail-queue-drain' })
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.queue.drain();
      if (count) this.logger.log(`Drained ${count} message(s).`);
    } catch (error) {
      // An unhandled rejection out of a scheduled job takes the process down,
      // and a mail failure must never stop the site.
      this.logger.error(
        `Mail drain failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
