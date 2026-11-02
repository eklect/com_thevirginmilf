import { computed, ref } from 'vue';

/**
 * Light/dark selection, with a third choice: follow the device.
 *
 * Two values, not one. The PREFERENCE is what the person chose: `light`,
 * `dark`, or `system`, meaning "keep following the operating system". The
 * THEME is what they are actually looking at, the preference resolved against
 * the OS when it is `system`. Only the theme reaches the DOM.
 *
 * On `system` the page changes the moment the OS does (a scheduled dark mode
 * at sunset, a toggle in Control Centre) with no reload: the media query's
 * change event re-resolves the theme and re-writes the attribute.
 *
 * DEFAULT: `light`, the brand's own first impression. A first visit is light
 * whatever the operating system prefers; `system` is a real choice, made by
 * hand from the theme control, and from then on the OS decides.
 *
 * The attribute this sets, `data-theme` on <html>, is what the stylesheet keys
 * off (the dark token block and Tailwind's `dark:` variant), so it is always
 * written with the resolved value, never left to a media query.
 * `public/theme.js` replays the same resolution before the first paint; keep
 * the key and the default in step with it.
 */
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'thevirginmilf-theme';
const DEFAULT_PREFERENCE: ThemePreference = 'light';

/** The order a one-tap control steps through. */
export const THEME_CYCLE: readonly ThemePreference[] = ['light', 'dark', 'system'];

function storedPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    // Anything else, absent or written by an older build, means no choice yet.
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* Storage can be unavailable (private browsing). */
  }
  return DEFAULT_PREFERENCE;
}

const darkQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** What the operating system is asking for, right now. */
export const systemTheme = ref<Theme>(darkQuery?.matches ? 'dark' : 'light');

/** What the person chose. Bind a theme control to this. */
export const preference = ref<ThemePreference>(storedPreference());

/** What the person is looking at. Read-only; set the preference instead. */
export const theme = computed<Theme>(() =>
  preference.value === 'system' ? systemTheme.value : preference.value,
);

function apply() {
  document.documentElement.setAttribute('data-theme', theme.value);
}

darkQuery?.addEventListener('change', (event) => {
  systemTheme.value = event.matches ? 'dark' : 'light';
  // A pinned preference ignores the OS; on `system` this is the whole point.
  if (preference.value === 'system') apply();
});

// Write the resolved theme once at startup as well. public/theme.js has
// already done it before the first paint, but that file is served immutable,
// so a returning visitor can be running an older copy that knows nothing of
// `system`; this corrects the page the moment the app loads.
apply();

export function setThemePreference(next: ThemePreference) {
  preference.value = next;
  apply();
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* The choice still holds for this page load. */
  }
}

/** The older name, kept so existing callers read naturally. */
export const setTheme = setThemePreference;

/** The preference one tap of a cycling control moves to: light, dark, system, light... */
export function nextPreference(from: ThemePreference = preference.value): ThemePreference {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(from) + 1) % THEME_CYCLE.length];
}

/** Human words for a preference, for labels and titles. */
export const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/** One tap: step to the next preference in the cycle, System included. */
export function toggleTheme() {
  setThemePreference(nextPreference());
}
