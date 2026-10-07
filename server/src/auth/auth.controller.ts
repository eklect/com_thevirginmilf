import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/auth.decorators';
import type { RequestUser } from '../common/auth/principal';
import { AuthConfig } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { MapOAuthClient } from './map-oauth.client';
import { MapTokenVerifier } from './map-token-verifier';
import { AuthFlowService } from './auth-flow.service';
import { isSocialProviderKey } from './social-providers';
import { LogoutDto } from './auth.dto';
import { RegisterService } from '../register/register.service';

/** What the client learns about the signed-in person. Nothing it can act on. */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    isAdmin: boolean;
  } | null;
}

/**
 * The browser's half of signing in, all `@Public()`.
 *
 * This app is a *confidential* OAuth client — it has a server that can keep a
 * secret, so the whole code exchange happens here and the browser never
 * receives a MAP token of any kind. It gets an opaque session cookie instead.
 *
 * nginx strips `/api`, so the browser's `https://thevirginmilf.test/api/auth/login`
 * arrives here as `/auth/login`. The URL registered with MAP is the one the
 * *browser* uses.
 */
@Public()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: AuthConfig,
    private readonly sessions: AuthSessionService,
    private readonly oauth: MapOAuthClient,
    private readonly verifier: MapTokenVerifier,
    private readonly flow: AuthFlowService,
    private readonly registerService: RegisterService,
  ) {}

  /**
   * Which upstream providers MAP offers, so the sign-in and signup pages draw
   * the matching buttons. Relayed from MAP and cached there; an empty list
   * means the password-only pages, never an error.
   */
  @Get('providers')
  async providers(): Promise<{ providers: unknown[] }> {
    return { providers: await this.oauth.providers() };
  }

  /**
   * Who is signed in, if anyone. Always 200 — "nobody" is an answer, not an
   * error, and the router asks this on every first load.
   */
  @Get('me')
  me(@Req() request: Request): MeResponse {
    const user: RequestUser | undefined = request.user;
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      },
    };
  }

  /**
   * Step 1. Mint PKCE material, stash it, and hand the browser to MAP.
   *
   * `provider` starts the trip at that provider's button on MAP's side —
   * Google, Apple, … — rather than MAP's own sign-in page. Anything not on the
   * list is ignored and the ordinary page is shown.
   */
  @Get('login')
  login(
    @Query('return_to') returnTo: string | undefined,
    @Query('provider') provider: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    response.redirect(
      this.flow.begin(response, {
        origin: originOf(request),
        returnTo,
        provider: isSocialProviderKey(provider) ? provider : undefined,
      }),
    );
  }

  /**
   * Step 2. MAP sends the browser back with a code.
   *
   * Everything that can go wrong here ends on the sign-in screen with a reason
   * rather than a blank failure. `access_denied` is the one worth naming: it
   * means the account is fine but has no grant for this application, which is a
   * MAP membership problem and not something signing in again will fix.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const transaction = this.sessions.readTransaction(request);
    this.sessions.clearTransaction(response);

    if (error) {
      this.logger.warn(
        `MAP refused authorization: ${error} — ${errorDescription}`,
      );
      return this.fail(
        response,
        error,
        errorDescription,
        transaction?.pendingSignup !== undefined,
      );
    }

    // Comparing against the value we sealed into the cookie ourselves is the
    // CSRF defence: a code delivered by anyone other than the browser that
    // started this flow has no matching state to present.
    if (!transaction || !state || state !== transaction.state) {
      return this.fail(
        response,
        'invalid_state',
        'The sign-in attempt expired or did not start here. Please try again.',
      );
    }

    if (!code) {
      return this.fail(response, 'invalid_request', 'No authorization code.');
    }

    try {
      const tokens = await this.oauth.exchangeCode({
        code,
        redirectUri: transaction.redirectUri,
        codeVerifier: transaction.codeVerifier,
      });

      // Verify before trusting anything in it — including `sub` and `sid`, which
      // are about to become the primary key of who this person is.
      const claims = await this.verifier.verify(tokens.access_token);

      // A signup that began with a provider button: MAP has made the identity,
      // and this is where the password path's bookkeeping happens instead. The
      // email is the one MAP asserts — the person may have typed another — and
      // the names are the form's, falling back to the provider's.
      if (transaction.pendingSignup) {
        const pending = transaction.pendingSignup;
        const handOff = await this.registerService.completeSocial(
          {
            sub: claims.sub,
            email: claims.email,
            firstName: pending.firstName || claims.given_name || null,
            lastName: pending.lastName || claims.family_name || null,
          },
          pending,
        );
        // A site that holds no customer session sends the person on to its
        // product, exactly as its form does; the tokens just issued are dropped.
        if (handOff) {
          response.redirect(handOff);
          return;
        }
      }

      const raw = await this.sessions.create({
        tokens,
        userId: claims.sub,
        mapSessionId: claims.sid,
        ip: request.ip ?? null,
        userAgent: request.get('user-agent') ?? null,
      });
      this.sessions.writeCookie(response, raw);

      response.redirect(transaction.returnTo);
    } catch (caught) {
      this.logger.error(`Callback failed: ${String(caught)}`);
      this.fail(
        response,
        'exchange_failed',
        'Could not complete sign-in. Please try again.',
        transaction.pendingSignup !== undefined,
      );
    }
  }

  /**
   * Ends the session here, and tells the caller where to send the browser to end
   * it at MAP.
   *
   * A POST that returns a URL, not a redirecting GET. The session cookie is
   * `SameSite=Lax`, which browsers *do* send on top-level GET navigations, so a
   * GET logout could be fired by any page that can get the user to follow a
   * link — and with `allDevices`, that would sign them out of every Mucci app on
   * every device they own. Requiring a same-origin POST from the app takes that
   * away.
   *
   * The browser still has to make the MAP trip itself, as a top-level
   * navigation, because MAP reads its own cookie to know whose session to end.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: LogoutDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ redirectTo: string }> {
    const allDevices = dto.allDevices === true;
    const active = await this.sessions.resolve(
      this.sessions.readCookie(request),
    );

    if (active) {
      if (allDevices) {
        await this.sessions.revokeAllForUser(active.session.userId);
      } else {
        await this.sessions.revoke(active.session.id);
      }
    }

    this.sessions.clearCookie(response);
    return { redirectTo: this.oauth.logoutUrl(allDevices) };
  }

  /**
   * Back to the app with the reason in the URL, for the sign-in screen to show.
   *
   * Never renders the message into HTML here — it is partly attacker-influenced
   * (MAP echoes `error_description` from the query string), and the SPA is where
   * escaping is already handled.
   */
  private fail(
    response: Response,
    code: string,
    description: string | undefined,
    /** The attempt was a signup through a provider: back to that form instead. */
    signup = false,
  ): void {
    const target = new URL(
      signup ? '/signup' : '/signin',
      this.config.postLogoutRedirectUri,
    );
    target.searchParams.set('error', code);
    if (description) target.searchParams.set('error_description', description);
    response.redirect(target.toString());
  }
}

/** The origin the browser used, so the matching registered callback is chosen. */
function originOf(request: Request): string | undefined {
  const host = request.get('host');
  return host ? `${request.protocol}://${host}` : undefined;
}
