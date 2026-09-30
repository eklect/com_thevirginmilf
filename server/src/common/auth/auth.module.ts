import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MapSessionGuard } from './map-session.guard';
import { RolesGuard } from './roles.guard';

/**
 * The authorisation layer: every route is guarded by default.
 *
 * Guard order is registration order — authenticate, then authorise.
 * `RolesGuard` reads `request.user`, so it cannot run first. The session
 * service and verifier come from the global `AuthSessionModule`.
 */
@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: MapSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
