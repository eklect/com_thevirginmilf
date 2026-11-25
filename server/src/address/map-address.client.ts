import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A person's physical address, as MAP holds it. Every part may be empty. */
export type MapAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  updatedAt: string;
};

export type MapAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

const SCOPE_READ = 'address:read';
const SCOPE_WRITE = 'address:write';

/** How long a read is reused. A save here replaces the cached copy at once. */
const CACHE_MS = 60_000;
const CACHE_MAX = 5_000;
const TIMEOUT_MS = 8_000;
const RENEW_MARGIN_SECONDS = 60;

/**
 * A person's physical address, read from and written to MAP.
 *
 * MAP holds the one address for every Mucci & Co site. This app keeps no copy
 * in its database: it asks MAP when it needs the address and writes back when
 * the person changes it, so a change made on any site is what every other
 * site reads next. A read is reused for a minute, which is the longest a
 * change made elsewhere takes to show here.
 *
 * The same file in every backend. It mints its own `client_credentials`
 * tokens for `address:read` and `address:write` rather than going through
 * `MapClientService`, whose internals differ from repo to repo.
 *
 * `address:write` is honoured by MAP only with the `sid` of a live session
 * belonging to that person, so this app can save an address for whoever is
 * signed in to it right now and for nobody else.
 */
@Injectable()
export class MapAddressClient {
  private readonly logger = new Logger(MapAddressClient.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokens = new Map<string, { value: string; expiresAt: number }>();
  private readonly cache = new Map<string, { at: number; address: MapAddress | null }>();

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('MAP_INTERNAL_URL').replace(/\/+$/, '');
    this.clientId = config.getOrThrow<string>('MAP_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('MAP_CLIENT_SECRET');
  }

  /** Null for somebody who has never given an address. */
  async get(sub: string, options: { fresh?: boolean } = {}): Promise<MapAddress | null> {
    const cached = this.cache.get(sub);
    if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) {
      return cached.address;
    }
    const response = await this.call('GET', this.path(sub), undefined, SCOPE_READ);
    if (response.status === 404) return this.remember(sub, null);
    if (!response.ok) await this.fail(response, 'read the address');
    const body = (await response.json()) as { address: MapAddress | null };
    return this.remember(sub, body.address);
  }

  /**
   * Replaces the whole address. Every part blank removes it. `sessionId` is
   * the `sid` of the person's own MAP session (`RequestUser.mapSessionId`).
   */
  async save(
    sub: string,
    sessionId: string,
    address: MapAddressInput,
  ): Promise<MapAddress | null> {
    const response = await this.call(
      'PUT',
      this.path(sub),
      { sessionId, ...address },
      SCOPE_WRITE,
    );
    // MAP's 400 is about the values, or a session that has ended: both are
    // the person's to fix, so its message is forwarded.
    if (response.status === 400) {
      const detail = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message = Array.isArray(detail?.message)
        ? detail.message.join('. ')
        : typeof detail?.message === 'string'
          ? detail.message
          : 'Check the address and try again.';
      throw new BadRequestException(
        message.includes('sessionId') ? 'Sign in again to change your address.' : message,
      );
    }
    if (!response.ok) await this.fail(response, 'save the address');
    const body = (await response.json()) as { address: MapAddress | null };
    return this.remember(sub, body.address);
  }

  private path(sub: string): string {
    return `/api/service/users/${encodeURIComponent(sub)}/address`;
  }

  private remember(sub: string, address: MapAddress | null): MapAddress | null {
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(sub, { at: Date.now(), address });
    return address;
  }

  /** One request, retried once with a fresh token if MAP no longer accepts the cached one. */
  private async call(
    method: 'GET' | 'PUT',
    path: string,
    body: unknown,
    scope: string,
  ): Promise<Response> {
    const once = async () => {
      const token = await this.accessToken(scope);
      try {
        return await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (cause) {
        this.logger.error(`MAP ${method} address could not connect`, cause);
        throw new ServiceUnavailableException('Identity provider unreachable');
      }
    };
    let response = await once();
    if (response.status === 401) {
      this.tokens.delete(scope);
      response = await once();
    }
    return response;
  }

  private async fail(response: Response, what: string): Promise<never> {
    const detail = await response.text().catch(() => '');
    this.logger.error(`MAP could not ${what}: ${response.status} ${detail.slice(0, 300)}`);
    throw new ServiceUnavailableException(
      response.status === 403
        ? 'This site has not been given access to addresses yet.'
        : 'Your address is unavailable right now. Try again in a moment.',
    );
  }

  private async accessToken(scope: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > now) return cached.value;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      this.logger.error('MAP token endpoint could not connect', cause);
      throw new ServiceUnavailableException('Identity provider unreachable');
    }
    if (!response.ok) {
      // Our registration, not the visitor's doing: most often the scope has
      // not been granted to this application at MAP yet.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `MAP token endpoint returned ${response.status} for scope ${scope}: ${detail.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'This site has not been given access to addresses yet.',
      );
    }
    const minted = (await response.json()) as { access_token: string; expires_in: number };
    this.tokens.set(scope, {
      value: minted.access_token,
      expiresAt: now + minted.expires_in - RENEW_MARGIN_SECONDS,
    });
    return minted.access_token;
  }
}
