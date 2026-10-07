/**
 * One upstream sign-in provider MAP has credentials for, as
 * `GET /api/auth/providers` relays them. The key is also the icon's name in
 * `components/brand-icons`. Its own file so the social sign-in pieces copy
 * between ventures without touching each one's `types.ts`.
 */
export type SocialProviderKey =
  | 'google'
  | 'microsoft'
  | 'apple'
  | 'facebook'
  | 'discord'
  | 'twitch'
  | 'linkedin'
  | 'github';

export type ProviderInfo = {
  key: SocialProviderKey;
  label: string;
};
