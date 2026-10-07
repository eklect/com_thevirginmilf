import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CreateMapUserInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  /**
   * The signup form's consent box. MAP records the acceptance — version, time,
   * address and browser — against the identity it creates, so every venture's
   * signup is one record at the one place that owns the account.
   */
  termsAccepted: boolean;
  acceptedIp?: string;
  acceptedUserAgent?: string;
};

export type MapUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * One page of `GET /api/service/applications/me/opt-outs`: every MAP user who
 * removed this application in the portal, ordered by `sub`. `next` is the
 * last `sub` on the page, to pass back as `after`, or null on the final page.
 */
export type OptOutPage = {
  asOf: string;
  subs: string[];
  next: string | null;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

/** Renew this many seconds before expiry, so a token never dies mid-flight. */
const RENEW_MARGIN_SECONDS = 60;

/** The scopes this app asks MAP for, each cached as its own token. */
export const PROVISION_SCOPE = 'users:provision';
export const INSTALLS_READ_SCOPE = 'installs:read';

/**
 * MAP refused this app the right it asked for: the scope is not granted, the
 * credentials are wrong, or the application is deactivated. All of them are
 * OUR configuration, none of them is transient, and a caller that polls
 * should say so once rather than every tick. A 503 to a visitor like any
 * other MAP failure.
 */
export class MapAccessDeniedError extends ServiceUnavailableException {
  constructor(
    readonly upstreamStatus: number,
    readonly detail: string,
  ) {
    super('This service is not correctly registered with the identity provider.');
  }
}

/**
 * How this API talks to MAP as ITSELF, with nobody signed in.
 *
 * MAP owns identity: it stores the password, hashes it, and is the only thing that can
 * authenticate the person afterwards. This app never sees a password again after
 * forwarding it here, and stores nothing resembling one.
 *
 * Authentication is the OAuth 2.0 `client_credentials` grant — the same `client_id` and
 * `client_secret` this app is registered with, exchanged at `/oauth/token` for a
 * short-lived bearer token. One token per scope: `users:provision` creates accounts at
 * signup, `installs:read` reads the opt-out feed. Asking for both in one token would
 * mean a venture not yet granted `installs:read` could not sign anybody up.
 *
 * > Previously this sent `x-api-key`/`x-api-secret` headers to `POST /users`. MAP was
 * > rebuilt as an OIDC provider and both the header scheme and that route were removed
 * > with it, so every call 404'd. There is no API-key plane to go back to; the client
 * > credentials ARE the credential now.
 */
@Injectable()
export class MapClientService {
  private readonly logger = new Logger(MapClientService.name);

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  /** One cached token per scope, each kept until shortly before it expires (15 minutes). */
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(config: ConfigService) {
    // Server-to-server, so the INTERNAL address: it skips TLS and avoids resolving the
    // browser-facing `.test` hostname from inside the network. Tokens still carry the
    // public issuer in `iss` regardless of which address minted them.
    this.baseUrl = config
      .getOrThrow<string>('MAP_INTERNAL_URL')
      .replace(/\/+$/, '');
    this.clientId = config.getOrThrow<string>('MAP_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('MAP_CLIENT_SECRET');
  }

  /**
   * Creates the identity. Returns MAP's user id, which is the only handle this app
   * keeps — every row we own is keyed by it.
   *
   * Throws `ConflictException` when the address is already registered, so the caller
   * can say so plainly rather than reporting a generic failure.
   */
  async createUser(input: CreateMapUserInput): Promise<MapUser> {
    // A rotated signing key or a revoked token both surface as a 401 on a token we
    // believed was good. Discarding it and retrying once turns that into a slow request
    // instead of a failed signup.
    let response = await this.send('/api/service/users', input, PROVISION_SCOPE);
    if (response.status === 401) {
      this.tokens.delete(PROVISION_SCOPE);
      response = await this.send('/api/service/users', input, PROVISION_SCOPE);
    }

    if (response.status === 409) {
      throw new ConflictException('That email is already registered.');
    }

    if (!response.ok) {
      // The upstream status is deliberately not forwarded. A 401 or 403 from MAP means
      // OUR credentials or scopes are wrong, which is not the visitor's fault and must
      // not be reported as theirs.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `MAP create user returned ${response.status}: ${detail.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        'We could not create your account just now. Please try again.',
      );
    }

    const body = (await response.json()) as { user: MapUser };
    return body.user;
  }

  /**
   * One page of the people who removed this application in MAP's portal —
   * the estate's per-venture opt-out. `MapOptoutsScheduler` pages through it
   * every five minutes and mirrors the result into `map_optouts`.
   *
   * Throws `MapAccessDeniedError` when MAP will not grant `installs:read` (or
   * refuses the token it did grant), so the caller can warn once and keep
   * what it last synced rather than treating a missing grant as "nobody has
   * opted out".
   */
  async listOptOuts(after: string | null, limit = 1000): Promise<OptOutPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (after) query.set('after', after);
    const path = `/api/service/applications/me/opt-outs?${query.toString()}`;

    let response = await this.get(path, INSTALLS_READ_SCOPE);
    if (response.status === 401) {
      this.tokens.delete(INSTALLS_READ_SCOPE);
      response = await this.get(path, INSTALLS_READ_SCOPE);
    }

    // 404 as well: a MAP older than this venture has no feed to serve, which is
    // the same "not until the registration catches up" as a missing scope.
    if ([401, 403, 404].includes(response.status)) {
      const detail = await response.text().catch(() => '');
      throw new MapAccessDeniedError(response.status, detail.slice(0, 500));
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `MAP opt-outs returned ${response.status}: ${detail.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException('Identity provider returned an error');
    }

    const body = (await response.json()) as Partial<OptOutPage>;
    return {
      asOf: typeof body.asOf === 'string' ? body.asOf : new Date().toISOString(),
      subs: Array.isArray(body.subs)
        ? body.subs.filter((sub): sub is string => typeof sub === 'string')
        : [],
      next: typeof body.next === 'string' && body.next ? body.next : null,
    };
  }

  private async send(path: string, body: unknown, scope: string): Promise<Response> {
    const token = await this.accessToken(scope);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      // Never log `cause` with the request: the body carries a plaintext password.
      this.logger.error(`MAP POST ${path} could not connect`, cause);
      throw new ServiceUnavailableException('Identity provider unreachable');
    }
  }

  private async get(path: string, scope: string): Promise<Response> {
    const token = await this.accessToken(scope);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch (cause) {
      this.logger.error(`MAP GET ${path} could not connect`, cause);
      throw new ServiceUnavailableException('Identity provider unreachable');
    }
  }

  /**
   * The cached service token for one scope, minted on demand.
   *
   * Fetching one per call would multiply the request count for no benefit — the token
   * is not bound to a user, a session or a request, only to this application and the
   * scope it was asked for.
   */
  private async accessToken(scope: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > now) {
      return cached.token;
    }

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
      });
    } catch (cause) {
      this.logger.error('MAP token endpoint could not connect', cause);
      throw new ServiceUnavailableException('Identity provider unreachable');
    }

    if (!response.ok) {
      // MAP answers RFC 6749 error bodies. These are all OUR misconfiguration —
      // a wrong secret, a client not granted the scope, a deactivated application —
      // so log the detail and tell the caller nothing about it.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `MAP token endpoint returned ${response.status} for scope ${scope}: ${detail.slice(0, 500)}`,
      );
      // `invalid_scope` and `unauthorized_client` come back as 400; a bad
      // secret as 401. All of them mean "not until somebody fixes the
      // registration", which a polling caller wants to tell apart from an
      // outage.
      if ([400, 401, 403].includes(response.status)) {
        throw new MapAccessDeniedError(response.status, detail.slice(0, 500));
      }
      throw new ServiceUnavailableException(
        'This service is not correctly registered with the identity provider.',
      );
    }

    const tokens = (await response.json()) as TokenResponse;
    const token = {
      token: tokens.access_token,
      expiresAt: now + tokens.expires_in - RENEW_MARGIN_SECONDS,
    };
    this.tokens.set(scope, token);
    return token.token;
  }
}
