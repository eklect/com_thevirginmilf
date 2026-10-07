import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { gameTitle } from '../games/games.serializer';
import { FileTemplateService } from '../email-templates/file-template.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { MailConfig } from '../mail/mail.config';
import { Brand } from '../mail/templates/layout';
import {
  StreamAlertArgs,
  streamAnnouncedEmail,
  streamReminderEmail,
} from '../mail/templates/stream-alerts';
import { PushQueueService } from '../push/push-queue.service';
import { PushSubscriptionsService } from '../push/push-subscriptions.service';
import { SettingsService } from '../settings/settings.service';
import { StreamEventEntity } from '../streams/stream-event.entity';
import { SubscriberEntity } from '../subscribers/subscriber.entity';
import { SubscribersService } from '../subscribers/subscribers.service';
import { formatLead, formatTime, formatWhen, resolveZone } from './when';

const SWEEP_SCHEDULE = '* * * * *';

/** How many streams one tick will consider, per kind. */
const EVENTS_PER_SWEEP = 20;

/**
 * How long a stream must sit unedited before it is announced.
 *
 * An email cannot be unsent. Saving a stream, noticing the time is wrong and
 * fixing it thirty seconds later is the most ordinary thing an admin does, and
 * without this the first version is what everybody receives.
 */
const SETTLE_MS = 2 * 60_000;

const DEFAULT_LEAD_MINUTES = 30;
const MIN_LEAD_MINUTES = 5;
const MAX_LEAD_MINUTES = 24 * 60;

/** A reminder still worth delivering this long after the stream has started. */
const REMINDER_GRACE_MS = 30 * 60_000;

/** An announcement nobody has been able to receive within a day is stale. */
const ANNOUNCE_MAX_AGE_MS = 24 * 3_600_000;

type AlertKind = 'stream_announced' | 'stream_reminder';

/**
 * Tells people about streams: once when one is published, and again shortly
 * before it starts. Email to everybody who opted in, a push to every browser
 * that asked for one — the two lists are independent, so a person can have
 * either, both or neither.
 *
 * ## Why a sweep, when publishing is a request
 *
 * Announcing from the save handler would be simpler and wrong three ways: it
 * would send before the admin had finished editing, it would send again on
 * every later save unless something remembered, and it could not send the
 * reminder at all, because nothing is being saved when a stream is thirty
 * minutes away. A sweep that looks at the clock handles all three.
 *
 * ## Fan out first, stamp second
 *
 * `announced_at` and `reminded_start_at` are stamped only after the messages
 * are enqueued. Stamping first and then dying means nobody is told and nothing
 * records that it was missed. Stamping last means a crash replays on the next
 * tick and collides with the unique `dedupe_key` on both queues, which makes
 * the replay a no-op. The stamps are the cheap short-circuit; the unique
 * indexes are the guarantee. (`com_alimucci`'s post alerts are the precedent.)
 *
 * ## The four things that stop it blasting the list
 *
 *  1. **Past streams are never announced.** Logging last week's stream stamps
 *     it handled without sending.
 *  2. **A kind that is switched off stamps too.** Turning announcements back
 *     on later must not announce everything scheduled while they were off.
 *  3. **A stream published inside the reminder window gets the reminder
 *     only** — not two messages a minute apart saying the same thing.
 *  4. **The batch ceiling** refuses to enqueue an implausible number of
 *     messages in one tick, stamps nothing, and says so loudly.
 *
 * ## Rescheduling
 *
 * The reminder's dedupe key carries the start time, and `reminded_start_at`
 * records which start it was sent for. Move a stream after its reminder has
 * gone and both differ, so a fresh one is due. The announcement's key does
 * not — a stream is announced once, ever. There is no "this has moved" or
 * "this is cancelled" message; unpublishing before the reminder suppresses it.
 *
 * ## One process
 *
 * `running` is a plain field because this is one supervisord program. Scaled
 * out, every instance would run this; nothing breaks, because both enqueues
 * are idempotent, but the work is done N times.
 */
