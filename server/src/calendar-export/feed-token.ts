import { createHash, randomBytes } from 'node:crypto';

/**
 * A subscription feed's secret. The raw token is the whole credential — it
 * sits in a URL that Google or Microsoft fetch from their own servers, with
 * no cookie — so it is shown once and only its SHA-256 is stored.
 */
export function newFeedToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashFeedToken(token) };
}

export function hashFeedToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 43 base64url characters; anything else is refused before it reaches a query. */
export function looksLikeFeedToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** How far back and ahead a subscription feed reaches. */
export const FEED_DAYS_BACK = 30;
export const FEED_DAYS_AHEAD = 365;

/** The response headers every feed and download carries. */
export const ICS_CONTENT_TYPE = 'text/calendar; charset=utf-8';
