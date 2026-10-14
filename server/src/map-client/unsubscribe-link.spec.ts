import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import {
  MapClientService,
  UNSUBSCRIBES_SIGN_SCOPE,
} from './map-client.service';
import {
  listUnsubscribeHeaders,
  signUnsubscribeLink,
} from './unsubscribe-link';

// MAP's worked example (its `unsubscribe-link.spec.ts` asserts the same), so
// a drift in the recipe on either side fails a test.
const KEY_HEX =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SUB = '01890a5d-ac96-774b-bcce-b302099a8057';

describe('signUnsubscribeLink', () => {
  it('matches the contract worked example exactly', () => {
    expect(
      signUnsubscribeLink(
        {
          slug: 'com-belenzo',
          keyHex: KEY_HEX,
          linkBase: 'https://map.mucciandco.com/unsubscribe',
        },
        SUB,
      ),
    ).toBe(
      'https://map.mucciandco.com/unsubscribe/com-belenzo/01890a5d-ac96-774b-bcce-b302099a8057/k802ZTk2a3C1KSXc2ys9AXjZoppgNbjJaI3G1qWRpTo',
    );
  });

  it('builds both one-click headers, the link in angle brackets', () => {
    expect(listUnsubscribeHeaders('https://x.test/u/1')).toEqual({
      'List-Unsubscribe': '<https://x.test/u/1>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('MapClientService.unsubscribeLink', () => {
  const env: Record<string, string> = {
    MAP_INTERNAL_URL: 'http://map.internal',
    MAP_CLIENT_ID: 'client',
    MAP_CLIENT_SECRET: 'secret',
    MAP_ISSUER: 'https://map.example.test/',
  };
  const config = {
    getOrThrow: (name: string) => env[name],
    get: (name: string, fallback?: string) => env[name] ?? fallback,
  } as unknown as ConfigService;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let fetchMock: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('fetches the key once with its own scope, then signs locally', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/oauth/token')) {
        const body = JSON.parse(init?.body as string) as { scope: string };
        expect(body.scope).toBe(UNSUBSCRIBES_SIGN_SCOPE);
        return Promise.resolve(
          json(200, {
            access_token: 't',
            token_type: 'Bearer',
            expires_in: 900,
            scope: body.scope,
          }),
        );
      }
      expect(url).toBe(
        'http://map.internal/api/service/applications/me/unsubscribe-key',
      );
      return Promise.resolve(
        json(200, {
          slug: 'com-belenzo',
          key: KEY_HEX,
          linkBase: 'https://map.mucciandco.com/unsubscribe',
        }),
      );
    });
    const client = new MapClientService(config);

    const [a, b] = await Promise.all([
      client.unsubscribeLink(SUB),
      client.unsubscribeLink(SUB),
    ]);
    expect(a).toMatch(/\/k802ZTk2a3C1KSXc2ys9AXjZoppgNbjJaI3G1qWRpTo$/);
    expect(b).toBe(a);
    expect(await client.unsubscribeLink('another-sub')).toMatch(
      /^https:\/\/map\.mucciandco\.com\/unsubscribe\/com-belenzo\/another-sub\//,
    );
    // One token + one key fetch, however many links.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.emailPreferencesUrl).toBe(
      'https://map.example.test/email-preferences',
    );
  });

  it('returns null and warns (never the key) when MAP will not grant the scope, then holds off', async () => {
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_scope' }));
    const client = new MapClientService(config);

    expect(await client.unsubscribeLink(SUB)).toBeNull();
    expect(await client.unsubscribeLink(SUB)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns null for a malformed key without logging it', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/oauth/token')
          ? json(200, {
              access_token: 't',
              token_type: 'Bearer',
              expires_in: 900,
              scope: 's',
            })
          : json(200, {
              slug: 'x',
              key: 'not-hex-SECRET',
              linkBase: 'https://m/u',
            }),
      ),
    );
    const client = new MapClientService(config);
    expect(await client.unsubscribeLink(SUB)).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });
});
