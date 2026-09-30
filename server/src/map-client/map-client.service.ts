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
};

export type MapUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

/** Renew this many seconds before expiry, so a token never dies mid-flight. */
const RENEW_MARGIN_SECONDS = 60;

/**
 * How this API talks to MAP as ITSELF, with nobody signed in.
 *
 * MAP owns identity: it stores the password, hashes it, and is the only thing that can
 * authenticate the person afterwards. This app never sees a password again after
 * forwarding it here, and stores nothing resembling one.
 *
 * Authentication is the OAuth 2.0 `client_credentials` grant — the same `client_id` and
 * `client_secret` this app is registered with, exchanged at `/oauth/token` for a
 * short-lived bearer token carrying the `users:provision` scope.
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

  /** Cached until shortly before it expires — it lives 15 minutes. */
  private token: { value: string; expiresAt: number } | null = null;

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
    let response = await this.send('/api/service/users', input);
    if (response.status === 401) {
      this.token = null;
      response = await this.send('/api/service/users', input);
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

  private async send(path: string, body: unknown): Promise<Response> {
    const token = await this.accessToken();

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

  /**
   * The cached service token, minted on demand.
   *
   * Fetching one per signup would triple the request count for no benefit — the token
   * is not bound to a user, a session or a request, only to this application.
   */
  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt > now) {
      return this.token.value;
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
          scope: 'users:provision',
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
        `MAP token endpoint returned ${response.status}: ${detail.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        'This service is not correctly registered with the identity provider.',
      );
    }

    const tokens = (await response.json()) as TokenResponse;
    this.token = {
      value: tokens.access_token,
      expiresAt: now + tokens.expires_in - RENEW_MARGIN_SECONDS,
    };
    return this.token.value;
  }
}
