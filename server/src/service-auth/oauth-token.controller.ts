import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import { ApiClientsService } from './api-clients.service';
import { OauthTokenDto } from './dto/oauth-token.dto';
import { ServiceTokenService } from './service-token.service';

/**
 * `POST /service/oauth/token` — the `client_credentials` grant for keys this
 * venture issued. The caller is the My Company Tools app, holding a key from
 * `/admin/api-access`; it presents the id and secret (HTTP Basic, a form, or
 * JSON — all three are accepted) and gets a 15-minute bearer token for the
 * service plane. Errors use OAuth's `{ error, error_description }` shape, the
 * same as MAP's token endpoint.
 */
@Public()
@Controller('service/oauth')
export class OauthTokenController {
  constructor(
    private readonly clients: ApiClientsService,
    private readonly tokens: ServiceTokenService,
  ) {}

  @Post('token')
  @HttpCode(200)
  async token(
    @Body() body: OauthTokenDto,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    if (body.grant_type !== 'client_credentials') {
      throw new BadRequestException({
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials is supported',
      });
    }

    let clientId = body.client_id?.trim() ?? '';
    let secret = body.client_secret ?? '';
    if (authorization && /^basic /i.test(authorization)) {
      const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        secret = decodeURIComponent(decoded.slice(colon + 1));
      }
    }
    if (!clientId || !secret) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'client_id and client_secret are required',
      });
    }

    const client = await this.clients.authenticate(clientId, secret);
    if (!client) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'Unknown, revoked, or wrong credentials',
      });
    }

    // A narrower scope may be asked for; a wider one is simply not granted.
    const granted = new Set(client.scopes ?? []);
    const requested = (body.scope ?? '').split(' ').filter(Boolean);
    const scopes = requested.length ? requested.filter((s) => granted.has(s)) : [...granted];
    if (!scopes.length) {
      throw new BadRequestException({
        error: 'invalid_scope',
        error_description: 'None of the requested scopes are granted to this key',
      });
    }

    const { token, expiresIn } = await this.tokens.sign(client, scopes);
    return { access_token: token, token_type: 'Bearer', expires_in: expiresIn, scope: scopes.join(' ') };
  }
}
