import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminApiClientsController } from './admin-api-clients.controller';
import { ApiClientEntity } from './api-client.entity';
import { ApiClientsService } from './api-clients.service';
import { OauthTokenController } from './oauth-token.controller';
import { ServiceAuthConfig } from './service-auth.config';
import { ServiceTokenGuard } from './service-token.guard';
import { ServiceTokenService } from './service-token.service';

/**
 * API keys for other servers, and the tokens they exchange them for.
 *
 * The same module is carried by every venture backend; only the entity list in
 * each `app.module.ts` and the admin decorator (`@AdminOnly()` here,
 * `@PlatformAdminOnly()` in the two SimpliCourt product repos) differ. A route
 * that serves such a server is `@Public()` plus `@UseGuards(ServiceTokenGuard)`
 * and names its scope with `@RequireScope(...)`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ApiClientEntity])],
  controllers: [OauthTokenController, AdminApiClientsController],
  providers: [ServiceAuthConfig, ApiClientsService, ServiceTokenService, ServiceTokenGuard],
  exports: [ServiceTokenGuard, ServiceTokenService, ApiClientsService],
})
export class ServiceAuthModule {}
