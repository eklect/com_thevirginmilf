import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MapOptoutEntity } from './map-optout.entity';

/** Rows per `IN (…)` when deleting; keeps the statement a sane size. */
const CHUNK = 500;

/**
 * Reads and replaces the local mirror of MAP's opt-out list. Two readers:
 * the schedulers that CHOOSE recipients (`SubscribersService.listDeliverable`,
 * `PushSubscriptionsService.listAll`) and the two queue drains that check
 * again at DELIVERY, because a row can sit in the queue across a sync.
 */
@Injectable()
export class MapOptoutsService {
  constructor(
    @InjectRepository(MapOptoutEntity)
    private readonly repo: Repository<MapOptoutEntity>,
  ) {}

  async isOptedOut(sub: string): Promise<boolean> {
    if (!sub) return false;
    return (await this.repo.count({ where: { userId: sub } })) > 0;
  }

  /** Every opted-out `sub`, for a fan-out that checks hundreds at once. */
  async optedOutSet(): Promise<Set<string>> {
    const rows = await this.repo.find({ select: { userId: true } });
    return new Set(rows.map((row) => row.userId));
  }

  /**
   * Makes the table equal to `subs`: inserts what is missing (stamped
   * `opted_out_at = asOf`), deletes what is no longer listed, and marks every
   * listed row as seen. The feed is a full list, so this is a reconciliation,
   * not a journal — a re-install simply stops appearing and the row goes.
   *
   * Returns the net change, which is what the scheduler logs.
   */
  async replaceAll(
    subs: string[],
    asOf: Date,
  ): Promise<{ added: number; removed: number; total: number }> {
    const wanted = [...new Set(subs.filter((sub) => typeof sub === 'string' && sub))];
    const now = new Date();

    const existing = new Set(
      (await this.repo.find({ select: { userId: true } })).map((row) => row.userId),
    );
    const toAdd = wanted.filter((sub) => !existing.has(sub));
    const wantedSet = new Set(wanted);
    const toRemove = [...existing].filter((sub) => !wantedSet.has(sub));

    if (toAdd.length) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(MapOptoutEntity)
        .values(toAdd.map((userId) => ({ userId, optedOutAt: asOf, syncedAt: now })))
        .orIgnore()
        .execute();
    }
    for (let i = 0; i < toRemove.length; i += CHUNK) {
      await this.repo.delete({ userId: In(toRemove.slice(i, i + CHUNK)) });
    }
    // Everything listed was seen this sync. The rows just inserted carry the
    // stamp already; re-stamping them is cheaper than excluding them.
    for (let i = 0; i < wanted.length; i += CHUNK) {
      await this.repo.update({ userId: In(wanted.slice(i, i + CHUNK)) }, { syncedAt: now });
    }

    return { added: toAdd.length, removed: toRemove.length, total: wanted.length };
  }
}
