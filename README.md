# com_thevirginmilf — The Virgin MILF

`thevirginmilf.com` — Ali Mucci's streaming site. Her gamer tag is **TheVirginMILF**:
*Virgin* because she is new to video games, *MILF* for **Mom is Living Fantastically** —
and yes, the double entendre is the point.

One repo, two halves:

| | What | Stack |
|---|---|---|
| `client/` | The site and its `/admin` | Vue 3 + Vite + Pinia + Tailwind v4 + shadcn-vue |
| `server/` | The API | NestJS 11 + TypeORM + MySQL 8, a MAP relying party |

Rebuilt from scratch in September 2026. The previous React client is gone; the only things
carried over from it are the logo and the six social links.

**Status: deployed, not yet launched.** It runs in the dev box and, since 2026-09-30, on the
production server at <https://thevirginmilf.com>, with DNS pointed there. Production has the
seeded pages and channels and nothing else: no streams, no games and no admin until the steps
under [First run](#first-run-in-order) are done there.

---

## What it does

- **Stream calendar** — month / week / day, with the next streams listed under it. Admins
  schedule a stream, pick the channels it is on (Twitch, YouTube, …), optionally a game.
- **The watch link is for signed-in people.** Anyone sees the calendar; the link to the
  stream shows once you have an account. See [The sign-in gate](#the-sign-in-gate).
- **Stream alerts** — an announcement when a stream is published and a reminder shortly
  before it starts, by **email** and by **browser push**. Each person switches the two
  independently on their account page. See [Alerts](#alerts).
- **Game library** — synced from her Steam account, plus games added by hand. Each can be
  hidden, hearted, rated out of ten stars, put in categories, and reviewed.
- **Game pages** — cover art, screenshots, the facts, her rating, her notes and her reviews.
- **Favorites** — every game she hearted, then the most-played games from Steam.
- **About, Links, Live** — Live embeds the Twitch player and chat.
- **Accounts through MAP.** No users table, no passwords here. Signing up means agreeing to
  the Mucci & Co Terms of Service and Privacy Policy — one set for every venture — and MAP
  records that acceptance. See [Terms, privacy and the MAP opt-out](#terms-privacy-and-the-map-opt-out).

---

## Run it

It lives in the dev box (`muccico_ecosystem`) as the `thevirginmilf` site:

| | |
|---|---|
| Site | <https://thevirginmilf.test> |
| API | same origin, under `/api` → `127.0.0.1:3012` in the container |
| Database | `thevirginmilf_api`, user `thevirginmilf_api_app` |
| MAP application | `com-thevirginmilf` (registered from the manifest at container boot) |

```bash
# The API runs compiled. After changing server code:
cd server && npm run build
cd ~/development/muccico_ecosystem && docker compose exec app supervisorctl restart thevirginmilf_api

# The client is served from dist/. After changing client code:
cd client && npm run build:dev
```

`supervisord` runs `node dist/main.js`, so a server change does nothing until it is built
**and** restarted. Migrations run at boot (`migrationsRun: true`).

For hot reload instead: `cd server && npm run start:dev` and `cd client && npm run dev`
(<http://localhost:5173>, which is a registered MAP callback origin).

### First run, in order

The same three steps in the dev box and in production.

1. **Make yourself an admin.** Admins are MAP admins. In the MAP portal:
   Applications → The Virgin MILF → Members, or be a global admin. There is no way to do it
   from inside this site.
2. **Connect Steam** at `/admin/steam`. You need a Steam Web API key
   (<https://steamcommunity.com/dev/apikey>) and the profile's address, and the profile's
   *Game details* privacy set to **Public** — without that Steam returns no game list.
3. **Check the channels** at `/admin/channels`. The six seeded links came from the old site.

### `server/.env`

`.env.example` documents every variable. The dev box writes the `MYSQL_*` and `MAP_CLIENT_*`
values itself. Set by hand, once:

| Variable | |
|---|---|
| `SESSION_ENCRYPTION_SECRET` | `openssl rand -base64 48`. Also seals the stored Steam key — changing it signs everyone out **and** asks for Steam to be reconnected. |
| `STORAGE_ROOT` | `/var/lib/muccico/storage/thevirginmilf_api` in the dev box. Must be outside the repo. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`. **Set once per environment and leave alone** — changing the pair orphans every browser's push subscription. |
| `MAIL_ENABLED`, `PUSH_ENABLED` | `false` writes each message to the log and marks it `logged` instead of sending. |
| `STEAM_MODE` | `fixture` swaps her library for `test/fixtures/steam/owned-games.json`. Development only. |

---

## The design, where it is not obvious

### The sign-in gate

`GET /api/site/streams*` is public. For a caller with no session the response **does not
contain the links** — the `url` key is never written (`server/src/streams/streams.serializer.ts`).
The client has nothing to hide; it shows "Sign in to get the link" when `linksLocked` is true.
Those routes send `Cache-Control: private, no-store`.

It is a nudge to sign up, not a secret: her channels are on the Links page. What is gated is
*this stream's* link. A stream's **description is public**, so a link typed there is too — the
admin form says so.

Signing in from the dialog returns to `/streams/<id>`, the same stream, now with its links.

### A game has two owners

`games` is written by the Steam sync and by the admin, and they must never overwrite each
other. So the columns are split: `steam_*`, `playtime_*` and `last_played_at` belong to the
sync; `title`, `summary`, `description`, `cover_upload_id`, the flags and the rating belong to
the admin. The site shows `admin ?? steam` (`games.serializer.ts`).

In the admin, a Steam game's text fields start empty and show Steam's value as a placeholder.
Typing overrides it; clearing it hands it back.

The sync never deletes. A game that leaves her library is marked, and keeps its reviews.
A manual game has no `steam_app_id`, so the sync cannot touch it. Steam games cannot be
deleted, only hidden — the next sync would bring them back.

Software arrives **hidden**: Steam reports Wallpaper Engine as `type: "game"`, so the check is
on store genres (`looksLikeAGame` in `steam.service.ts`). One click shows anything it got wrong.

### The Steam sync is a background job

One Web API call for the library, then one store call per new game, spaced 1.5 seconds apart.
`POST /admin/steam/sync` returns 202 and the screen polls. It also runs daily at 09:00 UTC.
Images are hotlinked from the URLs Steam returns — stored as given, never built from an app id.

The API key is stored sealed (`common/secret-box.ts`) and no endpoint returns it.

### Favorites

Hearted games first, then the top *N* Steam games by playtime (`favorites_auto_count`,
default 10) that are not hidden, not hearted, and not flagged *keep it off "most played"*.
A manual game has no playtime, so the heart is its only way on.

### Alerts

`server/src/notifications/stream-alerts.scheduler.ts`, every minute:

- **Announcement** — once per stream, about **two minutes after its last edit**, so a typo can
  be fixed before anyone is told.
- **Reminder** — `reminder_lead_minutes` before the start (default 30). Moving a stream after
  its reminder went sends a fresh one for the new time.
- A stream published inside the reminder window gets the reminder only.
- Past streams are never announced. A kind that is switched off is marked handled, so
  switching it back on does not announce the backlog.
- There is no "moved" or "cancelled" message.

Two queues with the same protocol — `outbound_emails` (the estate's SendGrid module) and
`outbound_pushes` — each with a unique `dedupe_key`, which is what makes a crash mid-send safe.

Email goes to `subscribers` who opted in. Push goes to every row in `push_subscriptions`, one
per browser. The signup form has an "Email me when she streams" box, ticked by default.

Times in an alert are written in `alerts_timezone` (default `America/New_York`) and name the
zone; the calendar on the site shows each visitor their own.

### Terms, privacy and the MAP opt-out

The Terms of Service and Privacy Policy are **Mucci & Co's**, one set for every venture, served
from the corporate site at `/terms` and `/privacy`. This site links to them and keeps no copy:

- **Signup consent.** The sign-up form has a required, unticked "I agree to the Mucci & Co
  Terms of Service and Privacy Policy" box above the button; the button is off until it is
  ticked. `CreateRegisterDto.termsAccepted` must be `true`, and `RegisterService` forwards it to
  MAP as `termsAccepted` / `acceptedIp` / `acceptedUserAgent` on `POST /api/service/users`, so
  the acceptance is recorded against the identity where it lives. MAP accepts the three fields
  as optional (`TERMS_ACCEPTANCE_REQUIRED=false` there), so MAP deploys first and a venture
  deployed before it is harmless — but a MAP without the DTO fields would refuse the body.
- **The footer** links *Terms* and *Privacy* beside "A Mucci & Co venture", to
  `site.orgSiteUrl` (MAP's issuer with the `map.` label dropped; `https://mucciandco.com` when
  the bootstrap has not landed). The Steam attribution stays.
- **`/privacy` here redirects** to the corporate policy (`window.location.replace` from a
  route guard). The local page, its `privacy_body` setting and its `privacy` page toggle are
  gone; `RemovePrivacyPage` deletes the rows the seed wrote, and the seed itself is untouched.

**Removing this site in MAP's portal is an opt-out from its alerts.** MAP exposes every
`sub` that removed the application at `GET /api/service/applications/me/opt-outs`
(`client_credentials`, scope `installs:read`); `MapOptoutsScheduler` pages through it every
five minutes and mirrors it into **`map_optouts`** (`user_id` = the MAP `sub`,
`opted_out_at`, `synced_at`). Two checks use it:

1. **Selection** — `SubscribersService.listDeliverable()` and
   `PushSubscriptionsService.listAll()` leave those people out of a fan-out.
2. **Delivery** — the mail drain skips a queued `stream_announced` / `stream_reminder`
   (`MARKETING_KINDS` in `outbound-email.entity.ts`) whose `user_id` is opted out, and the
   push drain skips every kind (every push is a stream alert). The row is marked
   `status = 'skipped'`, `last_error = 'map_opt_out'`. Transactional kinds — `welcome`,
   `password_reset`, `complete_profile` — are never skipped.

The opt-out is a veto, not a change: `subscribers.is_subscribed` and `push_subscriptions`
stay exactly as the person set them, so re-installing the site (the row leaves the feed on
the next sync) resumes what they had chosen. If MAP refuses the scope — the `thevirginmilf/api`
role needs `"installs:read"` in `service_scopes` in **both** `muccico_ecosystem` manifests —
the scheduler warns once and keeps the last synced set; an error never empties the table.
`map-client.service.ts` caches one service token **per scope**, so a venture not yet granted
`installs:read` can still sign people up.

### Push, and the one service worker in the estate

The estate rule is "manifest only, no service worker". Web Push cannot work without one, so
`client/public/sw.js` is the scoped exception: it handles `push`, `notificationclick` and
`pushsubscriptionchange` and **nothing else** — no `fetch` handler, no caches, no Workbox. It
cannot serve a stale page. Do not add caching to it.

- Registered only from a click on the account page (`client/src/lib/push.ts`).
- nginx serves `/sw.js` `no-cache` (an exact-match location in the static template).
- The manifest is `display: standalone` with `display_override: ["minimal-ui"]`, because iOS
  only delivers push to a site added to the Home Screen.
- The server only delivers to the four browser vendors' push hosts. A subscription's endpoint
  is a URL the browser supplies, and without that list any account could point the API at an
  internal address.

### The WAF reads field names

Both environments sit behind the OWASP Core Rule Set. Rule 930120 refuses a JSON key called
`profile` (it reads `.profile`, the shell dotfile) with a bare nginx 403 — which is why the
Steam form's field is `steamProfile`. When an admin write returns 403 with no JSON body, the
rule id is in `/var/log/modsec_audit/audit.log` in the container.

Every prose-writing route is under `/admin/`, which is what the manifest's
`markdown_content: true` exclusion covers.

---

## Layout

```
server/src/
  auth/ common/ map-client/ register/   MAP relying party, guards, signup     (from com_alimucci)
  settings/ site/ uploads/ subscribers/ settings, public read plane, images   (from com_alimucci)
  mail/                                 SendGrid queue                        (from com_simplicourt)
  channels/ streams/                    where she streams; the calendar
  games/ categories/ reviews/ steam/    the library and the sync that feeds it
  push/                                 Web Push subscriptions and their queue
  map-optouts/                          who removed this site at MAP — the alert veto
  notifications/                        the scheduler that turns a stream into alerts
  admin/                                every write route, all @AdminOnly()
client/src/
  views/            public pages        views/admin/   the dashboard
  components/calendar/                  the estate's shared calendar          (from com_mycotools_app)
  lib/push.ts                           everything the browser does for push
  styles.css                            tokens, @theme inline, component classes
```

The look — lipstick red, black, white, hard edges, the striped band — is all in
`client/src/styles.css`. The display face is **Anton** (one static weight, no `opsz` axis);
`@utility poster` is where the other sites have `didone`.

### Brand files

`client/public/brand/v1/logo.png` is the full lockup. `lips.png` is cut from it — the wordmark
masked away, the drip kept — and is what the masthead, the favicon and the PWA icons use. The
masthead sets the name in live type rather than showing the logo image, because the logo is
black lettering on transparency and would vanish on the dark theme. The full logo appears once,
on the home page, on a white plate in both themes.

Icons are generated: `node brand/scripts/node/gen_pwa_icons.mjs thevirginmilf` in
`muccico_devops`. The directory is versioned (`v1`) because nginx caches images for a year.

---

## Production

`thevirginmilf` in `muccico_ecosystem/prod/config/sites.json`: uids 10022 / 10023, port 3012,
1.5 GB (the client's type-check ran out of heap at the default 768 MB). Ship a change with
`git push origin master`, then on the server `sudo muccico deploy thevirginmilf`.

Its `.env` is `/srv/muccico/env/thevirginmilf_api/.env`. `PUSH_ENABLED=true` with its own
VAPID pair — leave that pair alone. `MAIL_ENABLED=false`.

## Not done

- **Real email.** `MAIL_ENABLED=false`. Turning it on needs a SendGrid key and domain
  authentication for `thevirginmilf.com`.
- **A YouTube live embed.** It needs the channel **ID** (starts `UC`), entered as the YouTube
  channel's handle in `/admin/channels`. Until then YouTube is linked, not embedded.
- **Tests.** None, as on the estate's other single-owner repos.

## Starting the dev database over

The schema and the seed are migrations, so an empty database rebuilds itself at boot:

```bash
cd ~/development/muccico_ecosystem
docker compose exec app mysql --defaults-extra-file=/root/.mysql/root.cnf -e 'DROP DATABASE thevirginmilf_api'
docker compose exec app mysql-provision-sites
docker compose exec app supervisorctl restart thevirginmilf_api
```

## API keys and the email-template service plane

Two server modules every venture backend carries, copied from
`com_simplicourt/server` (its README has the long version):

- **`server/src/service-auth/`** — keys this site issues to other servers. An
  admin creates one at `/admin/api-access` (the secret is shown once); the
  holder exchanges it at `POST /api/service/oauth/token` (`client_credentials`)
  for a 15-minute bearer token, and `ServiceTokenGuard` re-reads the key on
  every call, so Revoke is immediate. Scopes: `email-templates:read`,
  `email-templates:write`.
- **`server/src/email-templates/`** — the files in `server/email_templates/`,
  the `muccico_email_templates` submodule (`git submodule update --init` after
  a plain clone). `/api/service/email-templates/*` lists, reads and writes
  templates as `{ html, text }`, versions on overwrite, archives, restores and
  takes images; `/api/email-images/<stem>` serves them publicly, extension-free.
  `FileTemplateService.render(kind, vars)` sends from `live/<kind>.html` +
  `.txt` when both exist (`welcome`, `stream_announced`, `stream_reminder`
  here) and falls back to the TypeScript template otherwise.

`VENTURE` in `server/src/common/venture.ts` is `com_thevirginmilf`. Production sets
`EMAIL_TEMPLATES_GIT_SYNC=true` with the key from
`muccico keys thevirginmilf/api --templates`; the dev box keeps it off.
