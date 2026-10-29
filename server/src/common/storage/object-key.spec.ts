import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  APP,
  assertObjectKey,
  buildObjectKey,
  buildStagingKey,
  fileStem,
  isLegacyKey,
  VENTURE,
} from './object-key';

const SUB = '018f3c2a-9c2a-7b4e-8d1f-0a1b2c3d4e5f';
const ROW = '019a4d2e-7c11-7a3b-9e40-1f2a3b4c5d6e';
const TENANT = '7b3e1a2c-0000-4000-8000-000000000001';

describe('fileStem', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'object-key.fixture.json'), 'utf8'),
  ) as { cases: [string | null, string][] };

  it.each(fixture.cases)('%p → %p', (input, expected) => {
    expect(fileStem(input, 'file')).toBe(expected);
  });

  it('falls back to the action name', () => {
    expect(fileStem('???', 'avatar')).toBe('avatar');
  });
});

describe('buildObjectKey', () => {
  it('files an untenanted upload under the actor', () => {
    expect(
      buildObjectKey({
        actor: SUB,
        module: 'uploads',
        action: 'image',
        id: ROW,
        originalName: 'Logo Mark.PNG',
        extension: '.png',
      }),
    ).toBe(`uploads/${SUB}/${VENTURE}/${APP}/uploads/image/logo-mark--${ROW}.png`);
  });

  it('puts the tenant first when there is one', () => {
    expect(
      buildObjectKey({
        tenant: { kind: 'account', id: TENANT },
        actor: SUB,
        module: 'social',
        action: 'media',
        id: ROW,
        originalName: 'launch clip.mp4',
        extension: '.mp4',
      }),
    ).toBe(`uploads/account-${TENANT}/${SUB}/${VENTURE}/${APP}/social/media/launch-clip--${ROW}.mp4`);
  });

  it('uses the literal system actor for a machine upload', () => {
    const key = buildObjectKey({
      actor: 'system',
      module: 'steam',
      action: 'cover',
      id: ROW,
      originalName: 'steam-620',
      extension: '.jpg',
    });
    expect(key.startsWith('uploads/system/')).toBe(true);
  });

  it('allows an extensionless file and a nameless one', () => {
    expect(
      buildObjectKey({ actor: SUB, module: 'inventory', action: 'delivery-file', id: ROW, originalName: null, extension: '' }),
    ).toBe(`uploads/${SUB}/${VENTURE}/${APP}/inventory/delivery-file/delivery-file--${ROW}`);
  });

  it('refuses a bad module, action, actor, id or extension', () => {
    const base = { actor: SUB, module: 'uploads', action: 'image', id: ROW, originalName: 'x', extension: '.png' };
    expect(() => buildObjectKey({ ...base, module: 'Up loads' })).toThrow();
    expect(() => buildObjectKey({ ...base, action: '../etc' })).toThrow();
    expect(() => buildObjectKey({ ...base, actor: 'a/b' })).toThrow();
    expect(() => buildObjectKey({ ...base, id: 'not-a-uuid' })).toThrow();
    expect(() => buildObjectKey({ ...base, extension: 'png' })).toThrow();
    expect(() => buildObjectKey({ ...base, extension: '.exe.bat' })).toThrow();
  });
});

describe('buildStagingKey', () => {
  it('lands under staging/<app>/', () => {
    expect(buildStagingKey(ROW, '.mp4')).toBe(`staging/${APP}/${ROW}.mp4`);
  });
});

describe('assertObjectKey', () => {
  it('accepts a well-formed key', () => {
    expect(() => assertObjectKey(`uploads/${SUB}/x/y/z/w/a--${ROW}.png`)).not.toThrow();
  });
  it.each([
    '',
    'images/abc.png',
    '/uploads/a/b',
    'uploads//a',
    'uploads/../a',
    'uploads/a/./b',
    'uploads/a b/c',
    `uploads/${'a'.repeat(520)}`,
  ])('refuses %p', (key) => {
    expect(() => assertObjectKey(key)).toThrow();
  });
});

describe('isLegacyKey', () => {
  it('tells an old disk path from a bucket key', () => {
    expect(isLegacyKey('images/abc.png')).toBe(true);
    expect(isLegacyKey('media/acct/abc.mp4')).toBe(true);
    expect(isLegacyKey(`uploads/${SUB}/a/b/c/d/e--${ROW}.png`)).toBe(false);
    expect(isLegacyKey(`staging/${APP}/${ROW}.png`)).toBe(false);
  });
});
