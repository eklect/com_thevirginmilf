import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Web Push settings, read once.
 *
 * ## `PUSH_ENABLED` mirrors `MAIL_ENABLED`
 *
 * - `false` (the default) — browsers can still subscribe and the queue still
 *   fills and drains, but each notification is written to the log and marked
 *   `logged`. The whole path is exercised; nothing leaves the building.
 * - `true` — delivered through the browser vendors' push services. Missing
 *   VAPID values are then a boot failure, for the reason a missing SendGrid
 *   key is: "enabled but quietly not sending" is the one configuration nobody
 *   would notice.
 *
 * ## The VAPID pair identifies this server to the push services
 *
 * `npx web-push generate-vapid-keys` makes one. The PUBLIC key is handed to
 * every browser (`/site/bootstrap`) and baked into each subscription it
 * creates — so rotating the pair orphans every subscription at once, and
 * everybody has to switch notifications on again. Treat it like
 * `SESSION_ENCRYPTION_SECRET`: set once, per environment, and leave alone.
 *
 * `VAPID_SUBJECT` is a `mailto:` or `https:` contact the push service can use
 * if this server misbehaves. Apple's rejects a request without a real one.
 */
@Injectable()
export class PushConfig {
  private readonly logger = new Logger(PushConfig.name);

  readonly enabled: boolean;
  readonly publicKey: string | null;
  readonly privateKey: string | null;
  readonly subject: string | null;
  readonly batchSize: number;

  constructor(config: ConfigService) {
    const read = (name: string) => (config.get<string>(name) ?? '').trim() || null;

    this.enabled = (config.get<string>('PUSH_ENABLED') ?? '').trim().toLowerCase() === 'true';
    this.publicKey = read('VAPID_PUBLIC_KEY');
    this.privateKey = read('VAPID_PRIVATE_KEY');
    this.subject = read('VAPID_SUBJECT');

    const batch = Number(config.get<string>('PUSH_QUEUE_BATCH') ?? '100');
    this.batchSize = Number.isInteger(batch) && batch > 0 ? batch : 100;

    if (this.enabled) {
      const missing = [
        ['VAPID_PUBLIC_KEY', this.publicKey],
        ['VAPID_PRIVATE_KEY', this.privateKey],
        ['VAPID_SUBJECT', this.subject],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
      if (missing.length) {
        throw new Error(
          `PUSH_ENABLED=true but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set. ` +
            'Generate a pair with `npx web-push generate-vapid-keys`, or set ' +
            'PUSH_ENABLED=false to write notifications to the log instead.',
        );
      }
      if (!/^(mailto:|https:\/\/)/i.test(this.subject!)) {
        throw new Error('VAPID_SUBJECT must start with mailto: or https://');
      }
    } else {
      this.logger.warn(
        'PUSH_ENABLED is off — notifications are written to this log and marked ' +
          '`logged`, not sent.',
      );
    }
  }

  /**
   * What `/site/bootstrap` hands the browser. Empty hides the notification
   * control altogether: without the public key a browser cannot subscribe.
   */
  get clientPublicKey(): string {
    return this.publicKey ?? '';
  }
}
