import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthConfig } from './auth.config';
import type { ProviderInfo } from './social-providers';

/** What `/oauth/token` answers with, for both grants. */
export interface MapTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * MAP's federation endpoints, as this app uses them.
 *
 * Uses global `fetch` rather than axios, matching `map-client/map-client.service.ts`
 * — the repo keeps its dependency surface deliberately small and has no HTTP
 * library.
 *
 * ## Why this is hand-rolled instead of `openid-client`
 *
 * MAP validates `/oauth/authorize` with `forbidNonWhitelisted: true` against a
 * DTO that has no `nonce` field. Every stock OIDC library sends `nonce` by
 * default, and gets back `400 property nonce should not exist`. Rather than
 * loosen MAP's validation to satisfy a library, this follows the hand-rolled
 * `jose` example in MAP's own README, which is the integration path MAP
 * documents and tests.
 *
 * ## Which host each call uses
 *
 * Browser redirects use `issuerUrl`; everything server-to-server uses
 * `internalUrl`. See `AuthConfig`.
 */
@Injectable()
export class MapOAuthClient {
  private readonly logger = new Logger(MapOAuthClient.name);
  private providersCache: { at: number; list: ProviderInfo[] } | null = null;

  constructor(private readonly config: AuthConfig) {}

  /** Step 1 — where to send the browser. */
  authorizeUrl(params: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    const url = new URL(`${this.config.issuerUrl}/oauth/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * Step 1, starting at an upstream provider instead of MAP's own sign-in page.
   *
   * MAP's `/api/auth/social/<key>` takes the SAME authorize URL as `return_to` —
   * as a same-origin path, so the origin is stripped — signs the person in
   * through the provider, and then continues to `/oauth/authorize`, which hands
   * the callback a code exactly as a password sign-in would. `terms_accepted=1`
   * says this site's signup form had its Terms box ticked; `onboarding=venture`
   * says this site runs its own onboarding and will send the welcome, so MAP
   * sends none. See MAP's README, "Social sign-in".
   */
  socialStartUrl(
    provider: string,
    authorizeUrl: string,
    options: { termsAccepted: boolean; venture: boolean },
  ): string {
    const authorize = new URL(authorizeUrl);
    const url = new URL(`${this.config.issuerUrl}/api/auth/social/${provider}`);
    url.searchParams.set(
      'return_to',
      `${authorize.pathname}${authorize.search}`,
    );
    if (options.termsAccepted) url.searchParams.set('terms_accepted', '1');
    if (options.venture) url.searchParams.set('onboarding', 'venture');
    return url.toString();
  }

  /**
   * Which providers MAP has credentials for, so the sign-in and signup pages
   * draw the right buttons. Public at MAP; cached here for five minutes so a
   * page load is not a round trip. Unreachable means no buttons, not an error.
   */
  async providers(): Promise<ProviderInfo[]> {
    const now = Date.now();
    if (this.providersCache && now - this.providersCache.at < 5 * 60_000) {
      return this.providersCache.list;
    }
    try {
      const response = await fetch(
        `${this.config.internalUrl}/api/auth/providers`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { providers?: ProviderInfo[] };
      const list = Array.isArray(body.providers) ? body.providers : [];
      this.providersCache = { at: now, list };
      return list;
    } catch (error) {
      this.logger.warn(
        `Could not list MAP's sign-in providers: ${String(error)}`,
      );
      return this.providersCache?.list ?? [];
    }
  }

  /** Step 2 — redeem the code. Single use, 60-second lifetime. */
  async exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<MapTokens> {
    return this.token({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });
  }

  /**
   * Renew. MAP rotates the refresh token on every use and treats a replay as
   * theft — revoking the whole token family *and* the SSO session behind it. So
   * a caller must never race two of these; `AuthSessionService` serialises them.
   */
  async refresh(refreshToken: string): Promise<MapTokens> {
    return this.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  /**
   * Live session state for an access token.
   *
   * This is the only way to learn that someone signed out elsewhere before their
   * access token expires — MAP has no back-channel logout, and a token stays
   * cryptographically valid for its full 15 minutes regardless. `{active:false}`
   * covers both "session revoked" and "token malformed"; the caller treats them
   * the same.
   */
  async introspect(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.internalUrl}/oauth/introspect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: accessToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
          }),
        },
      );

      if (!response.ok) {
        // A client-auth failure or a 5xx is our problem, not the user's. Failing
        // open here is deliberate: the token is still signature-verified and
        // unexpired, and signing everyone out because MAP hiccuped would turn a
        // blip in one service into an outage in another.
        this.logger.warn(
          `Introspection returned ${response.status}; treating the session as live`,
        );
        return true;
      }

      const body = (await response.json()) as { active?: boolean };
      return body.active === true;
    } catch (error) {
      this.logger.warn(
        `Introspection failed (${String(error)}); treating the session as live`,
      );
      return true;
    }
  }

  /**
   * Where to send the browser to end the MAP session.
   *
   * `allDevices` ends every SSO session that person holds anywhere, not just
   * this browser — see MAP's `logout_all` parameter. It must be a top-level
   * navigation, because MAP reads its own cookie to know who is leaving.
   */
  logoutUrl(allDevices: boolean): string {
    const url = new URL(`${this.config.issuerUrl}/oauth/logout`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set(
      'post_logout_redirect_uri',
      this.config.postLogoutRedirectUri,
    );
    if (allDevices) url.searchParams.set('logout_all', 'true');
    return url.toString();
  }

  private async token(payload: Record<string, string>): Promise<MapTokens> {
    let response: Response;
    try {
      response = await fetch(`${this.config.internalUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Could not reach the identity provider: ${String(error)}`,
      );
    }

    if (!response.ok) {
      // MAP answers RFC 6749 error bodies. Log the detail, tell the caller
      // nothing — `invalid_grant` on a refresh is the normal, expected way a
      // revoked session announces itself, not an incident.
      const detail = await response.text().catch(() => '');
      this.logger.debug(
        `Token endpoint returned ${response.status}: ${detail.slice(0, 500)}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    return (await response.json()) as MapTokens;
  }
}
