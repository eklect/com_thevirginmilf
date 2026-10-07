import type { Component } from 'vue';
import AppleIcon from './AppleIcon.vue';
import DiscordIcon from './DiscordIcon.vue';
import FacebookIcon from './FacebookIcon.vue';
import GitHubIcon from './GitHubIcon.vue';
import GoogleIcon from './GoogleIcon.vue';
import LinkedInIcon from './LinkedInIcon.vue';
import MicrosoftIcon from './MicrosoftIcon.vue';
import TwitchIcon from './TwitchIcon.vue';

/**
 * Monochrome marks for the sign-in providers, drawn in `currentColor` so they
 * take the button's ink in both themes. Lucide ships no brand logos, so these
 * are inline — the Simple Icons outlines, which are CC0.
 */
export const BRAND_ICONS: Record<string, Component> = {
  google: GoogleIcon,
  microsoft: MicrosoftIcon,
  apple: AppleIcon,
  facebook: FacebookIcon,
  discord: DiscordIcon,
  twitch: TwitchIcon,
  linkedin: LinkedInIcon,
  github: GitHubIcon,
};

export function brandIcon(key: string): Component | null {
  return BRAND_ICONS[key] ?? null;
}
