import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';

import { AuthConfig } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { MapOAuthClient } from './map-oauth.client';
import type { SocialProviderKey } from './social-providers';
import type { PendingSignup } from '../register/pending-signup';

/**
 * Step 1 of signing in, as one operation two routes share.
 *
 * `GET /auth/login` starts a sign-in; `POST /register/social` starts a signup
 * through a provider. Both mint the same `state` and PKCE material, seal the
 * same transaction cookie, and send the browser to MAP — the second with the
 * form's fields riding in the cookie and MAP told which provider to start at.
 *
 * PKCE is not strictly required of a confidential client, but MAP verifies it
 * whenever it is present and it costs nothing — it closes the window where a
 * leaked authorization code is enough on its own.
 */
@Injectable()
export class AuthFlowService {
  constructor(
    private readonly config: AuthConfig,
    private readonly sessions: AuthSessionService,
    private readonly oauth: MapOAuthClient,
  ) {}

  /** Writes the transaction cookie and returns where to send the browser. */
  begin(
    response: Response,
    input: {
      /** The origin the browser used, so the matching registered callback is chosen. */
      origin: string | undefined;
      returnTo: string | undefined;
      /** Start at this provider on MAP's side instead of MAP's own sign-in page. */
      provider?: SocialProviderKey;
      /** The signup form's Terms box was ticked — only meaningful with a pending signup. */
      termsAccepted?: boolean;
      pendingSignup?: PendingSignup;
    },
  ): string {
    const state = randomBytes(16).toString('hex');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const redirectUri = this.config.redirectUriFor(input.origin);

    this.sessions.writeTransaction(response, {
      state,
      codeVerifier,
      redirectUri,
      returnTo: safeReturnTo(input.returnTo),
      ...(input.pendingSignup ? { pendingSignup: input.pendingSignup } : {}),
    });

    const authorizeUrl = this.oauth.authorizeUrl({
      redirectUri,
      state,
      codeChallenge,
    });

    if (!input.provider) return authorizeUrl;

    return this.oauth.socialStartUrl(input.provider, authorizeUrl, {
      termsAccepted: input.termsAccepted === true,
      // A signup form here runs its own onboarding and sends its own welcome,
      // so MAP is told not to send one. A plain sign-in carries no form.
      venture: input.pendingSignup !== undefined,
    });
  }
}

/**
 * Only same-origin paths survive.
 *
 * `return_to` arrives in a query parameter, so without this the login route is
 * an open redirector. A leading `//` is rejected too: `//evil.com` is a
 * protocol-relative URL, not a path.
 */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
