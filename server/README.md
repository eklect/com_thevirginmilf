# com_thevirginmilf — `server/`

**Stub. Nothing runs here yet.**

This folder exists so the repo matches the standard Mucci & Co product layout —
`client/` + `server/` — and so there is one obvious place for the backend when it is
built. It holds no code, no `package.json`, and no dependencies.

## What goes here when it's built

A NestJS + TypeORM + MySQL API, like every other Mucci & Co server, whose first job is
**sign-in**. The site is a MAP relying party: it does not get its own user table, its own
login screen, or a third-party identity provider.

That is what forces this folder to exist at all. The OAuth authorization-code exchange
happens server-side — the client secret and MAP's tokens are never handed to the browser —
so a frontend-only site cannot sign anyone in no matter how the login page looks.

## The order it has to happen in

1. Register the site in MAP (`com_mucciandco_map`) — `client_id`, `client_secret`,
   redirect URIs. Part 2 of MAP's README is the checklist.
2. Scaffold Nest here, holding MAP's tokens server-side and setting an httpOnly session
   cookie for the browser.
3. Give the site a `sites.json` entry in `muccico_ecosystem` — a `static` role for
   `client/` and a `nestjs` role for this folder at `base_path: /api`. **Ports 3001–3005
   are taken**; 3006 is the next free one, but check the manifest rather than trusting
   this line.
4. Add the two bind mounts to both compose files, and a matching entry in the production
   runbook's manifest.

Until step 3, this site is not in the dev box at all — `client/` runs on its own with
`npm run dev`.

## Why not just use a hosted auth service

Because every Mucci & Co venture signs in through MAP, so a person who has an account for
one site already has one here. A second identity provider would mean a second copy of
"who exists" to keep in step, and `sc_login` is the cautionary tale of what that costs.
