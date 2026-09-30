import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The rows a fresh database needs to render a site at all.
 *
 * A second migration rather than part of `InitialSchema`, and numbered above
 * it, because migrations run in filename order: a seed that sorts below the
 * schema runs before its tables exist.
 *
 * ## The three inserts are upserts, and they upsert differently
 *
 * `site_settings` conflicts to a deliberate no-op (`\`key\` = \`key\``). These
 * are starter copy an admin replaces, and a re-run must not reach in and undo
 * their work.
 *
 * `page_settings` re-asserts `nav_label`, `parent_key` and `sort_order` —
 * those are ours to own at seed time, so a renamed nav item propagates — but
 * never `enabled`. Switching a page off is a decision, and a migration re-run
 * is not the place to reverse it.
 *
 * `channels` conflicts to a no-op on its unique `slug`, for the same reason
 * as the settings: the links below came from the previous site and are hers
 * to correct.
 *
 * `down()` is deliberately empty. Deleting these rows would delete the admin's
 * edited copy of them, and "undo the seed" is not a thing anybody wants.
 */
export class SeedSite1790800000000 implements MigrationInterface {
  name = 'SeedSite1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, value] of Object.entries(SETTINGS)) {
      await queryRunner.query(
        'INSERT INTO `site_settings` (`key`, `value`) VALUES (?, ?) ' +
          'ON DUPLICATE KEY UPDATE `key` = `key`',
        [key, value],
      );
    }

    for (const page of PAGES) {
      await queryRunner.query(
        'INSERT INTO `page_settings` (`key`, `enabled`, `nav_label`, `parent_key`, `sort_order`) ' +
          'VALUES (?, ?, ?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `nav_label` = VALUES(`nav_label`), ' +
          '`parent_key` = VALUES(`parent_key`), `sort_order` = VALUES(`sort_order`)',
        [page.key, page.enabled ? 1 : 0, page.label, page.parent ?? null, page.sortOrder],
      );
    }

    for (const [index, channel] of CHANNELS.entries()) {
      await queryRunner.query(
        'INSERT INTO `channels` (`id`, `slug`, `name`, `platform`, `url`, `handle`, ' +
          '`description`, `is_stream_channel`, `show_on_links`, `sort_order`, `is_published`) ' +
          'VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 1, ?, 1) ' +
          'ON DUPLICATE KEY UPDATE `slug` = `slug`',
        [
          channel.slug,
          channel.name,
          channel.platform,
          channel.url,
          channel.handle ?? null,
          channel.description,
          channel.stream ? 1 : 0,
          index,
        ],
      );
    }
  }

  public async down(): Promise<void> {
    // Deliberately empty — see the class comment.
  }
}

const ABOUT = `**The Virgin MILF** is Ali Mucci: a mom of four who picked up a controller for the first time as a grown woman, and decided to do it in front of an audience.

## Why "Virgin"

Because she is new to this. No childhood console, no muscle memory, no idea where the jump button is until a game teaches her. Every game here is a first time, and you get to watch it happen.

## Why "MILF"

Officially it stands for **Mom is Living Fantastically**.

Unofficially, yes — it is exactly the double entendre you think it is. She is a mom, and she is hot. Both readings are correct, and she is not apologizing for either one.

## What you will find here

- **Streams.** The calendar says when she is live and where. Sign up and you hear about it before it starts.
- **Games.** Everything in her library, what she rated it out of ten, and what she actually thought of it.
- **Favorites.** The ones she loves, and the ones her playtime says she cannot put down.
`;

const PRIVACY = `## Your account

Signing up creates an account with the Mucci & Co Access Portal, which handles sign-in for this site. This site never sees or stores your password. It stores two things about you, both of which you control from your account page:

- whether you asked to be **emailed** about streams, and the email address to use
- which of your **browsers** asked for notifications

Every stream email has an unsubscribe link that works without signing in.

## Game data

Game details, artwork and screenshots come from Steam. Playtime shown here is the site owner's own, read from her Steam account. This site is not affiliated with Valve.

## Other services

Fonts are loaded from Google Fonts. The Live page embeds the Twitch player, which is Twitch's and sets its own cookies.

## Questions

Use the business email on the Links page.
`;

/**
 * Starter copy. Every one of these is meant to be edited in `/admin`, and
 * none of it is load-bearing: the client falls back sensibly on a blank.
 */
