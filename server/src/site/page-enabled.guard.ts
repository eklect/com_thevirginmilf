import {
  CanActivate,
  ExecutionContext,
  Injectable,
  mixin,
  NotFoundException,
  Type,
} from '@nestjs/common';
import { Request } from 'express';
import { PageKey } from '../settings/settings.keys';
import { SettingsService } from '../settings/settings.service';

/**
 * Hides a route along with the page it serves.
 *
 * A switched-off page answers 404 — not 403, which would confirm there is
 * something there — for everyone except an admin, who can still see the page
 * they are editing. `request.user` is set by `MapSessionGuard` even on public
 * routes, and global guards run before route guards, so it is already there.
 */
export function PageEnabledGuard(key: PageKey): Type<CanActivate> {
  @Injectable()
  class PageEnabledMixin implements CanActivate {
    constructor(private readonly settings: SettingsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      if (request.user?.isAdmin) return true;
      if (await this.settings.isPageEnabled(key)) return true;
      throw new NotFoundException('Not found');
    }
  }
  return mixin(PageEnabledMixin);
}
