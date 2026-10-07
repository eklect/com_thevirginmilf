/**
 * The site-wide settings, as a closed list.
 *
 * `site_settings` is a key/value table, and this is what stops it becoming a
 * junk drawer: the admin API refuses a key that is not here, the seed writes
 * exactly these, and the client's types are generated from the same list.
 */
export const SITE_SETTING_KEYS = [
  'site_name',
  'streamer_name',
  'tagline',
  'home_intro',
  'streams_intro',
  'live_intro',
  'games_intro',
  'favorites_intro',
  'links_intro',
  'subscribe_intro',
  // Markdown, rendered by the About page.
  'about_body',
  'headshot_upload_id',
  /**
   * The footer logo — an upload id, or `''` for none.
   *
   * Unset is the normal state rather than a missing asset: the site falls back
   * to the wordmark it ships with.
   */
  'logo_upload_id',
  // The name stream alerts are sent under. The address itself is MAIL_FROM in
  // the environment, because it has to match what the transport is allowed to
  // send as — that is deployment configuration, not site content.
  'mail_from_name',
  /**
   * How many of the most-played Steam games join the hearted ones on the
   * favorites list. A whole number as text; blank or unparseable reads as 10,
   * and `0` switches the automatic half off.
   */
  'favorites_auto_count',
  /**
   * The two kinds of stream alert, each with its own switch.
   *
   * `'off'` disables one. ANYTHING ELSE, INCLUDING UNSET, LEAVES IT ON — the
   * same asymmetry `isPageEnabled` has for a missing page row, and for the same
   * reason: `SettingsService.all()` returns `''` for a key nothing has written
   * yet, so a truthy reading would have silenced every alert on a database the
   * seed had not reached.
   */
  'notify_announce',
  'notify_reminder',
  /** Minutes before a stream starts that the reminder goes out. Blank reads as 30. */
  'reminder_lead_minutes',
  /**
   * The IANA zone stream times are written in inside an email or a
   * notification — `America/New_York`. A calendar in the browser shows the
   * viewer's own time; a message is composed here, where nobody's zone is
   * known, so it states one and names it. Blank reads as `America/New_York`.
   */
  'alerts_timezone',
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export const isSiteSettingKey = (key: string): key is SiteSettingKey =>
  (SITE_SETTING_KEYS as readonly string[]).includes(key);

/**
 * The public pages an admin can switch on and off.
 *
 * `home` is in the list so it appears in the admin screen with its label, but
 * the server refuses to disable it — a site with no front page is a broken
 * site, not a configured one.
 *
 * `signup` gates `RegisterController`, and `settings` gates the signed-in
 * account page. Switching `signup` off closes the endpoint as well as hiding
 * the link, which is the point — but it also means a disabled row 404s every
 * signup silently, so the seed writes it enabled.
 */
export const PAGE_KEYS = [
  'home',
  'streams',
  'live',
  'games',
  'favorites',
  'links',
  'about',
  'signup',
  'settings',
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

export const isPageKey = (key: string): key is PageKey =>
  (PAGE_KEYS as readonly string[]).includes(key);

/**
 * The pages that can take part in the nav hierarchy, as a parent or a child.
 *
 * The three that are missing are missing for the same reason: they are not in
 * the header nav to begin with. `home` is the wordmark, and `signup` and
 * `settings` sit in the account cluster on the right — so nesting any of them
 * would be a setting that visibly does nothing, which is worse than a setting
 * that is refused. `SettingsService.setPage` says so in words.
 *
 * There is no `privacy` page any more: the Privacy Policy and Terms are Mucci
 * & Co's, served from the corporate site, and the footer links there. The
 * row the seed wrote is deleted by `RemovePrivacyPage`; until that has run,
 * `SettingsService.pageSettings` drops any row whose key is not in
 * `PAGE_KEYS`, so the stale row is harmless.
 */
export const NON_NESTABLE_PAGE_KEYS = ['home', 'signup', 'settings'] as const;

export const isNestablePageKey = (key: string): key is PageKey =>
  isPageKey(key) && !(NON_NESTABLE_PAGE_KEYS as readonly string[]).includes(key);
