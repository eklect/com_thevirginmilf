import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VENTURE } from '../common/venture';

/**
 * Settings for the tokens this venture mints for other servers.
 *
 * Fails closed: with no `SERVICE_TOKEN_SECRET` the app does not boot, because
 * a token plane that silently signs with an empty key is worse than one that
 * is visibly absent. Generate one with `openssl rand -base64 48`.
 */
@Injectable()
export class ServiceAuthConfig {
  /** HS256 key. Rotating it invalidates every outstanding token (15 minutes of them). */
  readonly secret: Uint8Array;
  /** Token lifetime in seconds. 900 by default — the same as MAP's access tokens. */
  readonly ttlSeconds: number;
  /** `iss` and the prefix of `aud`. `common/venture.ts` unless overridden. */
  readonly issuer: string;

  constructor(config: ConfigService) {
    const secret = (config.get<string>('SERVICE_TOKEN_SECRET') ?? '').trim();
    if (secret.length < 32) {
      throw new Error(
        'SERVICE_TOKEN_SECRET must be set to at least 32 characters (openssl rand -base64 48). ' +
          'It signs the tokens issued to other servers at /service/oauth/token.',
      );
    }
    this.secret = new TextEncoder().encode(secret);

    const ttl = Number(config.get<string>('SERVICE_TOKEN_TTL_SECONDS') ?? '900');
    this.ttlSeconds = Number.isInteger(ttl) && ttl >= 60 && ttl <= 3600 ? ttl : 900;

    this.issuer = (config.get<string>('SERVICE_TOKEN_ISSUER') ?? '').trim() || VENTURE;
  }

  get audience(): string {
    return `${this.issuer}:service`;
  }
}
