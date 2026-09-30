import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * The authenticated principal, assembled from the MAP access token.
 *
 * Everything here comes from the token. This app has no user table and never
 * will — MAP owns every identity.
 *
 * It does keep two kinds of per-user row, `subscribers` and
 * `push_subscriptions`, both keyed on this `id`: whether to email the person
 * about streams, and which browsers to notify. Those are preferences, not an
 * account — they hold no credential, carry no foreign key, and a person with
 * neither is simply someone who has not opted in.
 */
export interface RequestUser {
  /** MAP user id (`sub`). */
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  /** MAP's `roles[]` claim, already resolved for this application. */
  roles: string[];
  /** `roles` contains `admin`, or the person is a MAP global admin. */
  isAdmin: boolean;
  /** MAP's `sid` claim — the SSO session this request rides on. */
  mapSessionId: string | null;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}

/** The whole principal. Only meaningful on a non-public route. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user!;
  },
);
