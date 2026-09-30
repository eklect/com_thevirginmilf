import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PushQueueService } from './push-queue.service';
import { PushTransport } from './push.transport';

const DRAIN_SCHEDULE = '* * * * *';

/**
 * Drains `outbound_pushes` every minute.
 *
 * Armed when `PUSH_ENABLED` is off, for the reason the mail drain is: the
 * whole enqueue → drain path then runs with the log as its destination, so
 * switching push on is an env change and not the first run of untested code.
 */
@Injectable()
export class PushQueueScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PushQueueScheduler.name);
  private running = false;

  constructor(
    private readonly queue: PushQueueService,
    private readonly transport: PushTransport,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(
      `Push queue drain armed (${DRAIN_SCHEDULE}) — ` +
        (this.transport.canDeliver ? 'delivering through Web Push.' : 'logging only.'),
    );
  }

  @Cron(DRAIN_SCHEDULE, { name: 'push-queue-drain' })
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.queue.drain();
      if (count) this.logger.log(`Drained ${count} notification(s).`);
    } catch (error) {
      // An unhandled rejection out of a scheduled job takes the process down,
      // and a push failure must never stop the site.
      this.logger.error(
        `Push drain failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