@Injectable()
export class StreamAlertsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(StreamAlertsScheduler.name);
  private running = false;
  private readonly siteUrl: string;
  private readonly batchCeiling: number;

  constructor(
    @InjectRepository(StreamEventEntity)
    private readonly events: Repository<StreamEventEntity>,
    private readonly subscribers: SubscribersService,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly mailQueue: MailQueueService,
    private readonly fileTemplates: FileTemplateService,
    private readonly pushQueue: PushQueueService,
    private readonly settings: SettingsService,
    private readonly mailConfig: MailConfig,
    config: ConfigService,
  ) {
    this.siteUrl = config
      .get<string>('PUBLIC_SITE_URL', 'https://thevirginmilf.test')
      .replace(/\/+$/, '');
    const ceiling = Number(config.get<string>('STREAM_ALERT_MAX_PER_SWEEP', '5000'));
    this.batchCeiling = Number.isInteger(ceiling) && ceiling > 0 ? ceiling : 5000;
  }

  onApplicationBootstrap(): void {
    this.logger.log(`Stream alert sweep armed (${SWEEP_SCHEDULE}).`);
  }

  @Cron(SWEEP_SCHEDULE, { name: 'stream-alert-sweep' })
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      // Never let this escape: an unhandled rejection out of a scheduled job
      // takes the process down.
      this.logger.error(
        `Stream alert sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async run(): Promise<void> {
    const settings = await this.settings.all();
    const context: SweepContext = {
      now: new Date(),
      announceOn: settings.notify_announce.trim().toLowerCase() !== 'off',
      reminderOn: settings.notify_reminder.trim().toLowerCase() !== 'off',
      leadMs: leadMinutes(settings.reminder_lead_minutes) * 60_000,
      zone: resolveZone(settings.alerts_timezone),
      siteName: settings.site_name.trim() || 'The Virgin MILF',
      streamerName: settings.streamer_name.trim() || 'TheVirginMILF',
      fromName: settings.mail_from_name.trim(),
    };
    await this.announce(context);
    await this.remind(context);
  }

  // ---------- "a stream was scheduled" ----------

  private async announce(context: SweepContext): Promise<void> {
    const due = await this.loadEvents(
      this.events
        .createQueryBuilder('event')
        .select('event.id')
        .where('event.isPublished = :published', { published: true })
        .andWhere('event.announcedAt IS NULL')
        .orderBy('event.startsAt', 'ASC')
        .take(EVENTS_PER_SWEEP),
    );

    for (const event of due) {
      const startsIn = event.startsAt.getTime() - context.now.getTime();

      // Guard 1: the past is not news.
      if (startsIn <= 0) {
        await this.stampAnnounced(event);
        continue;
      }
      // Still being edited — look again next minute.
      if (context.now.getTime() - event.editedAt.getTime() < SETTLE_MS) continue;

      // Guard 2: switched off means handled, not deferred.
      if (!event.notify || !context.announceOn) {
        await this.stampAnnounced(event);
        continue;
      }
      // Guard 3: close enough to the start that the reminder says it all.
      if (context.reminderOn && startsIn <= context.leadMs) {
        await this.stampAnnounced(event);
        continue;
      }

      const expiresAt = new Date(
        Math.min(event.startsAt.getTime(), context.now.getTime() + ANNOUNCE_MAX_AGE_MS),
      );
      const sent = await this.fanOut('stream_announced', event, context, {
        dedupeScope: event.id,
        expiresAt,
        push: {
          title: 'New stream scheduled',
          body: `${event.title} — ${formatWhen(event.startsAt, context.zone)}`,
        },
      });
      if (sent) await this.stampAnnounced(event);
    }
  }

  // ---------- "going live soon" ----------

  private async remind(context: SweepContext): Promise<void> {
    const due = await this.loadEvents(
      this.events
        .createQueryBuilder('event')
        .select('event.id')
        .where('event.isPublished = :published', { published: true })
        .andWhere('event.startsAt > :now', { now: context.now })
        .andWhere('event.startsAt <= :horizon', {
          horizon: new Date(context.now.getTime() + context.leadMs),
        })
        .andWhere('(event.remindedStartAt IS NULL OR event.remindedStartAt <> event.startsAt)')
        .orderBy('event.startsAt', 'ASC')
        .take(EVENTS_PER_SWEEP),
    );

    for (const event of due) {
      const startsIn = event.startsAt.getTime() - context.now.getTime();

      // Still being edited — but only wait while there is time to. A stream
      // about to start is reminded as it stands rather than not at all.
      const settling = context.now.getTime() - event.editedAt.getTime() < SETTLE_MS;
      if (settling && startsIn > 2 * SETTLE_MS) continue;

      if (!event.notify || !context.reminderOn) {
        await this.stampReminded(event);
        continue;
      }

      const lead = formatLead(event.startsAt, context.now);
      const sent = await this.fanOut('stream_reminder', event, context, {
        // The start time is part of the key: a rescheduled stream is a new
        // reminder, the same stream swept twice is not.
        dedupeScope: `${event.id}:${Math.floor(event.startsAt.getTime() / 1000)}`,
        expiresAt: new Date(event.startsAt.getTime() + REMINDER_GRACE_MS),
        lead,
        push: {
          title: `Going live ${lead}`,
          body: `${event.title} — ${formatTime(event.startsAt, context.zone)}`,
        },
      });
      if (sent) await this.stampReminded(event);
    }
  }

  // ---------- shared ----------

  /**
   * Enqueues one alert to every recipient on both channels. Returns false —
   * having sent nothing — when the batch ceiling refuses it.
   */
  private async fanOut(
    kind: AlertKind,
    event: StreamEventEntity,
    context: SweepContext,
    options: {
      dedupeScope: string;
      expiresAt: Date;
      lead?: string;
      push: { title: string; body: string };
    },
  ): Promise<boolean> {
    const [emailRecipients, pushRecipients] = await Promise.all([
      this.subscribers.listDeliverable(),
      this.pushSubscriptions.listAll(),
    ]);

    // Guard 4: an implausible fan-out is a bug somewhere upstream, and sending
    // it is not recoverable. Stop and say so; a human can raise the ceiling.
    const total = emailRecipients.length + pushRecipients.length;
    if (total > this.batchCeiling) {
      this.logger.error(
        `Refusing to enqueue ${total} ${kind} messages for "${event.title}" — over ` +
          `STREAM_ALERT_MAX_PER_SWEEP (${this.batchCeiling}). Nothing was sent and nothing was marked.`,
      );
      return false;
    }

    const brand: Brand = { name: context.siteName, homeUrl: this.siteUrl, accent: '#d2111d' };
    const eventUrl = `${this.siteUrl}/streams/${event.id}`;
    const base = {
      streamerName: context.streamerName,
      title: event.title,
      when: formatWhen(event.startsAt, context.zone),
      channels: [...(event.channelLinks ?? [])]
        .filter((link) => link.channel?.isPublished)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((link) => link.channel!.name),
      gameTitle: event.game && !event.game.isHidden ? gameTitle(event.game) : null,
      eventUrl,
    };

    const lead = options.lead ?? 'soon';
    const emails = await this.mailQueue.enqueue(
      await Promise.all(
        emailRecipients.map(async (subscriber) => {
          const args: StreamAlertArgs = {
            ...base,
            unsubscribeUrl: `${this.siteUrl}/unsubscribe/${subscriber.unsubscribeToken}`,
          };
          // The editable file in email_templates/<venture>/live wins when it
          // exists; the TypeScript template is what ships until somebody edits.
          const fromFile = await this.fileTemplates.render(kind, {
            streamerName: base.streamerName,
            title: base.title,
            when: base.when,
            gameLine: base.gameTitle ? `Playing ${base.gameTitle}.` : '',
            whereLine: whereLine(base.channels),
            eventUrl: base.eventUrl,
            unsubscribeUrl: args.unsubscribeUrl,
            lead,
            brandName: brand.name,
            homeUrl: brand.homeUrl,
            logoUrl: brand.logoUrl ?? null,
          });
          return {
            kind,
            dedupeKey: `${kind}:${options.dedupeScope}:${subscriber.id}`,
            userId: subscriber.userId,
            toEmail: subscriber.email,
            fromAddress: this.fromAddress(context.fromName),
            email:
              fromFile ??
              (kind === 'stream_reminder'
                ? streamReminderEmail(brand, { ...args, lead })
                : streamAnnouncedEmail(brand, args)),
            headers: unsubscribeHeaders(this.siteUrl, subscriber),
          };
        }),
      ),
    );

    const pushes = await this.pushQueue.enqueue(
      pushRecipients.map((subscription) => ({
        kind,
        dedupeKey: `${kind}:${options.dedupeScope}:${subscription.id}`,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        expiresAt: options.expiresAt,
        payload: {
          title: options.push.title,
          body: options.push.body,
          // A path, not a URL: the service worker opens it on its own origin.
          url: `/streams/${event.id}`,
          // One tag per stream, so its reminder replaces its announcement in
          // the notification tray instead of stacking under it.
          tag: `stream-${event.id}`,
        },
      })),
    );

    this.logger.log(
      `${kind} "${event.title}": ${emails} email(s), ${pushes} notification(s) queued.`,
    );
    return true;
  }

  /**
   * `mail_from_name` over the configured address — "TheVirginMILF
   * <no-reply@…>". Null leaves the message on `MAIL_FROM` untouched.
   */
  private fromAddress(name: string): string | null {
    if (!name) return null;
    const address = /<([^>]+)>/.exec(this.mailConfig.from)?.[1] ?? this.mailConfig.from;
    return `${name.replace(/[<>"\r\n]/g, '')} <${address.trim()}>`;
  }

  /** Two queries: the ids a sweep picked, then those rows with their relations. */
  private async loadEvents(
    ids: { getMany(): Promise<StreamEventEntity[]> },
  ): Promise<StreamEventEntity[]> {
    const picked = await ids.getMany();
    if (!picked.length) return [];
    return this.events.find({
      where: { id: In(picked.map((event) => event.id)) },
      relations: { channelLinks: { channel: true }, game: true },
      order: { startsAt: 'ASC' },
    });
  }

  private async stampAnnounced(event: StreamEventEntity): Promise<void> {
    await this.events.update(event.id, { announcedAt: new Date() });
  }

  /** Reminding also settles the announcement: the reminder said it. */
  private async stampReminded(event: StreamEventEntity): Promise<void> {
    await this.events.update(event.id, {
      remindedStartAt: event.startsAt,
      ...(event.announcedAt ? {} : { announcedAt: new Date() }),
    });
  }
}

interface SweepContext {
  now: Date;
  announceOn: boolean;
  reminderOn: boolean;
  leadMs: number;
  zone: string;
  siteName: string;
  streamerName: string;
  fromName: string;
}

function leadMinutes(raw: string): number {
  const parsed = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(parsed)) return DEFAULT_LEAD_MINUTES;
  return Math.min(Math.max(Math.round(parsed), MIN_LEAD_MINUTES), MAX_LEAD_MINUTES);
}

/**
 * One-click unsubscribe (RFC 8058). The header points at the API's POST
 * route, which performs it; the link a person clicks in the body goes to the
 * page, which asks first. See `unsubscribe.controller.ts` for why a GET never
 * unsubscribes.
 */
function unsubscribeHeaders(siteUrl: string, subscriber: SubscriberEntity): Record<string, string> {
  return {
    'List-Unsubscribe': `<${siteUrl}/api/unsubscribe/${subscriber.unsubscribeToken}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** The "Watch on …" sentence `stream-alerts.ts` builds, for the file template. */
function whereLine(channels: string[]): string {
  if (!channels.length) return '';
  if (channels.length === 1) return `Watch on ${channels[0]}.`;
  return `Watch on ${channels.slice(0, -1).join(', ')} or ${channels[channels.length - 1]}.`;
}
