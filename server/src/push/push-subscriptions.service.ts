import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { SavePushSubscriptionDto } from './dto/push.dto';
import { PushSubscriptionEntity } from './push-subscription.entity';

/** More browsers than this on one account is a loop, not a person. */
const MAX_DEVICES_PER_USER = 10;

/**
 * The push services this server will deliver to.
 *
 * A subscription's `endpoint` is a URL the BROWSER supplies and this server
 * then POSTs to — and signup is open to anyone. Without a list, any account
 * could point the API at `http://map.mucciandco.internal` or a cloud metadata
 * address and have it make requests from inside the network. So: HTTPS, and
 * only hosts belonging to the four vendors whose browsers implement Web Push.
 */
const PUSH_HOSTS: ((host: string) => boolean)[] = [
  (host) => host === 'fcm.googleapis.com',
  (host) => host === 'android.googleapis.com',
  (host) => host.endsWith('.push.services.mozilla.com'),
  (host) => host === 'web.push.apple.com' || host.endsWith('.push.apple.com'),
  (host) => host.endsWith('.notify.windows.com'),
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((matches) => matches(host));
}

const hashEndpoint = (endpoint: string): string =>
  createHash('sha256').update(endpoint).digest('hex');

@Injectable()
export class PushSubscriptionsService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly repo: Repository<PushSubscriptionEntity>,
  ) {}

  /**
   * Records this browser for this person. Idempotent — the client re-sends its
   * subscription on every visit, which is what heals a row the server lost.
   *
   * An endpoint somebody else registered is taken over rather than refused:
   * it is the same browser, and it now has a different person signed in.
   */
  async save(
    userId: string,
    dto: SavePushSubscriptionDto,
    userAgent: string | undefined,
  ): Promise<void> {
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException(
        'That notification address is not one this site can deliver to.',
      );
    }
    const endpointHash = hashEndpoint(dto.endpoint);
    const existing = await this.repo.findOne({ where: { endpointHash } });

    await this.repo.save(
      this.repo.create({
        id: existing?.id ?? randomUUID(),
        userId,
        endpoint: dto.endpoint,
        endpointHash,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent?.slice(0, 255) ?? null,
        failureCount: 0,
      }),
    );

    // Oldest out, so a browser that keeps minting new endpoints cannot grow
    // one person's rows without bound.
    const rows = await this.repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
    if (rows.length > MAX_DEVICES_PER_USER) {
      await this.repo.remove(rows.slice(MAX_DEVICES_PER_USER));
    }
  }

  /** "Turn off on this device". Scoped to the caller: nobody removes another's row. */
  async removeOne(userId: string, endpoint: string): Promise<void> {
    await this.repo.delete({ userId, endpointHash: hashEndpoint(endpoint) });
  }

  async removeAll(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  async countForUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  /** Every browser an alert should go to. */
  async listAll(): Promise<PushSubscriptionEntity[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async summary(): Promise<{ devices: number; people: number }> {
    const [devices, people] = await Promise.all([
      this.repo.count(),
      this.repo
        .createQueryBuilder('subscription')
        .select('COUNT(DISTINCT subscription.userId)', 'count')
        .getRawOne<{ count: string }>(),
    ]);
    return { devices, people: Number(people?.count ?? 0) };
  }

  async markDelivered(id: string): Promise<void> {
    await this.repo.update(id, { failureCount: 0, lastSuccessAt: new Date() });
  }

  async markFailed(id: string): Promise<void> {
    await this.repo.update(id, {
      failureCount: () => 'failure_count + 1',
      lastFailureAt: new Date(),
    });
  }

  /** The push service said the subscription is gone. Its queued rows cascade. */
  async removeGone(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
