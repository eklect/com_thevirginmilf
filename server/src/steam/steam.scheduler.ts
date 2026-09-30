import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SteamService } from './steam.service';

/** 09:00 UTC — the small hours in North America, when nobody is mid-session. */
const DAILY_SYNC = '0 9 * * *';

/**
 * Refreshes the library once a day, so playtime — and with it the automatic
 * half of the favorites list — stays current without anybody pressing a
 * button. A no-op until Steam is connected.
 */
@Injectable()
export class SteamScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SteamScheduler.name);

  constructor(private readonly steam: SteamService) {}

  onApplicationBootstrap(): void {
    this.logger.log(`Daily Steam sync armed (${DAILY_SYNC} UTC).`);
  }

  @Cron(DAILY_SYNC, { name: 'steam-daily-sync', timeZone: 'UTC' })
  async daily(): Promise<void> {
    try {
      if (await this.steam.isConnected()) this.steam.startSync();
    } catch (error) {
      // Never let this escape: an unhandled rejection out of a scheduled job
      // takes the process down.
      this.logger.error(
        `Daily Steam sync could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
