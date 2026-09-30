import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ADMIN_ONLY_KEY, IS_PUBLIC_KEY } from './auth.decorators';

/**
 * Enforces `@AdminOnly()`.
 *
 * Runs after `MapSessionGuard`, which is what puts `request.user` there —
 * guard order follows registration order in `auth.module.ts`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (!this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, targets)) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (!user.isAdmin) {
      throw new ForbiddenException('Requires a Virgin MILF administrator');
    }
    return true;
  }
}
