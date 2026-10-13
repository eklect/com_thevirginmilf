import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderEmail } from '../mail/templates/layout';
import {
  assertKinds,
  defaultRendering,
  placeholdersIn,
  resetUnregisteredKindWarnings,
  seedLiveTemplates,
  warnIfUnregisteredKind,
} from './email-kinds';
import { EmailKindsService } from './email-kinds.service';
import type { EmailKindDef } from './email-kinds.types';
import { EmailTemplatesConfig } from './email-templates.config';
import { EMAIL_KINDS } from './kinds';

// GENERIC — copied verbatim. Uses a made-up kind so it holds in any venture.
const sample: EmailKindDef = {
  kind: 'sample',
  description: 'Sent in tests.',
  placeholders: ['name', 'url', 'brandName', 'homeUrl'],
  marketing: false,
  render: (v) =>
    renderEmail(
      { name: v.brandName, homeUrl: v.homeUrl },
      {
        subject: `Hello from ${v.brandName}`,
        heading: `Hi ${v.name} & "co"`,
        paragraphs: [],
        cta: { label: 'Go', url: v.url },
      },
    ),
};

function tmpVenture() {
  const ventureDir = mkdtempSync(path.join(os.tmpdir(), 'email-kinds-'));
  mkdirSync(path.join(ventureDir, 'live'));
  const live = (file: string) => path.join(ventureDir, 'live', file);
  return { ventureDir, live };
}

describe('defaultRendering', () => {
  it('keeps every placeholder as a literal {{token}} through HTML escaping', () => {
    const d = defaultRendering(sample);
    for (const name of sample.placeholders) {
      expect(d.html).toContain(`{{${name}}}`);
      expect(d.text).toContain(`{{${name}}}`);
    }
    expect(d.subject).toBe('Hello from {{brandName}}');
    expect(d.html).toContain('<title>Hello from {{brandName}}</title>');
    // the static text around a token is still escaped
    expect(d.html).toContain('Hi {{name}} &amp; &quot;co&quot;');
  });

  it('adds a <title> when the template has none', () => {
    const bare: EmailKindDef = {
      ...sample,
      render: () => ({
        subject: 'A & B',
        text: '',
        html: '<html><head></head></html>',
      }),
    };
    expect(defaultRendering(bare).html).toContain(
      '<head>\n<title>A &amp; B</title>',
    );
  });

  it('every registered kind renders only declared placeholders', () => {
    expect(() => assertKinds(EMAIL_KINDS)).not.toThrow();
    for (const def of EMAIL_KINDS) {
      const d = defaultRendering(def);
      expect(d.subject).toBeTruthy();
      expect(
        placeholdersIn(d.html + d.text).every((name) =>
          def.placeholders.includes(name),
        ),
      ).toBe(true);
    }
  });

  it('rejects a kind that renders an undeclared placeholder', () => {
    const sneaky: EmailKindDef = {
      ...sample,
      render: () => ({
        subject: 's',
        text: '{{secret}}',
        html: '<title>s</title>',
      }),
    };
    expect(() => assertKinds([sneaky])).toThrow(/secret/);
  });
});

describe('EmailKindsService', () => {
  it('reports live only when both files exist', async () => {
    const { ventureDir, live } = tmpVenture();
    const service = new EmailKindsService({
      ventureDir,
    } as unknown as EmailTemplatesConfig);
    const kind = EMAIL_KINDS[0].kind;

    let [row] = await service.list();
    expect(row).toMatchObject({
      kind,
      live: false,
      placeholders: EMAIL_KINDS[0].placeholders,
    });
    expect(row.defaults.html).toContain('<title>');

    writeFileSync(live(`${kind}.html`), '<title>x</title>');
    [row] = await service.list();
    expect(row.live).toBe(false);

    writeFileSync(live(`${kind}.txt`), 'x');
    [row] = await service.list();
    expect(row.live).toBe(true);
  });
});

describe('seedLiveTemplates', () => {
  it('writes missing pairs, skips existing ones, and leaves half pairs alone', async () => {
    const { ventureDir, live } = tmpVenture();
    const other: EmailKindDef = { ...sample, kind: 'other' };
    const half: EmailKindDef = { ...sample, kind: 'half' };
    writeFileSync(live('other.html'), 'EDITED');
    writeFileSync(live('other.txt'), 'EDITED');
    writeFileSync(live('half.txt'), 'EDITED');

    expect(
      await seedLiveTemplates(ventureDir, [sample, other, half], {
        dryRun: true,
      }),
    ).toEqual([
      { kind: 'sample', action: 'would-write' },
      { kind: 'other', action: 'skipped' },
      { kind: 'half', action: 'partial' },
    ]);
    expect(() => readFileSync(live('sample.html'))).toThrow();

    expect(await seedLiveTemplates(ventureDir, [sample, other, half])).toEqual([
      { kind: 'sample', action: 'written' },
      { kind: 'other', action: 'skipped' },
      { kind: 'half', action: 'partial' },
    ]);
    expect(readFileSync(live('sample.html'), 'utf8')).toContain('{{name}}');
    expect(readFileSync(live('other.html'), 'utf8')).toBe('EDITED');
    expect(readFileSync(live('half.txt'), 'utf8')).toBe('EDITED');

    expect(
      await seedLiveTemplates(ventureDir, [other], { force: true }),
    ).toEqual([{ kind: 'other', action: 'overwritten' }]);
    expect(readFileSync(live('other.txt'), 'utf8')).toContain('{{url}}');
  });
});

describe('warnIfUnregisteredKind', () => {
  it('warns once per unknown kind and never for a registered one', () => {
    resetUnregisteredKindWarnings();
    const warn = jest.fn<void, [string]>();
    warnIfUnregisteredKind('sample', [sample], warn);
    warnIfUnregisteredKind('mystery', [sample], warn);
    warnIfUnregisteredKind('mystery', [sample], warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("'mystery'");
  });
});
