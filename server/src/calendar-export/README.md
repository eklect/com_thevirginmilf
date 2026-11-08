# calendar-export

Copied verbatim into every backend with a calendar, like `mail/`. Nothing in
here knows a venture: each one writes a mapper to `ExportItem` from the view
it already shows the viewer, keeps its own `calendar_feed_tokens` table and
cap setting, and calls these helpers.

- `detail-level.ts` — `busy | basic | full`, `effectiveLevel(cap, chosen)`,
  `redact()`, `markdownToText()`.
- `ics.ts` — the RFC 5545 writer (`buildIcs`, folding, escaping).
- `links.ts` — Google / Outlook.com / Microsoft 365 "add" and "subscribe" links.
- `dates.ts` — calendar days in a zone without a date library (`allDaySpan`).
- `feed-token.ts` — the subscription secret (shown once, stored as SHA-256).

Routes carrying an `.ics` file have **no extension** in the URL. `.ics` is not
in `static-site.conf.tmpl`'s regex locations today, but a regex location beats
the `/api/` prefix, so one added later (as `.png` once did to email images)
would swallow the feed silently. The filename travels in `Content-Disposition`.