const SETTINGS: Record<string, string> = {
  site_name: 'The Virgin MILF',
  streamer_name: 'TheVirginMILF',
  tagline: 'New to games. Not new to being fabulous.',
  home_intro:
    'Ali Mucci is playing video games for the first time in her life, live, with an audience. Come watch a grown woman find the jump button.',
  streams_intro: 'When she is live, and where. Times are shown in your own time zone.',
  live_intro: 'If she is live right now, this is where it is happening.',
  games_intro: 'Everything in the library, rated out of ten.',
  favorites_intro: 'The ones she loves, and the ones her playtime says she cannot put down.',
  links_intro: 'Everywhere else to find her.',
  subscribe_intro: 'Get told when a stream is scheduled, and again just before she goes live.',
  about_body: ABOUT,
  privacy_body: PRIVACY,
  headshot_upload_id: '',
  logo_upload_id: '',
  mail_from_name: 'The Virgin MILF',
  favorites_auto_count: '10',
  notify_announce: 'on',
  notify_reminder: 'on',
  reminder_lead_minutes: '30',
  alerts_timezone: 'America/New_York',
};

/**
 * `signup` and `settings` ship ENABLED and that is not incidental.
 *
 * `RegisterController` sits behind `PageEnabledGuard('signup')`, and the
 * account page and the notification endpoints behind
 * `PageEnabledGuard('settings')`, so a disabled row does not merely hide a
 * link — it 404s the endpoint, silently. Somebody debugging "signup returns
 * 404" will not think to look in a page toggle.
 *
 * Favorites hangs under Games in the nav. `sortOrder` is a position among
 * siblings, so it restarts at 0 there.
 */
const PAGES: {
  key: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  parent?: string;
}[] = [
  { key: 'home', label: 'Home', sortOrder: 0, enabled: true },
  { key: 'streams', label: 'Streams', sortOrder: 1, enabled: true },
  { key: 'live', label: 'Live', sortOrder: 2, enabled: true },
  { key: 'games', label: 'Games', sortOrder: 3, enabled: true },
  { key: 'favorites', label: 'Favorites', sortOrder: 0, enabled: true, parent: 'games' },
  { key: 'links', label: 'Links', sortOrder: 4, enabled: true },
  { key: 'about', label: 'About', sortOrder: 5, enabled: true },
  { key: 'privacy', label: 'Privacy', sortOrder: 6, enabled: true },
  { key: 'signup', label: 'Sign up', sortOrder: 7, enabled: true },
  { key: 'settings', label: 'Account', sortOrder: 8, enabled: true },
];

/**
 * The six links the previous site carried, in its order.
 *
 * Twitch has a `handle`, so the Live page can embed it. YouTube does not: the
 * old site's channel id was a placeholder, and a YouTube live embed needs the
 * real one — it is added in `/admin/channels` when it is known, and until then
 * YouTube is linked to rather than embedded.
 */
const CHANNELS: {
  slug: string;
  name: string;
  platform: string;
  url: string;
  handle?: string;
  description: string;
  stream: boolean;
}[] = [
  {
    slug: 'twitch',
    name: 'Twitch',
    platform: 'twitch',
    url: 'https://twitch.tv/thevirginmilf',
    handle: 'thevirginmilf',
    description: 'Watch live.',
    stream: true,
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    platform: 'youtube',
    url: 'https://youtube.com/@thevirginmilf',
    description: 'Highlights and past streams.',
    stream: true,
  },
  {
    slug: 'x',
    name: 'X',
    platform: 'x',
    url: 'https://twitter.com/thevirginmilf',
    description: 'Updates, and whatever she is thinking.',
    stream: false,
  },
  {
    slug: 'instagram',
    name: 'Instagram',
    platform: 'instagram',
    url: 'https://instagram.com/thevirginmilf',
    description: 'Behind the scenes.',
    stream: false,
  },
  {
    slug: 'discord',
    name: 'Discord',
    platform: 'discord',
    url: 'https://discord.gg/thevirginmilf',
    description: 'Join the community.',
    stream: false,
  },
  {
    slug: 'email',
    name: 'Email',
    platform: 'email',
    url: 'mailto:contact@thevirginmilf.com',
    description: 'Business inquiries.',
    stream: false,
  },
];
