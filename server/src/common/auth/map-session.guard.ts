import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthSessionService } from '../../auth/auth-session.service';
import {
  MapTokenVerifier,
  type MapClaims,
} from '../../auth/map-token-verifier';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { RequestUser } from './principal';

/** The MAP role that makes someone an administrator of this site. */
export const ADMIN_ROLE = 'admin';

/**
 * Authenticates a request and assembles the principal.
 *
 * Ported from `com_simplicourt_app`, minus its firm/tenancy machinery — this
 * site has no tenant, so a verified token IS the whole principal.
 *
 * ## Public routes still look
 *
 * On a `@Public()` route the guard never refuses, but it does try: if a valid
 * session cookie is present, `request.user` is set. That is what lets
 * `GET /auth/me` answer who is signed in, and lets an admin preview a page they
 * have switched off while everyone else gets a 404.
 *
 * ## Two ways to present a credential
 *
 * The session cookie is how the browser does it: the token behind it lives
 * server-side in `auth_sessions`, is renewed silently and revalidated against
 * MAP on a short cache. A bearer token is also accepted on non-public routes,
 * for a script or a service caller with no cookie jar — verification only, no
 * session.
 */
@Injectable()
export class MapSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionService,
    private readonly verifier: MapTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    const claims = await this.authenticate(request, isPublic === true);
    if (claims) request.user = principalFrom(claims);

    if (isPublic) return true;
    if (!request.user) throw new UnauthorizedException('Sign in required');
    return true;
  }

  /**
   * Cookie first, bearer second.
   *
   * `lenient` is the public-route mode: a missing or dead credential answers
   * `null` instead of throwing, because the route does not need one.
   */
  private async authenticate(
    request: Request,
    lenient: boolean,
  ): Promise<MapClaims | null> {
    const cookie = this.sessions.readCookie(request);
    if (cookie) {
      const active = await this.sessions.resolve(cookie);
      if (!active) {
        if (lenient) return null;
        throw new UnauthorizedException('Invalid or expired session');
      }
      try {
        return await this.verifier.verify(active.accessToken);
      } catch (error) {
        if (lenient) return null;
        throw error;
      }
    }

    const header = request.header('authorization');
    if (!header) {
      if (lenient) return null;
      throw new UnauthorizedException('Sign in required');
    }
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      if (lenient) return null;
      throw new UnauthorizedException(
        'Authorization header must be `Bearer <token>`',
      );
    }
    try {
      return await this.verifier.verify(token);
    } catch (error) {
      if (lenient) return null;
      throw error;
    }
  }
}

function principalFrom(claims: MapClaims): RequestUser {
  const roles = claims.roles ?? [];
  return {
    id: claims.sub,
    email: claims.email,
    firstName: claims.given_name ?? null,
    lastName: claims.family_name ?? null,
    // MAP sends OIDC-standard `name`; there is no `displayName` claim.
    displayName: claims.name ?? null,
    roles,
    // `roles` is resolved by MAP *for this application*, so `admin` here means
    // admin of the corporate site. `global_admin` is the wider flag — a
    // Mucci-wide admin who was never granted this app still administers it.
    isAdmin: roles.includes(ADMIN_ROLE) || claims.global_admin === true,
    mapSessionId: claims.sid ?? null,
  };
}
