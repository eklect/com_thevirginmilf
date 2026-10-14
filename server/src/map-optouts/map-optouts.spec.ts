import { ConfigService } from '@nestjs/config';
import { FindOperator } from 'typeorm';
import { MailQueueService } from '../mail/mail-queue.service';
import { MailConfig } from '../mail/mail.config';
import { MailTransport } from '../mail/mail.transport';
import {
  OutboundEmailEntity,
  OutboundKind,
} from '../mail/outbound-email.entity';
import { MapClientService } from '../map-client/map-client.service';
import { OutboundPushEntity } from '../push/outbound-push.entity';
import { PushConfig } from '../push/push.config';
import { PushQueueService } from '../push/push-queue.service';
import { PushSubscriptionsService } from '../push/push-subscriptions.service';
import { PushTransport } from '../push/push.transport';
import { MapOptoutEntity } from './map-optout.entity';
import { MapOptoutsService } from './map-optouts.service';

/**
 * An email unsubscribe stops opt-out-able EMAIL only; an App Directory
 * removal stops mail AND push. `map_optouts.removed` is what tells them apart.
 */

const UNSUBSCRIBED = 'sub-unsubscribed'; // in the feed's `subs` only
const REMOVED = 'sub-removed'; // in `subs` and `removed`
const EVERYONE_ELSE = 'sub-everyone-else'; // not in the feed

/** Just enough of a TypeORM repository over an array to run the real service. */
function fakeOptoutRepo(rows: MapOptoutEntity[] = []) {
  const matches = (row: MapOptoutEntity, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, want]) => {
      const have = (row as unknown as Record<string, unknown>)[key];
      return want instanceof FindOperator
        ? (want.value as unknown[]).includes(have)
        : have === want;
    });
  return {
    rows,
    find: jest.fn(async (opts: { where?: Record<string, unknown> } = {}) =>
      rows.filter((row) => matches(row, opts.where)).map((row) => ({ ...row })),
    ),
    count: jest.fn(
      async (opts: { where?: Record<string, unknown> } = {}) =>
        rows.filter((row) => matches(row, opts.where)).length,
    ),
    delete: jest.fn(async (where: Record<string, unknown>) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (matches(rows[i], where)) rows.splice(i, 1);
      }
      return {};
    }),
    update: jest.fn(
      async (
        where: Record<string, unknown>,
        patch: Partial<MapOptoutEntity>,
      ) => {
        for (const row of rows)
          if (matches(row, where)) Object.assign(row, patch);
        return {};
      },
    ),
    createQueryBuilder: () => {
      const qb = {
        insert: () => qb,
        into: () => qb,
        values: (values: MapOptoutEntity[]) => {
          for (const value of values) {
            if (!rows.some((row) => row.userId === value.userId))
              rows.push({ ...value });
          }
          return qb;
        },
        orIgnore: () => qb,
        execute: async () => ({}),
      };
      return qb;
    },
  };
}

async function syncedService() {
  const repo = fakeOptoutRepo();
  const service = new MapOptoutsService(repo as never);
  await service.replaceAll(
    [UNSUBSCRIBED, REMOVED],
    new Date('2026-10-14T00:00:00Z'),
    [REMOVED],
  );
  return { repo, service };
}

