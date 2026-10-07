import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { MapOptoutsService } from '../map-optouts/map-optouts.service';
import { OutboundPushEntity, PushKind, PushPayload } from './outbound-push.entity';
import { PushConfig } from './push.config';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushDeliveryError, PushTransport } from './push.transport';

/** One notification to enqueue. `dedupeKey` is what makes the enqueue replayable. */
export interface EnqueuePushRequest {
  kind: PushKind;
  dedupeKey: string;
  userId: string;
  subscriptionId: string;
  payload: PushPayload;
  /** Past this the notification is dropped rather than delivered late. */
  expiresAt: Date;
}

/** How long a claimed row may sit before the reaper assumes its process died. */
const STALE_CLAIM_MS = 10 * 60_000;

/** 1, 2, 4 … minutes. Short: a push that is an hour late is not worth sending. */
const backoffMinutes = (attempts: number): number =>
  Math.min(2 ** Math.max(attempts - 1, 0), 15);

/**
 * The push queue. Features call `enqueue`; only `PushQueueScheduler` calls
 * `drain`.
 *
 * The same protocol as `MailQueueService`, written out again rather than
 * shared: that file is kept identical across six repos, and a push differs in
 * the two places that matter — it can expire, and its recipient can vanish.
 */
@Injectable()
export class PushQueueService {
  private readonly logger = new Logger(PushQueueService.name);

  constructor(
    @InjectRepository(OutboundPushEntity)
    private readonly repo: Repository<OutboundPushEntity>,
    private readonly subscriptions: PushSubscriptionsService,
    private readonly transport: PushTransport,
    private readonly config: PushConfig,
    private readonly optouts: MapOptoutsService,
  ) {}

  /** Adds notifications, ignoring any whose `dedupeKey` is already present. */
  async enqueue(requests: EnqueuePushRequest[]): Promise<number> {
    if (!requests.length) return 0;
    const now = new Date();
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(OutboundPushEntity)
      .values(
        requests.map((request) => ({
          id: randomUUID(),
          kind: request.kind,
          dedupeKey: request.dedupeKey,
          userId: request.userId,
          subscriptionId: request.subscriptionId,
          payload: request.payload,
          expiresAt: request.expiresAt,
          status: 'pending' as const,
          nextAttemptAt: now,
        })),
      )
      .orIgnore()
      .execute();

    const affected = (result.raw as { affectedRows?: number } | undefined)?.affectedRows;
    return typeof affected === 'number' ? affected : requests.length;
  }

  /** Sends one batch. Returns how many notifications were attempted. */
  async drain(): Promise<number> {
    await this.reapStaleClaims();
    const now = new Date();

    // Anything whose moment has passed is closed out before the claim, so a
    // backlog after an outage does not arrive as a burst of stale news.
    await this.repo.update(
      { status: 'pending', expiresAt: LessThan(now) },
      { status: 'expired', lastError: 'Expired before it could be delivered.' },
    );

    const due = await this.repo.find({
      select: { id: true },
      where: { status: 'pending', nextAttemptAt: LessThanOrEqual(now) },
      order: { nextAttemptAt: 'ASC' },
      take: this.config.batchSize,
    });
    if (!due.length) return 0;

    const claimId = randomUUID();
    await this.repo
      .createQueryBuilder()
      .update(OutboundPushEntity)
      .set({
        status: 'sending',
        claimId,
        claimedAt: now,
        attempts: () => 'attempts + 1',
      })
      .where({ id: In(due.map((row) => row.id)), status: 'pending' })
      .execute();

    const batch = await this.repo.find({ where: { claimId }, relations: { subscription: true } });
    // Every push is a stream alert, so every row is subject to the MAP
    // opt-out — checked here as well as at the fan-out, because a person can
    // remove the venture while the row waits. One read for the batch.
    const vetoed = batch.length ? await this.optouts.optedOutSet() : new Set<string>();
    for (const row of batch) await this.deliver(row, vetoed);
    return batch.length;
  }

  private async deliver(row: OutboundPushEntity, vetoed: Set<string>): Promise<void> {
    const subscription = row.subscription;
    if (!subscription) return; // Deleted since the claim; the cascade took the row.

    if (vetoed.has(row.userId)) {
      await this.repo.update(row.id, {
        status: 'skipped',
        claimId: null,
        claimedAt: null,
        lastError: 'map_opt_out',
      });
      return;
    }

    try {
      const ttlSeconds = (row.expiresAt.getTime() - Date.now()) / 1000;
      const outcome = await this.transport.send(subscription, row.payload, ttlSeconds);
      await this.repo.update(row.id, {
        status: outcome,
        sentAt: new Date(),
        claimId: null,
        claimedAt: null,
        lastError: null,
      });
      if (outcome === 'sent') await this.subscriptions.markDelivered(subscription.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof PushDeliveryError && error.gone) {
        // The browser is no longer subscribed. Deleting the subscription
        // deletes this row with it — there is nobody left to retry for.
        await this.subscriptions.removeGone(subscription.id);
        return;
      }

      const permanent = error instanceof PushDeliveryError && error.permanent;
      const dead = permanent || row.attempts >= row.maxAttempts;
      await this.repo.update(row.id, {
        status: dead ? 'dead' : 'pending',
        claimId: null,
        claimedAt: null,
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoffMinutes(row.attempts) * 60_000),
      });
      await this.subscriptions.markFailed(subscription.id);
      if (dead) {
        this.logger.error(
          `Giving up on ${row.kind} ${row.id} after ${row.attempts} attempt(s): ${message}`,
        );
      }
    }
  }

  private async reapStaleClaims(): Promise<void> {
    const result = await this.repo.update(
      { status: 'sending', claimedAt: LessThan(new Date(Date.now() - STALE_CLAIM_MS)) },
      { status: 'pending', claimId: null, claimedAt: null },
    );
    if (result.affected) {
      this.logger.warn(`Reclaimed ${result.affected} stale notification(s) from a previous run.`);
    }
  }

  async counts(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('push')
      .select('push.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('push.status')
      .getRawMany<{ status: string; count: string }>();
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }
}
