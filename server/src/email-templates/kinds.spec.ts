import { MARKETING_KINDS, OUTBOUND_KINDS } from '../mail/outbound-email.entity';
import { mailBrand } from '../mail/templates/brand';
import { streamAnnouncedEmail, streamReminderEmail } from '../mail/templates/stream-alerts';
import { alertsLine, welcomeEmail } from '../mail/templates/welcome';
import { defaultRendering } from './email-kinds';
import type { EmailKindDef } from './email-kinds.types';
import { substitute } from './file-template.service';
import { EMAIL_KINDS } from './kinds';

// VENTURE-SPECIFIC — the checks on this repo's own list.
const kind = (name: string): EmailKindDef => EMAIL_KINDS.find((def) => def.kind === name)!;

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
  it('lists exactly the kinds the queue can carry', () => {
    expect(EMAIL_KINDS.map((def) => def.kind).sort()).toEqual([...OUTBOUND_KINDS].sort());
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
    expect(fill(kind('stream_announced'), vars)).toEqual(streamAnnouncedEmail(brand, vars));
  });

  it('stream_reminder default, filled in, is the TypeScript template byte for byte', () => {
    expect(fill(kind('stream_reminder'), vars)).toEqual(streamReminderEmail(brand, vars));
  });

  it('the footer carries a working unsubscribe link in both halves', () => {
    for (const name of ['stream_announced', 'stream_reminder']) {
      const d = defaultRendering(kind(name));
      expect(d.html).toContain('<a href="{{unsubscribeUrl}}"');
      expect(d.text).toContain('Unsubscribe: {{unsubscribeUrl}}');
    }
  });
});
