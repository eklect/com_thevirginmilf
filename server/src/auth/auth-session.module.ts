import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthSessionEntity } from './auth-session.entity';
import { AuthSessionService } from './auth-session.service';
import { MapOAuthClient } from './map-oauth.client';
import { MapTokenVerifier } from './map-token-verifier';

/**
 * The relying-party half of MAP: configuration, the OAuth client, the token
 * verifier, and the session store behind the browser's cookie.
 *
 * `@Global()` because the guards in `common/auth/auth.module.ts` need the
 * session service and the verifier, and that module is itself global — an
 * ordinary import would make the two circular.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuthSessionEntity])],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new AuthConfig(config),
    },
    MapOAuthClient,
    {
      provide: MapTokenVerifier,
      inject: [AuthConfig],
      useFactory: (config: AuthConfig) => new MapTokenVerifier(config),
    },
    AuthSessionService,
  ],
  exports: [AuthConfig, MapOAuthClient, MapTokenVerifier, AuthSessionService],
})
export class AuthSessionModule {}
