/*
 * Replays a stored theme choice onto <html> before the stylesheet paints, so
 * choosing light on a machine set to dark does not flash black on every load.
 *
 * A separate same-origin file rather than an inline snippet: nginx serves this
 * app under a CSP that allows `script-src 'self'` only, and the same file works
 * under Vite.
 */
(function () {
  try {
    var stored = localStorage.getItem('thevirginmilf-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {
    /* Storage can be unavailable (private browsing); the OS preference still applies. */
  }
})();
