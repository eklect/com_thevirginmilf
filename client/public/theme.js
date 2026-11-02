/*
 * Replays the theme preference onto <html> before the stylesheet paints, so a
 * pinned choice does not flash the other palette on every load. Mirrors
 * src/theme.ts: the same key, the same default, the same resolution of
 * `system` against the operating system. The attribute is always written.
 *
 * A separate same-origin file rather than an inline snippet, because the
 * site's security policy allows same-origin scripts only.
 *
 * It is served immutable for a year and its name is not hashed, so a change
 * here does not reach a returning visitor on its own: bump the `?v=` on the
 * <script> in index.html in the same commit.
 */
(function () {
  var preference = 'system';
  try {
    var stored = localStorage.getItem('thevirginmilf-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;
  } catch (error) {
    /* Storage can be unavailable (private browsing); the default applies. */
  }
  var theme = preference;
  if (preference === 'system') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
