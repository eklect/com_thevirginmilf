import { mailBrand } from '../mail/templates/brand';
import {
  streamAnnouncedEmail,
  streamReminderEmail,
} from '../mail/templates/stream-alerts';
import { welcomeEmail } from '../mail/templates/welcome';
import type { EmailKindDef } from './email-kinds.types';

/**
 * VENTURE-SPECIFIC — the one email-registry file that differs between repos.
 *
 * Every kind of mail this backend sends, with the variables its call site
 * passes. `GET /service/email-templates/kinds` serves this list to the
 * template editor, `npm run email-templates:seed` writes the default
 * `live/<kind>.html` + `.txt` from it, and `MailQueueService.enqueue` warns
 * about any kind missing from it. When a feature starts sending a new kind,
 * add it here in the same change.
 *
 * Descriptions are read by whoever edits the template, who may be a customer:
 * say when the mail is sent, and name no product.
 *
 * `marketing` must agree with `MARKETING_KINDS` in `outbound-email.entity.ts`,
 * which is what the MAP opt-out check reads (asserted in `kinds.spec.ts`).
 *
 * The brand comes from `mailBrand`, the same helper the call sites use, and
 * the logo is its fixed production URL (`MAIL_LOGO_URL`), written into the
 * defaults as a literal — not `{{logoUrl}}`, which the layout cannot branch
 * on. `logoUrl` is still passed at send time, carrying that same URL, for an
 * editor who wants it.
 */
const brandFrom = (vars: Record<string, string>) =>
  mailBrand(vars.brandName, vars.homeUrl);

/** What `StreamAlertsScheduler.fanOut` passes for both stream alerts. */
const STREAM_PLACEHOLDERS = [
  'streamerName',
  'title',
  'when',
  'gameLine',
  'whereLine',
  'eventUrl',
  'unsubscribeUrl',
  'lead',
  'brandName',
  'homeUrl',
  'logoUrl',
];

const streamArgs = (vars: Record<string, string>) => ({
  streamerName: vars.streamerName,
  title: vars.title,
  when: vars.when,
  gameLine: vars.gameLine,
  whereLine: vars.whereLine,
  eventUrl: vars.eventUrl,
  unsubscribeUrl: vars.unsubscribeUrl,
});

export const EMAIL_KINDS: EmailKindDef[] = [
  {
    kind: 'welcome',
    description:
      'Sent when someone creates an account. The alerts line says whether they chose to hear about streams.',
    // Exactly what `RegisterService.enqueueWelcome` passes to `render`.
    placeholders: [
      'firstName',
      'streamsUrl',
      'alertsLine',
      'brandName',
      'homeUrl',
      'logoUrl',
    ],
    marketing: false,
    render: (vars) =>
      welcomeEmail(brandFrom(vars), {
        firstName: vars.firstName,
        streamsUrl: vars.streamsUrl,
        alertsLine: vars.alertsLine,
      }),
  },
  {
    kind: 'stream_announced',
    description:
      'Sent to everyone who asked for stream alerts when a stream is published to the calendar. The game line and the where-to-watch line are empty when the stream has no game or channel.',
    placeholders: STREAM_PLACEHOLDERS,
    marketing: true,
    render: (vars) => streamAnnouncedEmail(brandFrom(vars), streamArgs(vars)),
  },
  {
    kind: 'stream_reminder',
    description:
      'Sent to everyone who asked for stream alerts shortly before a stream starts. The lead reads like "in 30 minutes".',
    placeholders: STREAM_PLACEHOLDERS,
    marketing: true,
    render: (vars) =>
      streamReminderEmail(brandFrom(vars), {
        ...streamArgs(vars),
        lead: vars.lead,
      }),
  },
];
