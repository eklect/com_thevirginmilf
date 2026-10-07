import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { ServiceScope } from './scopes';

export const SERVICE_SCOPE_KEY = 'serviceAuth:scope';

/** The scope a service route needs. Checked by `ServiceTokenGuard`. */
export const RequireScope = (scope: ServiceScope) => SetMetadata(SERVICE_SCOPE_KEY, scope);

/** The server on the other end of a service call, as the guard resolved it. */
export interface ServiceClientPrincipal {
  id: string;
  clientId: string;
  name: string;
  /** The token's scopes that the key STILL grants. */
  scopes: string[];
}

declare module 'express' {
  interface Request {
    serviceClient?: ServiceClientPrincipal;
  }
}

export const CurrentServiceClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ServiceClientPrincipal => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.serviceClient!;
  },
);
