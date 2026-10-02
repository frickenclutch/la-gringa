# CLAUDE.md — working notes for The Dirty Gringo site

Context for Claude Code (and humans) picking this repo up on any machine. The
README covers what the site is; this file covers how to work on it safely.
**The repo is public** — never commit PINs, tokens, `.dev.vars` or account emails.

## The restaurant

The Dirty Gringo at the Dobisky — Fresh Mex, 100 Riverside Ave, Ogdensburg NY
13669, 315.713.8151. Hours: Tue–Fri 11–7, Sat 11–3, closed Sun/Mon.
Facebook: https://www.facebook.com/tdg.ogdensburg. Trilingual site (EN/ES/FR).
Most real visitors are on phones (≈2/3, half iPhone Safari), and a big share
arrive by tapping the link inside Facebook/Messenger (in-app browsers).

## New machine setup

```bash
npm ci
npx playwright install chromium webkit   # npm run test:mobile needs both
npx wrangler login                        # OAuth as the Dirty Gringo Cloudflare account
cp .dev.vars.example .dev.vars            # local-only test PIN for wrangler dev
```

- If wrangler says the API token is invalid, a stale `CLOUDFLARE_API_TOKEN`
  environment variable is overriding the OAuth login. Run wrangler with it unset
  (bash: `env -u CLOUDFLARE_API_TOKEN npx wrangler …`) or delete the variable.
- `.claude/launch.json` holds the preview configs (`static` :5050, `worker`,
  `worker-demo`, `worker-claim`, `worker-shots` :8787). Use `worker-shots`
  (`--host localhost`) for anything that loads pages: plain `wrangler dev` presents
  requests as `http://dirtygringonny.com`, the canonical redirect fires, and
  browsers loop (ERR_TOO_MANY_REDIRECTS).

## Architecture

- **Cloudflare Workers + Assets** (`wrangler.jsonc`, Worker `la-gringas`). `worker.js`
  runs first on every request (`run_worker_first: true`): canonical 301s, `/api/*`,
  then static assets from `dist/`.
- `npm run deploy` = build CSS → `tools/stage-assets.mjs` copies the listed files
  and dirs into `dist/` → `wrangler deploy`. **Pushing to GitHub does not deploy.**
  Pushing only rebuilds the legacy `la-gringa.pages.dev` mirror (a 301 forwarder via
  the root `_redirects` file — never stage `_redirects` into `dist/`, the Worker
  would redirect-loop).
- Pages: `index.html` (EN/ES/FR passport + skillet game) → `hub.html` → `menu.html`
  (3D book). `owner.html` = PIN-gated editor (unlinked; 5 quick taps on the menu
  cover's wax seal also open it). Copy lives in `data/i18n.json`; `js/i18n.js`
  applies `data-i18n` hooks and exposes `window.DGLang` (`get/set/t/apply/ready`).
- KV `MENU_BOARD`: board (`current`, `history`), menu overrides (`menu-overrides`,
  `menu-history`), owner auth (`owner-auth`, `owner-claim-token`), Facebook drafts
  (`fb-config`, `fb-state`, `fb-drafts`). Workers AI binding `AI` translates owner
  edits (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, m2m100 fallback) — AI calls run
  remotely and bill even in local dev. Responses may be OpenAI-shaped or pre-parsed.
- Custom domains are declared in `wrangler.jsonc` `routes` — that list is the
  COMPLETE set (deploy detaches anything unlisted and deletes its DNS record).
  `workers_dev`/`preview_urls` are pinned true on purpose (routes flip the default).
- Service worker `sw.js`: bump `VERSION` (`dg-vNN`) on deploys that change cached
  pages/JS. It caches clean paths (`/hub`, `/menu`) — link to those, never `*.html`.
  JS is stale-while-revalidate, so a change shows on the second load locally.

## Behaviour worth knowing

- **Month label rolls itself.** `publicBoard()` returns `month.key` (YYYY-MM,
  America/New_York); the menu prints it via `Intl` in the reader's language. An
  owner label survives only if it is their own wording saved in the current month.
- **Dates are restaurant-local.** `todayISO()` uses America/New_York (specials'
  start/end), not UTC.
- **Board translation.** Owner board text is translated to ES/FR on save into
  `board.translations` (`{text: {es, fr}}`) and backfilled once in the background
  for older boards (`ctx.waitUntil` on the public GET).
- **Facebook drafts.** Cron `0 10-15 * * 1-5` (UTC) + `inFacebookWindow()` =
  hourly 6–10 am Mon–Fri Ogdensburg time. Reads the page via Graph API (`FB_GRAPH`,
  currently v23.0 — bump before Meta retires it) using a page token the owner
  connects from `/owner`; AI turns posts into drafts the owner approves. Waiting on
  the owner to connect — untested against real Facebook. Decided: keep the direct
  Meta integration; no scraping. A Zapier/Make webhook was offered as a no-dev-app
  alternative and declined for now.
- **Reward codes are off.** `REWARDS_LIVE = false` in `js/gate-game.js` shows
  "Code's coming soon" until online ordering exists.
- Menu performance: smoothness beats flourish — no pointer/tilt-driven effects
  (parallax was removed for lag). Phones run `data-perf="lite"`.
- Share card: `art/og-card.jpg`, rebuilt by `node tools/build-og-card.mjs`.

## Tests

- `npm test` — `tests/smoke.mjs` (structure, i18n parity, SW, guards) and
  `tests/facebook.mjs` (Facebook drafts flow against fake KV/AI/Graph).
- `npm run test:mobile` — Playwright, 7 profiles: iPhone WebKit, Galaxy, Fold
  cover/inner, Facebook in-app iOS + Android, desktop. ~6–8 min; give the command a
  long timeout and kill leftover node/WebKit processes if a run is cut off. The
  iPhone "five quick taps … owner door" test is known to flake under load.
- Headless WebKit stalls rAF: settle animations with `getAnimations().finish()` and
  click with `dispatchEvent` in tests.

## Windows quirks (this project was built on Windows)

- `npm run deploy` can hang after a successful upload — check the live `/sw.js`
  version instead of waiting. Wrangler exit codes are unreliable.
- `wrangler kv key put --local` crashes and loses the write; use `--var` overrides.
- Very large shell heredocs (~8 KB+) get truncated — write big files with an editor.

## Owner manual

`docs/how-the-site-works.html` (+ `.pdf`) is the owner/admin guide, built from
`docs/src/` (`node docs/src/build-guide.mjs`, `node docs/src/build-pdf.mjs`,
screenshots via `node docs/src/shots.mjs <outdir>` against `worker-shots`). Not
deployed. Never commit `docs/src/guide-artifact.html` (an Artifact export).
**Out of date as of 2026-10-02:** it still describes `www` as broken and predates
the auto month, board translation, Facebook drafts and the share card.

## Open items

- Owner: connect Facebook in `/owner`; replace the placeholder "New this month"
  items (Street corn elote cup, Mango chile agua fresca, Winter pozole).
- `#owner-pin` has `inputmode="numeric"` — phones show a digits-only keypad, so
  word PINs can't be typed. Drop the attribute.
- Dialer (`menu.html`) isn't keyboard/screen-reader reachable; hub hours lose the
  bold day names after i18n.
- Email still runs on the old Namecheap cPanel box (198.54.126.42, MX
  jellyfish.systems). Don't cancel that hosting until mail is moved.
