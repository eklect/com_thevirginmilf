# com_thevirginmilf

**The Virgin MILF** — the streamer brand site at `thevirginmilf.com`. Games, streaming and
links.

One repo, two halves, like every Mucci & Co product:

| Folder | What it is | State |
|---|---|---|
| [`client/`](client) | React 18 + Vite + Tailwind + shadcn/ui, built to static files | Working — this is the whole site today |
| [`server/`](server) | The API that will hold MAP's tokens | **Stub** — see [`server/README.md`](server/README.md) |

## Running

```bash
cd client
npm install
npm run dev
```

This site is **not in the dev box manifest** yet, so there is no `thevirginmilf.test` and
no nginx in front of it. It runs on Vite's dev server alone. That changes when `server/`
is real — see the stub's README for the order of operations.

## Sign-in

There is none yet, and when there is it goes through **MAP** (`com_mucciandco_map`), the
Mucci & Co identity provider every venture authenticates against. No local user table, no
second identity provider. Every venture gets login/signup eventually — streamer sites
included — which is why `server/` is scaffolded as a placeholder rather than left out.
