import { ref } from 'vue';

/**
 * Light/dark selection.
 *
 * Light by default, whatever the operating system prefers: the brand is a
 * black-and-red mark on white, and the site opens on that. Choosing dark pins it,
 * here and on every later load (see public/theme.js, which replays the choice
 * before the first paint).
 *
 * The attribute this sets is what both halves of the stylesheet key off — the
 * `:root[data-theme="dark"]` token block and Tailwind's `dark:` variant.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'thevirginmilf-theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** What the reader is looking at: their choice, or light. */
export const theme = ref<Theme>(storedTheme() ?? 'light');

export function setTheme(next: Theme) {
  theme.value = next;
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* The choice still holds for this page load. */
  }
}

export function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark');
}
