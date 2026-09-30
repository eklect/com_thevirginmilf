/**
 * A URL slug from free text: lowercase ASCII words joined by hyphens.
 *
 * Accents are folded rather than dropped, so "Pokémon" reads `pokemon` and
 * not `pok-mon`. Anything that leaves nothing behind — a title written
 * entirely in another script — falls back to `fallback`, because an empty
 * slug is a route that cannot be reached.
 */
export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** `lowercase-words-and-digits`, as a stored slug must be. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
