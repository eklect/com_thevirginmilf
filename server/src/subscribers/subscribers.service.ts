import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Not, Repository } from 'typeorm';
import type { RequestUser } from '../common/auth/principal';
import { SubscriberEntity } from './subscriber.entity';

/** MySQL's duplicate-key error, which the email write-through can legitimately hit. */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY';

const newToken = (): string => randomBytes(32).toString('base64url');

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    @InjectRepository(SubscriberEntity)
    private readonly repo: Repository<SubscriberEntity>,
  ) {}

  /**
   * The signed-in person's row, created on first look.
   *
   * Also writes the cached email through from the verified token, which is
   * what keeps it eventually consistent with MAP. See `subscriber.entity.ts`
   * for why the address is cached at all.
   */
  async forUser(user: RequestUser): Promise<SubscriberEntity> {
    const email = normalizeEmail(user.email ?? '');
    const existing = await this.repo.findOne({ where: { userId: user.id } });

    if (existing) {
      if (email && existing.email !== email) {
        await this.refreshEmail(existing, email);
      }
      return existing;
    }

    // A row created HERE starts not subscribed: this path is somebody who has
    // an account but never went through this site's signup form (they came
    // from another Mucci & Co site), so nothing has asked them yet. The signup
    // form's own checkbox is `seedForNewAccount`.
    const row = this.repo.create({
      id: randomUUID(),
      userId: user.id,
      email,
      isSubscribed: false,
      unsubscribeToken: newToken(),
    });

    try {
      return await this.repo.save(row);
    } catch (error) {
      // Somebody already holds this address — an old row from before they had
      // an account. Adopt it rather than failing the settings page.
      if (this.isDuplicate(error) && email) {
        const orphan = await this.repo.findOne({ where: { email } });
        if (orphan) {
          orphan.userId = user.id;
          return this.repo.save(orphan);
        }
      }
      throw error;
    }
  }

  /**
   * Moves the cached address, merging if the new one is already taken.
   *
   * The unique index on `email` makes this a real possibility: somebody
   * changes their MAP address to one an old row already holds. Losing the
   * settings page to a 500 over it would be absurd, so the rows merge — the
   * one with a `user_id` wins, and an unsubscribe on EITHER side is preserved,
   * because forgetting an opt-out is the one outcome that must not happen.
   */
  private async refreshEmail(row: SubscriberEntity, email: string): Promise<void> {
    try {
      row.email = email;
      await this.repo.save(row);
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;

      const other = await this.repo.findOne({ where: { email } });
      if (!other || other.id === row.id) throw error;

      this.logger.warn(
        `Merging subscriber ${other.id} into ${row.id} — the address moved onto an existing row.`,
      );
      const stayUnsubscribed = !row.isSubscribed || !other.isSubscribed;
      await this.repo.remove(other);
      row.email = email;
      if (stayUnsubscribed) {
        row.isSubscribed = false;
        row.unsubscribedAt ??= new Date();
      }
      await this.repo.save(row);
    }
  }

  /**
   * The signup form's checkbox, recorded the moment the account exists.
   *
   * The person ticked it themselves on a form they submitted, which is the
   * same consent the account page's switch records — so a ticked box is
   * stamped confirmed here, and an unticked one creates the row not
   * subscribed. Never throws: a subscriber row that could not be written must
   * not fail a signup that has already created the identity at MAP. They can
   * set it from the account page, where `forUser` will create the row.
   */
  async seedForNewAccount(userId: string, email: string, subscribed: boolean): Promise<void> {
    const address = normalizeEmail(email);
    try {
      const existing =
        (await this.repo.findOne({ where: { userId } })) ??
        (await this.repo.findOne({ where: { email: address } }));
      const row =
        existing ??
        this.repo.create({
          id: randomUUID(),
          email: address,
          isSubscribed: false,
          unsubscribeToken: newToken(),
        });
      row.userId = userId;
      // An address that opted out before it had an account stays opted out:
      // forgetting an unsubscribe is the one outcome that must not happen.
      const optedOutBefore = Boolean(existing && existing.unsubscribedAt);
      if (subscribed && !optedOutBefore) {
        row.isSubscribed = true;
        row.confirmedAt ??= new Date();
      }
      await this.repo.save(row);
    } catch (error) {
      this.logger.warn(
        `Could not record the signup preference for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The account page's switch. */
  async setSubscribed(user: RequestUser, subscribed: boolean): Promise<SubscriberEntity> {
    const row = await this.forUser(user);
    if (row.isSubscribed === subscribed) return row;

    row.isSubscribed = subscribed;
    if (subscribed) {
      row.unsubscribedAt = null;
      row.confirmedAt ??= new Date();
      // Opting back in clears a suppression: they are telling us the address
      // works, which is better evidence than the bounce that set it.
      row.suppressedAt = null;
      row.bounceCount = 0;
    } else {
      row.unsubscribedAt = new Date();
    }
    return this.repo.save(row);
  }

  /** The token route. Returns null rather than throwing on a bad token. */
  async findByToken(token: string): Promise<SubscriberEntity | null> {
    if (!token) return null;
    return this.repo.findOne({ where: { unsubscribeToken: token } });
  }

  /**
   * One-click unsubscribe.
   *
   * Never deletes the row — see `subscriber.entity.ts`. Idempotent, so a
   * second click is not an error.
   */
  async unsubscribeByToken(token: string): Promise<SubscriberEntity> {
    const row = await this.findByToken(token);
    if (!row) throw new NotFoundException('That link is no longer valid.');
    if (row.isSubscribed) {
      row.isSubscribed = false;
      row.unsubscribedAt = new Date();
      await this.repo.save(row);
    }
    return row;
  }

  /** Re-subscribe from the confirmation page's undo link. */
  async resubscribeByToken(token: string): Promise<SubscriberEntity> {
    const row = await this.findByToken(token);
    if (!row) throw new NotFoundException('That link is no longer valid.');
    if (!row.isSubscribed) {
      row.isSubscribed = true;
      row.unsubscribedAt = null;
      row.confirmedAt ??= new Date();
      await this.repo.save(row);
    }
    return row;
  }

  /** Everyone an alert should go to: opted in, and not suppressed by bounces. */
  async listDeliverable(): Promise<SubscriberEntity[]> {
    return this.repo.find({
      where: { isSubscribed: true, suppressedAt: IsNull(), email: Not(IsNull()) },
      order: { createdAt: 'ASC' },
    });
  }

  /** For the read-only admin screen. */
  async summary(): Promise<{ total: number; subscribed: number; suppressed: number }> {
    const [total, subscribed, suppressed] = await Promise.all([
      this.repo.count(),
      this.repo.count({ where: { isSubscribed: true, suppressedAt: IsNull() } }),
      this.repo.count({ where: { suppressedAt: Not(IsNull()) } }),
    ]);
    return { total, subscribed, suppressed };
  }

  async list(): Promise<SubscriberEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 500 });
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string; driverError?: { code?: string } }).code === ER_DUP_ENTRY
    ) || (
      typeof error === 'object' &&
      error !== null &&
      (error as { driverError?: { code?: string } }).driverError?.code === ER_DUP_ENTRY
    );
  }
}
