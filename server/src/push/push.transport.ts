import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import type { PushPayload } from './outbound-push.entity';
import { PushConfig } from './push.config';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * A delivery that failed.
 *
 * `gone` means the push service says this subscription no longer exists
 * (404/410) — the browser unsubscribed, or the site's data was cleared — so
 * the row should be deleted, not retried. `permanent` means this one message
 * cannot succeed but the subscription may be fine (a payload it rejects).
 */
export class PushDeliveryError extends Error {
  constructor(
    message: string,
    readonly gone: boolean,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

/**
 * Sends ONE notification, or writes it to the log when push is off.
 *
 * Nothing calls this but `PushQueueService.deliver` — features enqueue, they
 * never send inline.
 */
@Injectable()
export class PushTransport {
  private readonly logger = new Logger(PushTransport.name);

  constructor(private readonly config: PushConfig) {}

  get canDeliver(): boolean {
    return this.config.enabled;
  }

  /** `ttlSeconds` is how long the push service may hold it for an offline device. */
  async send(
    target: PushTarget,
    payload: PushPayload,
    ttlSeconds: number,
  ): Promise<'sent' | 'logged'> {
    if (!this.config.enabled) {
      const host = safeHost(target.endpoint);
      this.logger.warn(
        `[push not sent — PUSH_ENABLED is off] to a browser at ${host}\n` +
          `${payload.title}\n${payload.body}\n→ ${payload.url}`,
      );
      return 'logged';
    }

    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: this.config.subject!,
            publicKey: this.config.publicKey!,
            privateKey: this.config.privateKey!,
          },
          TTL: Math.max(0, Math.floor(ttlSeconds)),
          urgency: 'high',
        },
      );
      return 'sent';
    } catch (error) {
      throw toDeliveryError(error);
    }
  }
}

function toDeliveryError(error: unknown): PushDeliveryError {
  const e = error as { statusCode?: number; body?: string; message?: string };
  const status = typeof e?.statusCode === 'number' ? e.statusCode : null;
  const detail = (typeof e?.body === 'string' && e.body.trim()) || e?.message || String(error);
  const text = status ? `Push service ${status}: ${detail}` : detail;

  if (status === 404 || status === 410) return new PushDeliveryError(text, true, true);
  // 429 and 5xx are the push service's problem and worth another go; any
  // other 4xx is this message's problem and retrying would repeat it.
  const retryable = status === null || status === 429 || status >= 500;
  return new PushDeliveryError(text.slice(0, 500), false, !retryable);
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'an unknown host';
  }
}
