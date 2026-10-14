import { MailQueueService } from './mail-queue.service';
import { MailConfig } from './mail.config';
import { MailTransport } from './mail.transport';
import { OutboundEmailEntity, OutboundKind } from './outbound-email.entity';
import { MapOptoutsService } from '../map-optouts/map-optouts.service';

/** The drain's veto: opt-out-able kinds stop for an opted-out sub; essential mail does not. */
describe('MailQueueService drain veto', () => {
  const row = (kind: string, userId: string | null): OutboundEmailEntity =>
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

  async function drain(batch: OutboundEmailEntity[]) {
    const updates: Record<string, Partial<OutboundEmailEntity>> = {};
    const qb = {
      update: () => qb,
      set: () => qb,
      where: () => qb,
      execute: () => Promise.resolve({}),
    };
    const repo = {
      update: jest.fn(
        (criteria: unknown, patch: Partial<OutboundEmailEntity>) => {
          if (typeof criteria === 'string') updates[criteria] = patch;
          return Promise.resolve({ affected: 0 });
        },
      ),
      find: jest
        .fn()
        .mockResolvedValueOnce(batch.map((r) => ({ id: r.id })))
        .mockResolvedValueOnce(batch),
      createQueryBuilder: () => qb,
    };
    const transport = { send: jest.fn().mockResolvedValue('logged') };
    const optouts = {
      optedOutSet: jest.fn().mockResolvedValue(new Set(['opted-out'])),
    };
    const service = new MailQueueService(
      repo as never,
      transport as unknown as MailTransport,
      { batchSize: 10 } as MailConfig,
      optouts as unknown as MapOptoutsService,
    );
    await service.drain();
    return { updates, transport };
  }

  it.each(['welcome', 'stream_announced', 'stream_reminder'])(
    'skips %s for an opted-out sub and sends it to everyone else',
    async (kind) => {
      const { updates, transport } = await drain([
        row(kind, 'opted-out'),
        row(kind, 'someone-else'),
      ]);
      expect(updates[`${kind}-opted-out`]).toMatchObject({
        status: 'skipped',
        lastError: 'map_opt_out',
      });
      expect(updates[`${kind}-someone-else`]).toMatchObject({
        status: 'logged',
      });
      expect(transport.send).toHaveBeenCalledTimes(1);
    },
  );

  it('never vetoes an essential kind', async () => {
    // This venture queues no essential mail of its own (MAP sends its
    // password reset), so the kind is forced: the rule is the drain's.
    const { updates, transport } = await drain([
      row('password_reset', 'opted-out'),
    ]);
    expect(updates['password_reset-opted-out']).toMatchObject({
      status: 'logged',
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