describe('MapOptoutsService — mail and push read different sets', () => {
  it('stores the removed flag from the feed and answers each question', async () => {
    const { repo, service } = await syncedService();

    expect(repo.rows.map((row) => [row.userId, row.removed]).sort()).toEqual([
      [REMOVED, true],
      [UNSUBSCRIBED, false],
    ]);
    expect(await service.optedOutSet()).toEqual(
      new Set([UNSUBSCRIBED, REMOVED]),
    );
    expect(await service.removedSet()).toEqual(new Set([REMOVED]));
    expect(await service.isOptedOut(UNSUBSCRIBED)).toBe(true);
    expect(await service.isRemoved(UNSUBSCRIBED)).toBe(false);
    expect(await service.isRemoved(REMOVED)).toBe(true);
    expect(await service.isOptedOut(EVERYONE_ELSE)).toBe(false);
  });

  it('moves the flag when a person re-installs but stays unsubscribed, and drops who left the feed', async () => {
    const { repo, service } = await syncedService();

    const result = await service.replaceAll([REMOVED], new Date(), []);

    expect(result).toEqual({ added: 0, removed: 1, flagged: 1, total: 1 });
    expect(repo.rows.map((row) => [row.userId, row.removed])).toEqual([
      [REMOVED, false],
    ]);
    expect(await service.removedSet()).toEqual(new Set());
  });

  it('ignores a removed sub that is not in subs', async () => {
    const repo = fakeOptoutRepo();
    const service = new MapOptoutsService(repo as never);
    await service.replaceAll([UNSUBSCRIBED], new Date(), [
      UNSUBSCRIBED,
      'stray',
    ]);
    expect(repo.rows.map((row) => row.userId)).toEqual([UNSUBSCRIBED]);
  });
});

describe('the drains: unsubscribe stops email only, removal stops both', () => {
  async function drainMail(
    optouts: MapOptoutsService,
    batch: OutboundEmailEntity[],
  ) {
    const updates: Record<string, Partial<OutboundEmailEntity>> = {};
    const qb = {
      update: () => qb,
      set: () => qb,
      where: () => qb,
      execute: async () => ({}),
    };
    const repo = {
      update: jest.fn(
        async (criteria: unknown, patch: Partial<OutboundEmailEntity>) => {
          if (typeof criteria === 'string') updates[criteria] = patch;
          return { affected: 0 };
        },
      ),
      find: jest
        .fn()
        .mockResolvedValueOnce(batch.map((r) => ({ id: r.id })))
        .mockResolvedValueOnce(batch),
      createQueryBuilder: () => qb,
    };
    const transport = { send: jest.fn().mockResolvedValue('logged') };
    const service = new MailQueueService(
      repo as never,
      transport as unknown as MailTransport,
      { batchSize: 10 } as MailConfig,
      optouts,
    );
    await service.drain();
    return updates;
  }

  async function drainPush(
    optouts: MapOptoutsService,
    batch: OutboundPushEntity[],
  ) {
    const updates: Record<string, Partial<OutboundPushEntity>> = {};
    const qb = {
      update: () => qb,
      set: () => qb,
      where: () => qb,
      execute: async () => ({}),
    };
    const repo = {
      update: jest.fn(
        async (criteria: unknown, patch: Partial<OutboundPushEntity>) => {
          if (typeof criteria === 'string') updates[criteria] = patch;
          return { affected: 0 };
        },
      ),
      find: jest
        .fn()
        .mockResolvedValueOnce(batch.map((r) => ({ id: r.id })))
        .mockResolvedValueOnce(batch),
      createQueryBuilder: () => qb,
    };
    const transport = { send: jest.fn().mockResolvedValue('logged') };
    const subscriptions = { markDelivered: jest.fn(), markFailed: jest.fn() };
    const service = new PushQueueService(
      repo as never,
      subscriptions as unknown as PushSubscriptionsService,
      transport as unknown as PushTransport,
      { batchSize: 10 } as PushConfig,
      optouts,
    );
    await service.drain();
    return updates;
  }

  const mail = (kind: string, userId: string) =>
    ({
      id: `${kind}-${userId}`,
      kind: kind as OutboundKind,
      userId,
      toEmail: 'a@example.test',
      fromAddress: null,
      subject: 's',
      bodyText: 't',
      bodyHtml: '<p>t</p>',
      headers: null,
      attempts: 1,
      maxAttempts: 5,
    }) as OutboundEmailEntity;

  const push = (userId: string) =>
    ({
      id: `push-${userId}`,
      kind: 'stream_announced',
      userId,
      subscription: { id: `device-${userId}` },
      payload: { title: 't', body: 'b', url: '/' },
      expiresAt: new Date(Date.now() + 3_600_000),
      attempts: 1,
      maxAttempts: 5,
    }) as unknown as OutboundPushEntity;

  it('an unsubscribed-only sub gets push but no opt-out-able mail', async () => {
    const { service } = await syncedService();
    const mailUpdates = await drainMail(service, [
      mail('stream_announced', UNSUBSCRIBED),
    ]);
    const pushUpdates = await drainPush(service, [push(UNSUBSCRIBED)]);

    expect(mailUpdates[`stream_announced-${UNSUBSCRIBED}`]).toMatchObject({
      status: 'skipped',
      lastError: 'map_opt_out',
    });
    expect(pushUpdates[`push-${UNSUBSCRIBED}`]).toMatchObject({
      status: 'logged',
    });
  });

  it('a removed sub gets neither', async () => {
    const { service } = await syncedService();
    const mailUpdates = await drainMail(service, [
      mail('stream_reminder', REMOVED),
    ]);
    const pushUpdates = await drainPush(service, [push(REMOVED)]);

    expect(mailUpdates[`stream_reminder-${REMOVED}`]).toMatchObject({
      status: 'skipped',
    });
    expect(pushUpdates[`push-${REMOVED}`]).toMatchObject({
      status: 'skipped',
      lastError: 'map_opt_out',
    });
  });

  it('essential mail is unaffected by either', async () => {
    // This venture queues no essential mail of its own; the kind is forced,
    // because the rule is the drain's.
    const { service } = await syncedService();
    const updates = await drainMail(service, [
      mail('password_reset', UNSUBSCRIBED),
      mail('password_reset', REMOVED),
    ]);
    expect(updates[`password_reset-${UNSUBSCRIBED}`]).toMatchObject({
      status: 'logged',
    });
    expect(updates[`password_reset-${REMOVED}`]).toMatchObject({
      status: 'logged',
    });
  });

  it('the push fan-out leaves out removals only', async () => {
    const { service } = await syncedService();
    const devices = [UNSUBSCRIBED, REMOVED, EVERYONE_ELSE].map((userId) => ({
      userId,
    }));
    const subscriptions = new PushSubscriptionsService(
      { find: jest.fn().mockResolvedValue(devices) } as never,
      service,
    );
    expect((await subscriptions.listAll()).map((row) => row.userId)).toEqual([
      UNSUBSCRIBED,
      EVERYONE_ELSE,
    ]);
  });
});

