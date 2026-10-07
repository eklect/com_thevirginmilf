import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { ApiClientEntity } from './api-client.entity';
import { ServiceAuthConfig } from './service-auth.config';

export interface ServiceTokenClaims {
  /** The key's `client_id`. */
  sub: string;
  /** Space-separated, as OAuth writes it. */
  scope: string;
  jti: string;
  exp: number;
}

/**
 * Mints and verifies the bearer tokens this venture hands to other servers.
 *
 * HS256 with a secret only this process holds: the tokens are consumed here
 * and nowhere else, so there is nothing to publish a public key for. `aud` is
 * `<venture>:service` so a token minted by one venture reads as foreign at
 * another even if two of them were ever given the same secret.
 */
@Injectable()
export class ServiceTokenService {
  constructor(private readonly config: ServiceAuthConfig) {}

  async sign(client: ApiClientEntity, scopes: string[]): Promise<{ token: string; expiresIn: number }> {
    const token = await new SignJWT({ scope: scopes.join(' ') })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(client.clientId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.config.ttlSeconds}s`)
      .sign(this.config.secret);
    return { token, expiresIn: this.config.ttlSeconds };
  }

  async verify(token: string): Promise<ServiceTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.config.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || !payload.exp) {
        throw new Error('missing claims');
      }
      return {
        sub: payload.sub,
        scope: typeof payload.scope === 'string' ? payload.scope : '',
        jti: payload.jti,
        exp: payload.exp,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired service token');
    }
  }
}
