import { MARKETING_KINDS, OUTBOUND_KINDS } from '../mail/outbound-email.entity';
import {
  MAIL_BRAND_NAME,
  MAIL_HOME_URL,
  mailBrand,
} from '../mail/templates/brand';
import { passwordResetEmail } from '../mail/templates/password-reset';
import {
  streamAnnouncedEmail,
  streamReminderEmail,
} from '../mail/templates/stream-alerts';
import { alertsLine, welcomeEmail } from '../mail/templates/welcome';
import { defaultRendering, placeholdersIn } from './email-kinds';
import type { EmailKindDef } from './email-kinds.types';
import { substitute } from './file-template.service';
import { EMAIL_KINDS, MAP_SENT_KINDS } from './kinds';

// VENTURE-SPECIFIC — the checks on this repo's own list.
const kind = (name: string): EmailKindDef =>
  EMAIL_KINDS.find((def) => def.kind === name)!;

/** The default file pair, filled in as `FileTemplateService.render` would. */
function fill(def: EmailKindDef, vars: Record<string, string>) {
  const d = defaultRendering(def);
  return {
    subject: substitute(d.subject, vars, false),
    html: substitute(d.html, vars, true),
    text: substitute(d.text, vars, false),
  };
}

const brandVars = {
  brandName: `Brand <&> "Co"`,
  homeUrl: 'https://example.test/?a=1&b=2',
  logoUrl: '',
};

describe('EMAIL_KINDS', () => {
  it('lists exactly the kinds the queue can carry, plus the ones MAP sends', () => {
    expect(EMAIL_KINDS.map((def) => def.kind).sort()).toEqual(
      [...OUTBOUND_KINDS, ...MAP_SENT_KINDS].sort(),
    );
  });

  it('keeps the kinds MAP sends out of the queue', () => {
    for (const name of MAP_SENT_KINDS) {
      expect(OUTBOUND_KINDS as readonly string[]).not.toContain(name);
    }
  });

  it('flags as marketing exactly the kinds the MAP opt-out check reads', () => {
    expect(
      EMAIL_KINDS.filter((def) => def.marketing)
        .map((def) => def.kind)
        .sort(),
    ).toEqual([...MARKETING_KINDS].sort());
  });
});

describe('welcome', () => {
  const welcome = kind('welcome');

  it('declares exactly what RegisterService passes', () => {
    expect(welcome.placeholders).toEqual([
      'firstName',
      'streamsUrl',
      'alertsLine',
      'brandName',
      'homeUrl',
      'logoUrl',
    ]);
  });

  it.each([true, false])(
    'the default, filled in at send time, is the TypeScript template byte for byte (alerts %s)',
    (emailAlerts) => {
      const vars = {
        firstName: `Ann <O'Neil> & co`,
        streamsUrl: 'https://example.test/streams?x=1&y=2',
        alertsLine: alertsLine(emailAlerts),
        ...brandVars,
      };
      expect(fill(welcome, vars)).toEqual(
        welcomeEmail(mailBrand(vars.brandName, vars.homeUrl), vars),
      );
    },
  );
});

describe('stream alerts', () => {
  const vars = {
    streamerName: `Ann "<the> streamer" & co`,
    title: `Late night <Hades II> & "chill"`,
    when: 'Friday, October 3 at 7:00 PM EDT',
    gameLine: 'Playing Hades <II> & more.',
    whereLine: 'Watch on Twitch, Kick & "YouTube".',
    eventUrl: 'https://example.test/streams/1?a=1&b=2',
    unsubscribeUrl: 'https://example.test/unsubscribe/tok?a=1&b=2',
    lead: 'in 30 minutes',
    ...brandVars,
  };
  const brand = mailBrand(vars.brandName, vars.homeUrl);

  it('both kinds declare exactly what StreamAlertsScheduler.fanOut passes', () => {
    const passed = [
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
    expect(kind('stream_announced').placeholders).toEqual(passed);
    expect(kind('stream_reminder').placeholders).toEqual(passed);
  });

  it('stream_announced default, filled in, is the TypeScript template byte for byte', () => {
    expect(fill(kind('stream_announced'), vars)).toEqual(
      streamAnnouncedEmail(brand, vars),
    );
  });

  it('stream_reminder default, filled in, is the TypeScript template byte for byte', () => {
    expect(fill(kind('stream_reminder'), vars)).toEqual(
      streamReminderEmail(brand, vars),
    );
  });

  it('the footer carries a working unsubscribe link in both halves', () => {
    for (const name of ['stream_announced', 'stream_reminder']) {
      const d = defaultRendering(kind(name));
      expect(d.html).toContain('<a href="{{unsubscribeUrl}}"');
      expect(d.text).toContain('Unsubscribe: {{unsubscribeUrl}}');
    }
  });
});

describe('password_reset (sent by MAP)', () => {
  const reset = kind('password_reset');
  const brand = mailBrand(MAIL_BRAND_NAME, MAIL_HOME_URL);

  it('the default, filled in, is the TypeScript template byte for byte', () => {
    const vars = {
      email: `ann+<o'neil>@example.test`,
      resetUrl: 'https://map.example.test/reset?token=a&b="c"',
    };
    expect(fill(reset, vars)).toEqual(passwordResetEmail(brand, vars));
  });

  it('uses only email and resetUrl, so MAP never skips it', () => {
    expect(reset.placeholders).toEqual(['email', 'resetUrl']);
    const d = defaultRendering(reset);
    expect(placeholdersIn(`${d.html}\n${d.text}`).sort()).toEqual([
      'email',
      'resetUrl',
    ]);
    expect(d.html).not.toMatch(
      /\{\{\s*(brandName|sharedAccountLine|homeUrl|logoUrl)/,
    );
  });

  it('carries a <title>, which MAP reads the subject from', () => {
    const d = defaultRendering(reset);
    expect(d.html).toContain(
      `<title>Reset your password for ${MAIL_BRAND_NAME.replace(/&/g, '&amp;')}</title>`,
    );
  });

  it('writes the brand and the shared-account sentence out as literals', () => {
    const d = defaultRendering(reset);
    expect(d.text.startsWith(`${MAIL_BRAND_NAME} · Password reset`)).toBe(true);
    expect(d.text).toContain(
      `${MAIL_BRAND_NAME} signs you in with a Mucci & Co account, so the new password works on every Mucci & Co site you use.`,
    );
  });
});
