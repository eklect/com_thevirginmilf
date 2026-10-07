import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthFlowService } from './auth-flow.service';
import { AuthSessionEntity } from './auth-session.entity';
import { AuthSessionService } from './auth-session.service';
import { MapOAuthClient } from './map-oauth.client';
import { MapTokenVerifier } from './map-token-verifier';
import { RegisterModule } from '../register/register.module';

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
  // RegisterModule: the callback finishes a signup started with a provider
  // button, which is the register service's job. The other direction — the
  // register controller starting the flow — goes through this module's global
  // exports, so there is no cycle to declare.
  imports: [TypeOrmModule.forFeature([AuthSessionEntity]), RegisterModule],
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
    AuthFlowService,
  ],
  exports: [
    AuthConfig,
    MapOAuthClient,
    MapTokenVerifier,
    AuthSessionService,
    AuthFlowService,
  ],
})
export class AuthSessionModule {}