describe('MapClientService.listOptOuts — the removed list', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function client(page: unknown) {
    global.fetch = jest.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/oauth/token')
        ? new Response(
            JSON.stringify({
              access_token: 't',
              expires_in: 900,
              token_type: 'Bearer',
              scope: 'installs:read',
            }),
          )
        : new Response(JSON.stringify(page)),
    ) as typeof fetch;
    return new MapClientService(
      new ConfigService({
        MAP_INTERNAL_URL: 'http://map.test',
        MAP_CLIENT_ID: 'id',
        MAP_CLIENT_SECRET: 'secret',
      }),
    );
  }

  it('passes the feed’s removed list through', async () => {
    const page = await client({
      asOf: '2026-10-14T00:00:00.000Z',
      subs: [UNSUBSCRIBED, REMOVED],
      removed: [REMOVED],
      next: null,
    }).listOptOuts(null);
    expect(page.subs).toEqual([UNSUBSCRIBED, REMOVED]);
    expect(page.removed).toEqual([REMOVED]);
  });

  it('reads a MAP without the field as "everyone removed", so push stays vetoed as before', async () => {
    const page = await client({
      asOf: '2026-10-14T00:00:00.000Z',
      subs: [UNSUBSCRIBED, REMOVED],
      next: null,
    }).listOptOuts(null);
    expect(page.removed).toEqual([UNSUBSCRIBED, REMOVED]);
  });
});
