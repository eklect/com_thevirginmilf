import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MapOptoutEntity } from './map-optout.entity';

/** Rows per `IN (…)` when deleting or updating; keeps the statement a sane size. */
const CHUNK = 500;

/**
 * Reads and replaces the local mirror of MAP's opt-out list.
 *
 * Two questions, because the feed holds two kinds of opt-out:
 *
 * - **Mail** — `isOptedOut` / `optedOutSet`: everyone in the table, i.e. who
 *   removed this venture in MAP's portal OR unsubscribed from its brand. An
 *   unsubscribe stops opt-out-able email.
 * - **Push** — `isRemoved` / `removedSet`: only the rows with `removed = 1`,
 *   the App Directory removals. An email unsubscribe does not stop push; a
 *   removal withdraws the venture's permission to contact the person at all.
 *
 * Readers: the schedulers that CHOOSE recipients
 * (`SubscribersService.listDeliverable` for mail,
 * `PushSubscriptionsService.listAll` for push) and the two queue drains that
 * check again at DELIVERY, because a row can sit in the queue across a sync.
 */
@Injectable()
export class MapOptoutsService {
  constructor(
    @InjectRepository(MapOptoutEntity)
    private readonly repo: Repository<MapOptoutEntity>,
  ) {}

  /** MAIL: removed this venture or unsubscribed from its brand. */
  async isOptedOut(sub: string): Promise<boolean> {
    if (!sub) return false;
    return (await this.repo.count({ where: { userId: sub } })) > 0;
  }

  /** MAIL: every opted-out `sub`, for a fan-out that checks hundreds at once. */
  async optedOutSet(): Promise<Set<string>> {
    const rows = await this.repo.find({ select: { userId: true } });
    return new Set(rows.map((row) => row.userId));
  }

  /** PUSH: removed this venture in MAP's portal (an unsubscribe alone is not enough). */
  async isRemoved(sub: string): Promise<boolean> {
    if (!sub) return false;
    return (
      (await this.repo.count({ where: { userId: sub, removed: true } })) > 0
    );
  }

  /** PUSH: every `sub` that removed this venture, for a batch. */
  async removedSet(): Promise<Set<string>> {
    const rows = await this.repo.find({
      select: { userId: true },
      where: { removed: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  /**
   * Makes the table equal to `subs`: inserts what is missing (stamped
   * `opted_out_at = asOf`), deletes what is no longer listed, and marks every
   * listed row as seen, with `removed` set from `removedSubs` — the feed's
   * App Directory removals, a subset of `subs`. The feed is a full list, so
   * this is a reconciliation, not a journal — a re-install simply stops
   * appearing and the row goes (or, if the person is still unsubscribed,
   * stays with `removed = 0`).
   *
   * Returns the net change, which is what the scheduler logs. `removed` in
   * the result is rows deleted; `flagged` is rows whose `removed` flag moved.
   */
  async replaceAll(
    subs: string[],
    asOf: Date,
    removedSubs: string[],
  ): Promise<{
    added: number;
    removed: number;
    flagged: number;
    total: number;
  }> {
    const wanted = [
      ...new Set(subs.filter((sub) => typeof sub === 'string' && sub)),
    ];
    const wantedSet = new Set(wanted);
    const removedSet = new Set(removedSubs.filter((sub) => wantedSet.has(sub)));
    const now = new Date();

    const existing = new Map(
      (await this.repo.find({ select: { userId: true, removed: true } })).map(
        (row) => [row.userId, Boolean(row.removed)],
      ),
    );
    const toAdd = wanted.filter((sub) => !existing.has(sub));
    const toRemove = [...existing.keys()].filter((sub) => !wantedSet.has(sub));
    const flagged = wanted.filter(
      (sub) => existing.has(sub) && existing.get(sub) !== removedSet.has(sub),
    ).length;

    if (toAdd.length) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(MapOptoutEntity)
        .values(
          toAdd.map((userId) => ({
            userId,
            removed: removedSet.has(userId),
            optedOutAt: asOf,
            syncedAt: now,
          })),
        )
        .orIgnore()
        .execute();
    }
    for (let i = 0; i < toRemove.length; i += CHUNK) {
      await this.repo.delete({ userId: In(toRemove.slice(i, i + CHUNK)) });
    }
    // Everything listed was seen this sync, and carries its current flag. The
    // rows just inserted have both already; re-stamping them is cheaper than
    // excluding them.
    const removedList = wanted.filter((sub) => removedSet.has(sub));
    const keptList = wanted.filter((sub) => !removedSet.has(sub));
    for (let i = 0; i < removedList.length; i += CHUNK) {
      await this.repo.update(
        { userId: In(removedList.slice(i, i + CHUNK)) },
        { syncedAt: now, removed: true },
      );
    }
    for (let i = 0; i < keptList.length; i += CHUNK) {
      await this.repo.update(
        { userId: In(keptList.slice(i, i + CHUNK)) },
        { syncedAt: now, removed: false },
      );
    }

    return {
      added: toAdd.length,
      removed: toRemove.length,
      flagged,
      total: wanted.length,
    };
  }
}
