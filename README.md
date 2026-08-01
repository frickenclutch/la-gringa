# The Dirty Gringo (la-gringa)

Static patio experience for **The Dirty Gringo at the Dobisky** — skillet gate game, hub crossroads, and a 3D “lost manuscript” menu. Served from Cloudflare (Workers + Assets).

Live brand domain: [dirtygringonny.com](https://www.dirtygringonny.com)

## Quick start

```bash
npm install
npm run build        # Tailwind + stage dist/ for Workers Assets
npm test             # repo smoke tests
npm run test:mobile  # Playwright: iPhone/WebKit, Galaxy, Fold, desktop
npm run dev          # local preview with worker APIs
```

For the owner board locally:

```bash
npx wrangler secret put OWNER_PIN   # production
# or for local:
echo OWNER_PIN=1234 >> .dev.vars
```

Create the KV namespace once (requires Cloudflare auth for the Dirty Gringo account), then paste the id into `wrangler.jsonc`:

```bash
npx wrangler kv namespace create MENU_BOARD
```

Optional asset rebuilds (logo is vendored under `assets/logo-source.png`):

```bash
npm run build:icons
npm run build:fonts
```

## Site map

| Path | Role |
|------|------|
| `/` (`index.html`) | Language passport (first visit) → gated entrance + skillet catch game |
| `/hub` | Crossroads: menu, call, directions, hours |
| `/menu` | Interactive parchment menu + street specials + **Get the Menu App** install |
| `/owner` | Private PIN editor for monthly swaps + daily specials (not linked from guest nav) |
| `POST /api/reward` | Issues patio promo codes (worker only — not in client JS) |
| `GET /api/menu-board` | Public month cycle + currently active specials |
| `POST /api/owner/login` · `PUT /api/owner/board` · `GET /api/owner/history` | Owner board auth, save, audit trail |

From the menu page, Chromium browsers get the native install prompt; iOS Safari gets an Add to Home Screen coach mark. The menu uses `manifest-menu.webmanifest` (`start_url: /menu`) so the installed app opens straight into the manuscript.

## Configuration

Venue copy and SEO facts live in [`data/site.json`](data/site.json). Game recipes (no codes) live in [`data/recipes.json`](data/recipes.json). UI strings for English/Español live in [`data/i18n.json`](data/i18n.json). Reward codes are mapped only in [`worker.js`](worker.js). Monthly swaps + specials seed data live in [`data/menu-board.json`](data/menu-board.json) and are served/edited via the worker + `MENU_BOARD` KV.

First visit shows a passport-stamp language gate (emblem + two skillets). Choice is saved in `localStorage` (`dg-lang`) and can be flipped anytime with the EN | ES chip. Gate, hub, and the parchment menu manuscript (section titles, dish names, descriptions) all follow that choice; prices and contact details stay as printed.

To re-skin for another venue: update `data/site.json`, recipes, menu HTML, and brand colors in the page `<style>` / Tailwind theme — keep the gate → hub → menu flow.

## Deploy

```bash
npm run deploy
```

`deploy` builds CSS, stages a clean `dist/` (no `node_modules`), then runs Wrangler. Point the custom domain in the Cloudflare dashboard when ready. Enable **Web Analytics** (free, cookieless) on the project for traffic without a third-party tag manager.

## Stack notes

- Production Tailwind build (not Play CDN)
- Self-hosted fonts + PWA (manifest, icons, menu-safe service worker)
- Adaptive single-page/spread menu layouts for phones, tablets, foldables, and rotation
- Pointer gestures with vertical-scroll protection and one-turn transition locking
- Best-effort Android haptics; visual/audio fallback on iOS (no Web Vibration API)
- Zero third-party runtime on the client
- Logo source and generated icons are in-repo (no WordPress hotlink at build/runtime)

## License

MIT — see [LICENSE](LICENSE). Menu prices and brand marks remain property of The Dirty Gringo.
