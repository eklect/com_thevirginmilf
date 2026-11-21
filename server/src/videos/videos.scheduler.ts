import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VideosService } from './videos.service';

/** Twice an hour, at :07 and :37 — off the minute the other jobs share. */
const VIDEO_SYNC = '7,37 * * * *';

/**
 * Keeps the Live page's videos current: a broadcast that just ended is on
 * the list within half an hour, and one Twitch expired leaves it. A no-op
 * until a key and a channel handle are in.
 */
@Injectable()
export class VideosScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(VideosScheduler.name);

  constructor(private readonly videos: VideosService) {}

  onApplicationBootstrap(): void {
    this.logger.log(`Video sync armed (${VIDEO_SYNC} UTC).`);
  }

  @Cron(VIDEO_SYNC, { name: 'video-sync', timeZone: 'UTC' })
  async tick(): Promise<void> {
    try {
      if (await this.videos.isConfigured()) this.videos.startSync();
    } catch (error) {
      // Never let this escape: an unhandled rejection out of a scheduled job
      // takes the process down.
      this.logger.error(
        `Video sync could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
