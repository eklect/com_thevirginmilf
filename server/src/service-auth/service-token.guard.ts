import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiClientsService } from './api-clients.service';
import { SERVICE_SCOPE_KEY } from './service-auth.decorators';
import { ServiceTokenService } from './service-token.service';

/**
 * Authenticates a SERVER holding one of this venture's bearer tokens.
 *
 * Sits beside `ServiceKeyGuard`, which answers a different question (a fixed
 * shared secret for one known caller). This one is for keys an admin issues
 * and revokes from the screen: the token proves the key minted it, and the
 * row proves the key still stands. Re-reading the row on every call is what
 * makes Revoke immediate rather than "within fifteen minutes".
 *
 * Use with `@Public()` on the controller — the staff-session guard runs first
 * and would otherwise refuse a caller with no cookie.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: ServiceTokenService,
    private readonly clients: ApiClientsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (!/^bearer$/i.test(scheme ?? '') || !token) {
      throw new UnauthorizedException('A bearer service token is required');
    }

    const claims = await this.tokens.verify(token);
    const client = await this.clients.findByClientId(claims.sub);
    if (!client || client.revokedAt) {
      throw new UnauthorizedException('The API key behind this token has been revoked');
    }

    const stillGranted = new Set(client.scopes ?? []);
    const scopes = claims.scope.split(' ').filter((scope) => scope && stillGranted.has(scope));

    const required = this.reflector.getAllAndOverride<string | undefined>(SERVICE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !scopes.includes(required)) {
      throw new ForbiddenException(`This call needs the ${required} scope`);
    }

    this.clients.touchLastUsed(client.id);
    request.serviceClient = { id: client.id, clientId: client.clientId, name: client.name, scopes };
    return true;
  }
}
