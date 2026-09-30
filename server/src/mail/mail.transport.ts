import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { MailConfig } from './mail.config';

export interface MailMessage {
  to: string;
  /** Overrides `MAIL_FROM` for this one message. */
  from?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  headers?: Record<string, string> | null;
  /** Tagged onto the message at SendGrid so its activity feed is searchable. */
  kind: string;
  outboundId: string;
}

/**
 * A send that failed. `permanent` means retrying the same message cannot help —
 * a bad address, a revoked key, an unverified sender — so the queue stops
 * rather than burning its attempts over the next half hour.
 */
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

/** HTTP statuses from the SendGrid API that no amount of waiting will fix. */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 413]);

/**
 * Sends ONE message through SendGrid, or writes it to the log when mail is off.
 *
 * Nothing calls this but `MailQueueService.deliver` — features enqueue, they
 * never send inline, so a slow or failing SendGrid never holds a request open.
 *
 * Click tracking is switched off on every message. It rewrites links through
 * SendGrid's redirect host, which for a password-reset link means a third
 * party sees the token, and for everyone means a link that reads like a
 * phishing URL. These are transactional messages; there is nothing to track.
 */
@Injectable()
export class MailTransport {
  private readonly logger = new Logger(MailTransport.name);

  constructor(private readonly config: MailConfig) {
    if (config.enabled && config.apiKey) sgMail.setApiKey(config.apiKey);
  }

  /** Whether a message handed to `send` actually leaves the building. */
  get canDeliver(): boolean {
    return this.config.enabled;
  }

  /** Returns `logged` when mail is off, `sent` when SendGrid accepted it. */
  async send(message: MailMessage): Promise<'sent' | 'logged'> {
    const from = message.from || this.config.from;

    if (!this.config.enabled) {
      // The body carries links with one-time tokens in them. Fine in a dev log,
      // where it is the inbox; not something to leave lying in a production one.
      const body = this.config.isProduction ? '' : `\n\n${message.text}`;
      this.logger.warn(
        `[mail not sent — MAIL_ENABLED is off] ${message.kind}\nFrom: ${from}\n` +
          `To: ${message.to}\nSubject: ${message.subject}${body}`,
      );
      return 'logged';
    }

    try {
      await sgMail.send({
        to: message.to,
        from,
        replyTo: this.config.replyTo ?? undefined,
        subject: message.subject,
        text: message.text,
        html: message.html ?? undefined,
        headers: message.headers ?? undefined,
        categories: [this.config.venture, message.kind],
        customArgs: { kind: message.kind, outbound_id: message.outboundId },
        trackingSettings: {
          clickTracking: { enable: false, enableText: false },
        },
        mailSettings: { sandboxMode: { enable: this.config.sandbox } },
      });
      return 'sent';
    } catch (error) {
      throw toDeliveryError(error);
    }
  }
}

/** Exported for the spec. */
export function toDeliveryError(error: unknown): MailDeliveryError {
  const e = error as {
    code?: number;
    message?: string;
    response?: { body?: { errors?: { message?: string }[] } };
  };
  const status = typeof e?.code === 'number' ? e.code : null;
  const detail = e?.response?.body?.errors
    ?.map((item) => item.message)
    .filter(Boolean)
    .join('; ');
  const text = [status ? `SendGrid ${status}` : null, detail || e?.message || String(error)]
    .filter(Boolean)
    .join(': ');
  return new MailDeliveryError(text, status !== null && PERMANENT_STATUSES.has(status));
}
