import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthConfig } from './auth.config';

/**
 * The claims MAP puts in an access token.
 *
 * `roles` is already resolved *for this application* by MAP's
 * `AccessService.resolveAccess`, so `admin` here means admin of this site —
 * not admin of everything. `global_admin` is the separate flag for the latter.
 */
export interface MapClaims {
  sub: string;
  sid: string;
  email: string;
  email_verified?: boolean;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  roles?: string[];
  global_admin?: boolean;
  exp: number;
}

/** Swappable so tests can verify against a local keypair instead of a network. */
export const JWKS_SOURCE = Symbol('JWKS_SOURCE');

/**
 * Verifies MAP access tokens locally.
 *
 * RS256 against MAP's published JWKS — not a shared secret. With HS256 every
 * site would hold the key that *signs* tokens, so any one of them could mint
 * tokens the others accept. `jose` caches the key set and refetches only when it
 * sees an unknown `kid`, so key rotation needs no coordination and no restart.
 *
 * Both `issuer` and `audience` are checked. Audience is the one that matters
 * most: it is what stops a token minted for another Mucci app being replayed
 * here. MAP stamps `aud` with the requesting application's `client_id`
 * precisely so this check can exist.
 *
 * Keys are fetched over the internal hostname while the issuer is verified as
 * the external one. That looks inconsistent and is not — see `AuthConfig`.
 */
@Injectable()
export class MapTokenVerifier {
  private jwks: JWTVerifyGetKey | null;

  constructor(
    private readonly config: AuthConfig,
    jwksSource?: JWTVerifyGetKey,
  ) {
    this.jwks = jwksSource ?? null;
  }

  /**
   * Built on first use, not in the constructor.
   *
   * Kept lazy so constructing the verifier never touches the network, and so a
   * misconfigured URL fails on the first sign-in rather than at boot.
   */
  private keySet(): JWTVerifyGetKey {
    this.jwks ??= createRemoteJWKSet(
      new URL(`${this.config.internalUrl}/.well-known/jwks.json`),
    );
    return this.jwks;
  }

  async verify(token: string): Promise<MapClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keySet(), {
        issuer: this.config.issuerUrl,
        audience: this.config.clientId,
      });
      return payload as unknown as MapClaims;
    } catch {
      // The reason is deliberately not echoed back. "expired" vs "bad signature"
      // tells an attacker which half of the token to keep working on. The
      // frontend also asserts this exact string to tell an auth 401 apart from
      // signed out.
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
