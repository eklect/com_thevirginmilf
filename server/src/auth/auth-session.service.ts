import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { CookieOptions, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { open, seal } from '../common/secret-box';
import { AuthConfig } from './auth.config';
import { AuthSessionEntity } from './auth-session.entity';
import { MapOAuthClient, type MapTokens } from './map-oauth.client';

/** Refresh this far ahead of expiry, so a slow request never races the clock. */
const REFRESH_SKEW_MS = 60_000;

/** A live session plus the access token to present for it. */
export interface ActiveSession {
  session: AuthSessionEntity;
  accessToken: string;
}

/**
 * Owns the lifecycle of a signed-in browser: create, read, renew, revoke.
 *
 * The guard asks it one question per request — "who is this cookie, and is that
 * still true?" — and everything expensive about answering that lives here.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  /**
   * One in-flight refresh per session.
   *
   * Not an optimisation. MAP rotates the refresh token on every use and treats a
   * replayed one as theft — revoking the entire token family *and* the SSO
   * session behind it, signing the user out of every Mucci app. Two concurrent
   * requests on an expiring session would each present the same refresh token,
   * and the second would look exactly like an attacker. A page that fires six
   * parallel API calls is completely ordinary, so this is the difference between
   * working and logging people out at random.
   */
  private readonly refreshes = new Map<string, Promise<ActiveSession>>();

  /** `sessionId → when the introspection result stops being trusted`. */
  private readonly introspectedUntil = new Map<string, number>();

  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly repo: Repository<AuthSessionEntity>,
    private readonly config: AuthConfig,
    private readonly oauth: MapOAuthClient,
  ) {}

  // ---------- creation ----------

  /**
   * Records a freshly-authenticated browser and returns the raw cookie value.
   *
   * The raw value is returned once and never stored — only its SHA-256 goes to
   * the database.
   */
  async create(params: {
    tokens: MapTokens;
    userId: string;
    mapSessionId: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();

    await this.repo.save(
      this.repo.create({
        id: randomUUID(),
        tokenHash: hash(raw),
        userId: params.userId,
        mapSessionId: params.mapSessionId,
        accessToken: this.sealToken(params.tokens.access_token),
        refreshToken: this.sealToken(params.tokens.refresh_token),
        accessExpiresAt: expiryOf(params.tokens),
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null,
        ip: params.ip,
        userAgent: params.userAgent?.slice(0, 512) ?? null,
      }),
    );

    return raw;
  }

  // ---------- reading ----------

  /**
   * Resolves a cookie to a usable access token, renewing and revalidating as
   * needed. `null` means "not signed in" for every reason there is.
   */
  async resolve(rawCookie: string | undefined): Promise<ActiveSession | null> {
    if (!rawCookie) return null;

    const session = await this.repo.findOne({
      where: { tokenHash: hash(rawCookie), revokedAt: IsNull() },
    });
    if (!session) return null;

    const active = await this.ensureFresh(session);
    if (!active) return null;

    if (!(await this.stillLive(active))) {
      await this.revoke(active.session.id);
      return null;
    }

    void this.touch(active.session);
    return active;
  }

  /**
   * Renews when the access token is within a minute of expiry, sharing one
   * in-flight exchange across every concurrent caller.
   */
  private async ensureFresh(
    session: AuthSessionEntity,
  ): Promise<ActiveSession | null> {
    const expiresAt = Date.parse(session.accessExpiresAt);
    if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return {
        session,
        accessToken: this.openToken(session.accessToken),
      };
    }

    const inFlight = this.refreshes.get(session.id);
    if (inFlight) return inFlight.catch(() => null);

    const attempt = this.performRefresh(session).finally(() => {
      this.refreshes.delete(session.id);
    });
    this.refreshes.set(session.id, attempt);

    return attempt.catch(() => null);
  }

  private async performRefresh(
    session: AuthSessionEntity,
  ): Promise<ActiveSession> {
    let tokens: MapTokens;
    try {
      tokens = await this.oauth.refresh(this.openToken(session.refreshToken));
    } catch (error) {
      // A refusal here is how a revoked session announces itself: MAP dropped
      // the refresh token when someone signed out, changed their password, or
      // was deactivated. There is nothing to retry.
      this.logger.debug(
        `Refresh rejected for session ${session.id}; revoking locally`,
      );
      await this.revoke(session.id);
      throw error;
    }

    session.accessToken = this.sealToken(tokens.access_token);
    session.refreshToken = this.sealToken(tokens.refresh_token);
    session.accessExpiresAt = expiryOf(tokens);
    session.lastSeenAt = new Date().toISOString();
    await this.repo.save(session);

    // A renewed token is proof the SSO session was alive a moment ago, so the
    // introspection cache can start over rather than immediately asking again.
    this.introspectedUntil.set(
      session.id,
      Date.now() + this.config.introspectCacheMs,
    );

    return { session, accessToken: tokens.access_token };
  }

  /**
   * Has the MAP session behind this one been ended elsewhere?
   *
   * An access token stays cryptographically valid for its full 15 minutes no
   * matter what happens at MAP, and MAP has no back-channel logout to tell us
   * otherwise. Introspection is the only way to find out, so it runs on a short
   * cache — bounded staleness at one round trip per session per minute.
   */
  private async stillLive(active: ActiveSession): Promise<boolean> {
    const until = this.introspectedUntil.get(active.session.id) ?? 0;
    if (until > Date.now()) return true;

    const live = await this.oauth.introspect(active.accessToken);
    if (!live) {
      this.introspectedUntil.delete(active.session.id);
      return false;
    }

    this.introspectedUntil.set(
      active.session.id,
      Date.now() + this.config.introspectCacheMs,
    );
    return true;
  }

  /** Best-effort liveness stamp; never blocks the request that triggered it. */
  private async touch(session: AuthSessionEntity): Promise<void> {
    const lastSeen = Date.parse(session.lastSeenAt);
    if (Date.now() - lastSeen < 60_000) return;

    try {
      await this.repo.update(
        { id: session.id },
        { lastSeenAt: new Date().toISOString() },
      );
    } catch (error) {
      this.logger.debug(`Could not stamp last_seen_at: ${String(error)}`);
    }
  }

  // ---------- revocation ----------

  async revoke(sessionId: string): Promise<void> {
    this.introspectedUntil.delete(sessionId);
    await this.revokeWhere('id = :id', { id: sessionId });
  }

  /**
   * Every local session for a person, on every device.
   *
   * The local half of "sign out everywhere". MAP is told separately, by the
   * browser following the logout redirect — this makes sure this site does not
   * keep honouring its own cookies in the meantime.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const live = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      select: { id: true },
    });
    live.forEach(({ id }) => this.introspectedUntil.delete(id));

    return this.revokeWhere('user_id = :userId', { userId });
  }

  /**
   * Stamps `revoked_at` on the live rows matching `predicate`.
   *
   * Written as a query builder rather than `repo.update({ revokedAt: IsNull() })`
   * because `revoked_at` carries `IsoDateTransformer`, and TypeORM runs
   * transformers over update PREDICATES as well as values — so the `IsNull()`
   * operator itself gets handed to `to()`, which throws
   * `Expected an ISO-8601 datetime, received '[object Object]'`. Finds are
   * unaffected, which is why the same pattern reads fine a few lines up.
   */
  private async revokeWhere(
    predicate: string,
    params: Record<string, unknown>,
  ): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date().toISOString() })
      .where(`${predicate} AND revoked_at IS NULL`, params)
      .execute();
    return result.affected ?? 0;
  }

  // ---------- cookies ----------

  readCookie(request: Request): string | undefined {
    return request.cookies?.[this.config.cookieName] as string | undefined;
  }

  writeCookie(response: Response, value: string): void {
    response.cookie(this.config.cookieName, value, this.cookieOptions());
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.config.cookieName, this.cookieOptions());
  }

  /**
   * Seals the in-flight OAuth transaction — `state`, the PKCE verifier, and
   * where to land afterwards — into a short-lived cookie.
   *
   * A cookie rather than a table because the data is worthless ninety seconds
   * later and dies with the browser that owns it. Encrypted rather than merely
   * signed because the verifier is a secret: anyone who reads it and intercepts
   * the code can redeem it.
   */
  writeTransaction(response: Response, payload: OAuthTransaction): void {
    response.cookie(
      this.config.transactionCookieName,
      seal(JSON.stringify(payload), this.config.encryptionSecret),
      { ...this.cookieOptions(), maxAge: 10 * 60_000 },
    );
  }

  readTransaction(request: Request): OAuthTransaction | null {
    const raw = request.cookies?.[this.config.transactionCookieName] as
      | string
      | undefined;
    if (!raw) return null;

    try {
      return JSON.parse(
        open(raw, this.config.encryptionSecret),
      ) as OAuthTransaction;
    } catch {
      // Tampered, truncated, or sealed under a rotated secret. All the same
      // answer: start the flow again.
      return null;
    }
  }

  clearTransaction(response: Response): void {
    response.clearCookie(
      this.config.transactionCookieName,
      this.cookieOptions(),
    );
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      // Lax is required, not incidental: the return trip from MAP is a top-level
      // GET navigation, which `strict` would strip the cookie from — the user
      // would arrive back from a successful login with no session. Same
      // reasoning as MAP's own cookie.
      sameSite: 'lax',
      path: '/',
    };
  }

  private sealToken(token: string): string {
    return seal(token, this.config.encryptionSecret);
  }

  private openToken(sealed: string): string {
    return open(sealed, this.config.encryptionSecret);
  }
}

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function expiryOf(tokens: MapTokens): string {
  return new Date(Date.now() + tokens.expires_in * 1000).toISOString();
}
