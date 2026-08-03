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

### Owner board — self-service setup

The owner claims the board from the site itself; no terminal or deploy secrets needed:

1. Seed a one-time setup token (7-day TTL) and send the owner the link it prints:

   ```bash
   TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))") \
     && npx wrangler kv key put --binding MENU_BOARD --remote owner-claim-token "$TOKEN" --expiration-ttl 604800 \
     && echo "https://la-gringas.the-dirty-gringo.workers.dev/owner?claim=$TOKEN"
   ```

2. The owner opens the link, chooses a PIN (6+ characters — a short phrase is best), and lands straight in the editor. The PIN is stored as a salted PBKDF2 hash in KV; the token burns on claim.
3. The PIN can be changed anytime from the editor's **Change PIN** panel (rotates the session secret, signing out all other devices). Lost PIN: re-run step 1 after deleting the `owner-auth` KV key.

Login, claim, and PIN change share a per-IP throttle: 5 failures → 10-minute lockout.

Local dev: `OWNER_PIN=...` in `.dev.vars` runs the legacy env-PIN mode; `wrangler dev --var OWNER_CLAIM_TOKEN:demo` exercises the claim flow (see `.claude/launch.json` configs).

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
| `GET /api/owner/status` · `POST /api/owner/claim` · `POST /api/owner/pin` | First-run claim flow + self-service PIN change |
| `GET /api/menu-overrides` · `PUT /api/owner/menu` | Live menu edits (names/descriptions/prices) layered over the printed manuscript; text edits auto-translate EN⇄ES via Workers AI (`llama-3.3-70b`, `m2m100` fallback) — machine fills never overwrite text the owner typed |

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

Note: pushes to `main` also auto-refresh the static mirror at **la-gringa.pages.dev** (legacy Cloudflare Pages project, serves the repo root with no `/api/*` — the skillet game falls back to its counter message and the board reads `data/menu-board.json`). The Worker deploy (`npm run deploy`) is the canonical site; remember it does **not** happen on push.

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
