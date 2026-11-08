import { effectiveLevel, levelsUnder, markdownToText, redact, type ExportItem } from './detail-level';
import { hashFeedToken, looksLikeFeedToken, newFeedToken } from './feed-token';
import { buildIcs, escapeText, fold } from './ics';
import { addLinks, subscribeLinks } from './links';

const timed: ExportItem = {
  uid: 'event-1@example.test',
  title: 'Quarterly review; budget, plans',
  start: '2027-03-01T17:00:00.000Z',
  end: '2027-03-01T18:30:00.000Z',
  allDay: false,
  description: 'Bring the deck.\nRoom 4',
  location: 'HQ, 2nd floor',
  url: 'https://app.example.test/calendar?event=1',
  updatedAt: new Date('2027-02-01T00:00:00Z'),
};

const allDay: ExportItem = {
  uid: 'event-2@example.test',
  title: 'Offsite',
  start: '2027-03-03',
  end: '2027-03-05',
  allDay: true,
};

describe('detail levels', () => {
  it('never exceeds the cap', () => {
    expect(effectiveLevel('busy', 'full')).toBe('busy');
    expect(effectiveLevel('basic', 'full')).toBe('basic');
    expect(effectiveLevel('full', 'basic')).toBe('basic');
    expect(effectiveLevel('basic', 'nonsense')).toBe('basic');
    expect(levelsUnder('basic')).toEqual(['busy', 'basic']);
  });

  it('busy keeps only the times', () => {
    const out = redact(timed, 'busy');
    expect(out).toMatchObject({ title: 'Busy', start: timed.start, end: timed.end, private: true });
    expect(out.description).toBeUndefined();
    expect(out.location).toBeUndefined();
    expect(out.url).toBeUndefined();
  });

  it('basic adds the title and nothing else', () => {
    const out = redact(timed, 'basic');
    expect(out.title).toBe(timed.title);
    expect(out.description ?? out.location ?? out.url).toBeUndefined();
  });

  it('full carries everything', () => {
    expect(redact(timed, 'full')).toMatchObject({ description: timed.description, location: timed.location, url: timed.url });
  });

  it('turns Markdown into readable text', () => {
    expect(markdownToText('## Plan\n\n**Bold** and [the site](https://x.test) ![logo](a.png)\n- one')).toBe(
      'Plan\n\nBold and the site (https://x.test) logo\n• one',
    );
  });
});

describe('ICS', () => {
  it('escapes TEXT and folds at 75 octets without splitting a character', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const long = `DESCRIPTION:${'é'.repeat(80)}`;
    const folded = fold(long);
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });

  it('writes a timed and an all-day event', () => {
    const ics = buildIcs({
      prodId: '-//Test//EN',
      name: 'Mine',
      refresh: true,
      items: [redact(timed, 'full'), { ...redact(allDay, 'busy'), cancelled: true }],
      now: new Date('2027-01-01T00:00:00Z'),
    });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20270301T170000Z\r\nDTEND:20270301T183000Z');
    expect(ics).toContain('SUMMARY:Quarterly review\\; budget\\, plans');
    expect(ics).toContain('DESCRIPTION:Bring the deck.\\nRoom 4');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270303\r\nDTEND;VALUE=DATE:20270305');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('CLASS:PRIVATE');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});

describe('links', () => {
  it('builds Google and Outlook add links', () => {
    const links = addLinks(redact(timed, 'full'));
    const google = new URL(links.google);
    expect(google.searchParams.get('dates')).toBe('20270301T170000Z/20270301T183000Z');
    expect(google.searchParams.get('details')).toContain('https://app.example.test/calendar?event=1');
    const outlook = new URL(links.outlook);
    expect(outlook.host).toBe('outlook.live.com');
    expect(outlook.searchParams.get('startdt')).toBe('2027-03-01T17:00:00.000Z');
    expect(new URL(links.office365).host).toBe('outlook.office.com');
  });

  it('all-day links use dates with an exclusive end', () => {
    const links = addLinks(redact(allDay, 'basic'));
    expect(new URL(links.google).searchParams.get('dates')).toBe('20270303/20270305');
    expect(new URL(links.outlook).searchParams.get('allday')).toBe('true');
  });

  it('busy links carry nothing but "Busy" and the times', () => {
    const google = new URL(addLinks(redact(timed, 'busy')).google);
    expect(google.searchParams.get('text')).toBe('Busy');
    expect(google.searchParams.has('details')).toBe(false);
    expect(google.searchParams.has('location')).toBe(false);
  });

  it('subscribe links point at webcal', () => {
    const links = subscribeLinks('https://app.example.test/api/calendar-feed/abc', 'Work');
    expect(links.webcal).toBe('webcal://app.example.test/api/calendar-feed/abc');
    expect(links.google).toContain(encodeURIComponent('webcal://'));
  });
});

describe('feed tokens', () => {
  it('stores only a hash', () => {
    const { token, hash } = newFeedToken();
    expect(looksLikeFeedToken(token)).toBe(true);
    expect(hash).toBe(hashFeedToken(token));
    expect(hash).not.toContain(token);
  });
});

describe('dates', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { addDays, allDaySpan, dayInZone } = require('./dates') as typeof import('./dates');
  it('reads the day in a zone and adds days across a month end', () => {
    expect(dayInZone(new Date('2027-03-01T06:00:00Z'), 'America/Los_Angeles')).toBe('2027-02-28');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
  it('turns a midnight-to-midnight entry saved in another zone into the right days', () => {
    // saved in Los Angeles for March 3–4, read in New York
    const span = allDaySpan(new Date('2027-03-03T08:00:00Z'), new Date('2027-03-05T08:00:00Z'), 'America/New_York');
    expect(span).toEqual({ start: '2027-03-03', end: '2027-03-05' });
    expect(allDaySpan(new Date('2027-03-03T05:00:00Z'), null, 'America/New_York')).toEqual({ start: '2027-03-03', end: '2027-03-04' });
  });
});
