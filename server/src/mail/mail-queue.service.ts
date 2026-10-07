import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { MapOptoutsService } from '../map-optouts/map-optouts.service';
import { MailConfig } from './mail.config';
import { MailDeliveryError, MailTransport } from './mail.transport';
import { MARKETING_KINDS, OutboundEmailEntity, OutboundKind } from './outbound-email.entity';
import { RenderedEmail } from './templates/layout';

/** One message to enqueue. `dedupeKey` is what makes the enqueue replayable. */
export interface EnqueueRequest {
  kind: OutboundKind;
  dedupeKey: string;
  userId?: string | null;
  toEmail: string;
  fromAddress?: string | null;
  email: RenderedEmail;
  headers?: Record<string, string> | null;
}

/** How long a claimed row may sit before the reaper assumes its process died. */
const STALE_CLAIM_MS = 15 * 60_000;

/** 1, 2, 4, 8, 16 … minutes, capped at an hour. */
const backoffMinutes = (attempts: number): number =>
  Math.min(2 ** Math.max(attempts - 1, 0), 60);

/**
 * The outbound queue. Features call `enqueue`; only `MailQueueScheduler` calls
 * `drain`.
 *
 * Every date comparison is made against a `Date` computed here rather than the
 * database's `NOW()`, and the claim is `SELECT` ids then `UPDATE … WHERE id IN
 * (…) AND status = 'pending'` rather than `UPDATE … LIMIT`. Both are so the
 * same file runs on MySQL and on the sqlite used by e2e harnesses, and the
 * `status = 'pending'` condition is the compare-and-swap that keeps two
 * drains from taking the same row.
 */
@Injectable()
export class MailQueueService {
  private readonly logger = new Logger(MailQueueService.name);

  constructor(
    @InjectRepository(OutboundEmailEntity)
    private readonly repo: Repository<OutboundEmailEntity>,
    private readonly transport: MailTransport,
    private readonly config: MailConfig,
    private readonly optouts: MapOptoutsService,
  ) {}

  /**
   * Adds messages, ignoring any whose `dedupeKey` is already present.
   *
   * Returns how many rows were new where the driver reports it (MySQL's
   * `affectedRows`), which is what a caller should log — not the batch size,
   * which on a replay would claim everybody was emailed again.
   */
  async enqueue(requests: EnqueueRequest | EnqueueRequest[]): Promise<number> {
    const list = Array.isArray(requests) ? requests : [requests];
    if (!list.length) return 0;

    const now = new Date();
    const rows = list.map((request) => ({
      id: randomUUID(),
      kind: request.kind,
      dedupeKey: request.dedupeKey,
      userId: request.userId ?? null,
      toEmail: request.toEmail,
      fromAddress: request.fromAddress ?? null,
      subject: request.email.subject,
      bodyText: request.email.text,
      bodyHtml: request.email.html,
      headers: request.headers ?? null,
      status: 'pending' as const,
      nextAttemptAt: now,
    }));

    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(OutboundEmailEntity)
      .values(rows)
      .orIgnore()
      .execute();

    const affected = (result.raw as { affectedRows?: number } | undefined)?.affectedRows;
    return typeof affected === 'number' ? affected : rows.length;
  }

  /** Sends one batch. Returns how many messages were attempted. */
  async drain(): Promise<number> {
    await this.reapStaleClaims();

    const now = new Date();
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
      .update(OutboundEmailEntity)
      .set({
        status: 'sending',
        claimId,
        claimedAt: now,
        attempts: () => 'attempts + 1',
      })
      .where({ id: In(due.map((row) => row.id)), status: 'pending' })
      .execute();

    const batch = await this.repo.find({ where: { claimId } });
    // The opt-out check at delivery, as well as at selection: a row can sit in
    // the queue across a sync, and a person who removed the venture after the
    // fan-out must still not hear from it. One read for the batch.
    const vetoed = batch.some((row) => MARKETING_KINDS.includes(row.kind))
      ? await this.optouts.optedOutSet()
      : new Set<string>();
    for (const row of batch) await this.deliver(row, vetoed);
    return batch.length;
  }

  private async deliver(row: OutboundEmailEntity, vetoed: Set<string>): Promise<void> {
    if (MARKETING_KINDS.includes(row.kind) && row.userId && vetoed.has(row.userId)) {
      await this.repo.update(row.id, {
        status: 'skipped',
        claimId: null,
        claimedAt: null,
        lastError: 'map_opt_out',
      });
      return;
    }

    try {
      const outcome = await this.transport.send({
        to: row.toEmail,
        from: row.fromAddress,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
        headers: row.headers,
        kind: row.kind,
        outboundId: row.id,
      });
      await this.repo.update(row.id, {
        status: outcome,
        sentAt: new Date(),
        claimId: null,
        claimedAt: null,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof MailDeliveryError && error.permanent;
      const dead = permanent || row.attempts >= row.maxAttempts;
      await this.repo.update(row.id, {
        status: dead ? 'dead' : 'pending',
        claimId: null,
        claimedAt: null,
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoffMinutes(row.attempts) * 60_000),
      });
      if (dead) {
        this.logger.error(
          `Giving up on ${row.kind} ${row.id} to ${row.toEmail} after ${row.attempts} attempt(s): ${message}`,
        );
      }
    }
  }

  /**
   * Returns rows abandoned mid-send to the queue. Without this a process killed
   * between claiming a batch and finishing it strands those rows in `sending`.
   */
  private async reapStaleClaims(): Promise<void> {
    const result = await this.repo.update(
      { status: 'sending', claimedAt: LessThan(new Date(Date.now() - STALE_CLAIM_MS)) },
      { status: 'pending', claimId: null, claimedAt: null },
    );
    if (result.affected) {
      this.logger.warn(`Reclaimed ${result.affected} stale message(s) from a previous run.`);
    }
  }

  async counts(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('email')
      .select('email.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('email.status')
      .getRawMany<{ status: string; count: string }>();
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }
}
