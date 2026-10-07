import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MapAccessDeniedError, MapClientService } from '../map-client/map-client.service';
import { MapOptoutsService } from './map-optouts.service';

const SYNC_SCHEDULE = '*/5 * * * *';

/** Pages per sync before it is assumed MAP is handing back a loop. */
const MAX_PAGES = 100;

/**
 * Mirrors MAP's opt-out feed into `map_optouts` every five minutes.
 *
 * The feed is the whole list each time (ordered by `sub`, paged by `after`),
 * so a sync is a reconciliation: what MAP lists is what the table holds when
 * it finishes. It is deliberately not a journal of changes — a full list
 * self-heals after any missed tick, and the sizes involved are hundreds.
 *
 * ## An error keeps the last good set
 *
 * If MAP is unreachable, or this venture has not yet been granted
 * `installs:read` (the token endpoint refuses the scope), nothing is written:
 * the previous sync stands. Clearing the table on an error would turn an
 * outage into "nobody has opted out", which is the one outcome this exists to
 * prevent. The missing grant is logged once, not every five minutes.
 *
 * `running` is the mail queue's latch: `@nestjs/schedule` will start a tick
 * while the last one is still paging, and nothing here throws out of the job.
 */
@Injectable()
export class MapOptoutsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MapOptoutsScheduler.name);
  private running = false;
  private deniedWarned = false;

  constructor(
    private readonly mapClient: MapClientService,
    private readonly optouts: MapOptoutsService,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(`MAP opt-out sync armed (${SYNC_SCHEDULE}).`);
    // A first pass at boot, so a fresh process is not five minutes behind.
    void this.sync();
  }

  @Cron(SYNC_SCHEDULE, { name: 'map-optouts-sync' })
  async sync(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const subs: string[] = [];
      let asOf: Date | null = null;
      let after: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await this.mapClient.listOptOuts(after);
        subs.push(...result.subs);
        asOf ??= new Date(result.asOf);
        after = result.next;
        if (!after) break;
      }
      if (after) {
        this.logger.error(
          `MAP opt-out feed did not end after ${MAX_PAGES} pages; keeping the last synced set.`,
        );
        return;
      }

      const stamp = asOf && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
      const { added, removed, total } = await this.optouts.replaceAll(subs, stamp);
      if (added || removed) {
        this.logger.log(
          `MAP opt-outs synced: ${total} total (+${added} / -${removed}).`,
        );
      }
      this.deniedWarned = false;
    } catch (error) {
      if (error instanceof MapAccessDeniedError) {
        if (!this.deniedWarned) {
          this.deniedWarned = true;
          this.logger.warn(
            `MAP did not serve the opt-out feed (${error.upstreamStatus}): this application ` +
              'needs the `installs:read` service scope, and MAP must expose ' +
              '/api/service/applications/me/opt-outs. Keeping the last synced set until then. ' +
              error.detail,
          );
        }
        return;
      }
      // Never let this escape: an unhandled rejection out of a scheduled job
      // takes the process down, and a failed sync must never stop the site.
      this.logger.error(
        `MAP opt-out sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
