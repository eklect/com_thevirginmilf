import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestUser } from '../common/auth/principal';

/** This site's help center. The ONE line that differs between copies of this module. */
export const HELP_VENTURE = 'thevirginmilf';

const TIMEOUT_MS = 8_000;
const RENEW_MARGIN_MS = 60_000;
const CACHE_MS = 60_000;
const CACHE_MAX = 500;

export interface HelpResponse {
  status: number;
  contentType: string;
  cacheControl: string | null;
  body: string;
}

const unreachable = (): HelpResponse => ({
  status: 502,
  contentType: 'application/json',
  cacheControl: 'no-store',
  body: JSON.stringify({ message: 'The help center is unavailable right now. Please try again shortly.' }),
});

/**
 * The call to `com_mucciandco_help`, over the internal network.
 *
 * Reads go through unchanged, so a new read route in the help center needs no
 * change here. The venture is fixed in this file: nothing the browser sends can
 * choose another. With a signed-in person, this server's key vouches for them,
 * because a MAP token is bound to this application and cannot go any further.
 *
 * Public reads need no key. If the key is missing, revoked or the token exchange
 * fails, public articles go on working and only restricted reads and comments
 * are refused.
 */
@Injectable()
export class HelpClientService {
  private readonly logger = new Logger(HelpClientService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token: { value: string; expiresAt: number } | null = null;
  /** Signed-out responses only, so a restricted article can never be served from here. */
  private readonly cache = new Map<string, { until: number; response: HelpResponse }>();

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('HELP_API_URL') ?? 'http://help.mucciandco.internal/api').trim().replace(/\/+$/, '');
    this.clientId = (config.get<string>('HELP_CLIENT_ID') ?? '').trim();
    this.clientSecret = (config.get<string>('HELP_CLIENT_SECRET') ?? '').trim();
  }

  private async accessToken(renew = false): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) return null;
    if (!renew && this.token && this.token.expiresAt - RENEW_MARGIN_MS > Date.now()) return this.token.value;
    this.token = null;
    try {
      const response = await fetch(`${this.baseUrl}/service/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.error(`The help center refused this site's key (${response.status}). Check HELP_CLIENT_ID and HELP_CLIENT_SECRET.`);
        return null;
      }
      const data = (await response.json()) as { access_token: string; expires_in: number };
      this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
      return this.token.value;
    } catch (error) {
      this.logger.error(`Could not reach the help center for a token: ${String(error)}`);
      return null;
    }
  }

  private actingHeaders(user: RequestUser): Record<string, string> {
    const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
    return {
      'x-help-acting-sub': user.id,
      // Percent-encoded: a header cannot carry most of Unicode.
      'x-help-acting-name': encodeURIComponent(name),
      'x-help-acting-admin': user.isAdmin ? 'true' : 'false',
    };
  }

  private async send(path: string, init: RequestInit): Promise<HelpResponse> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/json',
        cacheControl: response.headers.get('cache-control'),
        body: await response.text(),
      };
    } catch (error) {
      this.logger.error(`Help center call failed: ${String(error)}`);
      return unreachable();
    }
  }

  /** A read. `suffix` is the validated path after the venture, query string included. */
  async read(suffix: string, user: RequestUser | undefined): Promise<HelpResponse> {
    const path = `/${HELP_VENTURE}${suffix}`;
    if (!user) {
      const hit = this.cache.get(path);
      if (hit && hit.until > Date.now()) return hit.response;
      const response = await this.send(path, { method: 'GET' });
      if (response.status === 200) {
        if (this.cache.size >= CACHE_MAX) this.cache.clear();
        this.cache.set(path, { until: Date.now() + CACHE_MS, response });
      }
      return response;
    }

    const attempt = async (renew: boolean) => {
      const token = await this.accessToken(renew);
      return this.send(path, {
        method: 'GET',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...this.actingHeaders(user) },
      });
    };
    const first = await attempt(false);
    // A person with a session is only ever told "sign in" if the key let them
    // down, usually a token that has just expired. Try once with a fresh one.
    return first.status === 401 ? attempt(true) : first;
  }

  /** A comment write, for the person signed in here. */
  async write(method: 'POST' | 'PATCH' | 'DELETE', suffix: string, body: unknown, user: RequestUser): Promise<HelpResponse> {
    const attempt = async (renew: boolean): Promise<HelpResponse> => {
      const token = await this.accessToken(renew);
      if (!token) return unreachable();
      return this.send(`/service/comments${suffix}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...this.actingHeaders(user),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    };
    const first = await attempt(false);
    return first.status === 401 ? attempt(true) : first;
  }
}
