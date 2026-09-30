import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Everything this app needs to be a relying party of MAP.
 *
 * ## Why this fails closed
 *
 * Nothing here has a fallback: a missing value throws on boot with every
 * problem listed at once. A relying party that boots with a made-up client id
 * or an empty encryption secret does not fail visibly — it fails by accepting
 * something it should not.
 *
 * ## The two hostnames
 *
 * MAP is a `kind: identity` role on the dev box, which gives it both a
 * browser-facing name and an in-container one, and they are not
 * interchangeable:
 *
 * - `issuerUrl` — where the *browser* is sent, and the literal `iss` claim in
 *   every token. Verification always checks this string.
 * - `internalUrl` — where *this process* talks: token exchange, JWKS,
 *   introspection. Skips TLS and mkcert's CA entirely by staying inside the
 *   container network.
 *
 * Fetching keys from one and verifying the issuer as the other is correct and
 * intended.
 */
@Injectable()
export class AuthConfig {
  readonly issuerUrl: string;
  readonly internalUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly postLogoutRedirectUri: string;

  /**
   * Every callback URL registered with MAP, in order. The one used is chosen per
   * request by matching the browser's origin, because the same backend serves
   * both `https://thevirginmilf.test` and — through the Vite dev proxy —
   * `http://localhost:5173`. MAP matches redirect URIs as exact whole strings,
   * so the value sent to `/oauth/authorize` and the value sent to `/oauth/token`
   * must be byte-identical, and both must be registered.
   */
  readonly redirectUris: string[];

  readonly cookieName: string;
  readonly transactionCookieName: string;
  readonly encryptionSecret: string;
  readonly introspectCacheMs: number;
  readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.isProduction =
      config.get<string>('NODE_ENV', 'development').trim() === 'production';
    this.cookieName = config
      .get<string>('SESSION_COOKIE_NAME', 'tvm_session')
      .trim();
    this.transactionCookieName = `${this.cookieName}_tx`;
    this.introspectCacheMs =
      Number(config.get<string>('INTROSPECT_CACHE_SECONDS', '60')) * 1000;

    const problems: string[] = [];
    const required = (key: string): string => {
      const value = config.get<string>(key, '').trim();
      if (!value) problems.push(`${key} is required`);
      return value;
    };

    this.issuerUrl = required('MAP_ISSUER').replace(/\/+$/, '');
    this.internalUrl = (
      config.get<string>('MAP_INTERNAL_URL', '').trim() || this.issuerUrl
    ).replace(/\/+$/, '');
    this.clientId = required('MAP_CLIENT_ID');
    this.clientSecret = required('MAP_CLIENT_SECRET');
    this.encryptionSecret = required('SESSION_ENCRYPTION_SECRET');
    this.postLogoutRedirectUri = required('MAP_POST_LOGOUT_REDIRECT_URI');

    this.redirectUris = required('MAP_REDIRECT_URIS')
      .split(',')
      .map((uri) => uri.trim())
      .filter(Boolean);
    if (this.redirectUris.length === 0) {
      problems.push('MAP_REDIRECT_URIS must list at least one callback URL');
    }

    if (this.isProduction && !this.issuerUrl.startsWith('https://')) {
      problems.push('MAP_ISSUER must be https:// in production');
    }

    if (problems.length > 0) {
      // All of them at once. Fixing one variable, rebooting, and discovering the
      // next is a miserable way to configure a service.
      throw new Error(
        `Invalid MAP configuration:\n  - ${problems.join('\n  - ')}`,
      );
    }
  }

  /**
   * The registered callback URL matching where this request arrived, so the
   * value survives the round trip unchanged.
   *
   * Falls back to the first registered URI rather than to the request's own
   * origin: an unregistered value would be rejected by MAP anyway, and echoing
   * an attacker-supplied Host header into an OAuth redirect is the shape of a
   * real vulnerability even when it does not pay off here.
   */
  redirectUriFor(origin: string | undefined): string {
    const match = this.redirectUris.find((uri) => uri.startsWith(`${origin}/`));
    return match ?? this.redirectUris[0];
  }
}
