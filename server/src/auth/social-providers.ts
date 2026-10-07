/**
 * The upstream sign-in providers MAP may offer — the same list as MAP's
 * `common/social-providers.ts`. Only used to validate the `provider` a page
 * asks for before it is written into a URL; MAP decides which are actually
 * on, and `GET /api/auth/providers` relays that.
 */
export const SOCIAL_PROVIDER_KEYS = [
  'google',
  'microsoft',
  'apple',
  'facebook',
  'discord',
  'twitch',
  'linkedin',
  'github',
] as const;

export type SocialProviderKey = (typeof SOCIAL_PROVIDER_KEYS)[number];

export function isSocialProviderKey(
  value: unknown,
): value is SocialProviderKey {
  return (
    typeof value === 'string' &&
    (SOCIAL_PROVIDER_KEYS as readonly string[]).includes(value)
  );
}

/** One enabled provider, as MAP lists it. */
export interface ProviderInfo {
  key: SocialProviderKey;
  label: string;
}
