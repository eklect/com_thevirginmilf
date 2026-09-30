import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Who this server sends mail as when nothing more specific is given, and the
 * SendGrid category every message is tagged with. The only lines in the mail
 * module that differ between repos — see `mail.module.ts`.
 */
export const MAIL_VENTURE = 'thevirginmilf';
export const DEFAULT_MAIL_FROM = 'The Virgin MILF <no-reply@thevirginmilf.com>';

/**
 * Mail settings, read once.
 *
 * ## `MAIL_ENABLED` is the one switch
 *
 * Every repo in the estate carries the same mail module. Whether a venture's
 * mail actually leaves the building is this flag and nothing else:
 *
 * - `false` (the default) — the queue still fills and still drains, but each
 *   message is written to the log and marked `logged`. This is the stubbed
 *   state, and unlike `com_alimucci`'s SMTP build it is allowed in production:
 *   a venture that is not ready to email anyone is a normal thing to deploy.
 * - `true` — delivered through SendGrid. A missing API key is then a boot
 *   failure, not a silent downgrade to the log, because "enabled but quietly
 *   not sending" is the one configuration nobody would notice.
 *
 * `MAIL_SANDBOX=true` passes SendGrid's sandbox flag: the API validates the
 * message and accepts it, and nothing is delivered. It is how to prove a key
 * and a sender from the dev box without mailing a real person.
 */
@Injectable()
export class MailConfig {
  private readonly logger = new Logger(MailConfig.name);

  readonly enabled: boolean;
  readonly apiKey: string | null;
  readonly from: string;
  readonly replyTo: string | null;
  readonly sandbox: boolean;
  readonly batchSize: number;
  readonly isProduction: boolean;
  readonly venture = MAIL_VENTURE;

  constructor(config: ConfigService) {
    const flag = (name: string) =>
      (config.get<string>(name) ?? '').trim().toLowerCase() === 'true';

    this.enabled = flag('MAIL_ENABLED');
    this.sandbox = flag('MAIL_SANDBOX');
    this.apiKey = (config.get<string>('SENDGRID_API_KEY') ?? '').trim() || null;
    this.from = (config.get<string>('MAIL_FROM') ?? '').trim() || DEFAULT_MAIL_FROM;
    this.replyTo = (config.get<string>('MAIL_REPLY_TO') ?? '').trim() || null;
    this.isProduction = (config.get<string>('NODE_ENV') ?? '').trim() === 'production';

    const batch = Number(config.get<string>('MAIL_QUEUE_BATCH') ?? '50');
    this.batchSize = Number.isInteger(batch) && batch > 0 ? batch : 50;

    if (this.enabled && !this.apiKey) {
      throw new Error(
        'MAIL_ENABLED=true but SENDGRID_API_KEY is not set. Set the key, or set ' +
          'MAIL_ENABLED=false to write mail to the log instead.',
      );
    }

    if (!this.enabled) {
      this.logger.warn(
        'MAIL_ENABLED is off — outgoing mail is written to this log and marked ' +
          '`logged`, not sent.',
      );
    } else if (this.sandbox) {
      this.logger.warn('MAIL_SANDBOX is on — SendGrid will accept mail and deliver none of it.');
    }
  }
}
