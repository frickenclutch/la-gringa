# The Dirty Gringo (la-gringa)

Static patio experience for **The Dirty Gringo at the Dobisky** — skillet gate game, hub crossroads, and a 3D “lost manuscript” menu. Served from Cloudflare (Workers + Assets).

Live brand domain: [dirtygringonny.com](https://dirtygringonny.com)

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
     && echo "https://dirtygringonny.com/owner?claim=$TOKEN"
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

`deploy` builds CSS, stages a clean `dist/` (no `node_modules`), then runs Wrangler. Enable **Web Analytics** (free, cookieless) on the zone for traffic without a third-party tag manager.

### Addresses

| Address | What happens |
|---------|--------------|
| `https://dirtygringonny.com` | The site. Bound to the Worker as a custom domain (Cloudflare issues and renews the certificate) and the canonical URL in every page, the sitemap and `robots.txt`. |
| `http://dirtygringonny.com` | 301 → `https://` (`worker.js`; also switch on **Always Use HTTPS** under SSL/TLS → Edge Certificates). |
| `www.dirtygringonny.com`, `new.dirtygringonny.com` | 301 → the same path on `dirtygringonny.com` (`worker.js`). `www` only reaches the Worker once it is added as a custom domain on it; any zone-level redirect rule for `www` must keep the path or be removed. |
| `la-gringas.the-dirty-gringo.workers.dev` | 301 → the same path on `dirtygringonny.com` (`worker.js`), so links shared before domain day keep working. |
| `la-gringa.pages.dev` | Legacy Cloudflare Pages mirror, rebuilt on every push to `main`. Its `_redirects` 301s every path to the domain and serves only `sw.js` (so an app installed there can retire itself). Pushing never deploys the real site. |
| `/wp/…` (old WordPress paths) | 301 → `/`; `/wp/menu/…` and the old menu PDF → `/menu`. |

`worker.js` runs in front of every request (`run_worker_first: true` in `wrangler.jsonc`) so those redirects apply to pages as well as `/api/*`; the service worker retires itself on any old origin so stale installs follow the redirect instead of a cached page. `mail.`, `webmail.`, `cpanel.`, `ftp.` and the MX records still point at the old hosting box (DNS-only) and are untouched by the site. The Worker deploy (`npm run deploy`) is the canonical site; it does **not** happen on push.

## Stack notes

- Production Tailwind build (not Play CDN)
- Self-hosted fonts + PWA (manifest, icons, menu-safe service worker)
- Adaptive single-page/spread menu layouts for phones, tablets, foldables, and rotation
- Pointer gestures with vertical-scroll protection and one-turn transition locking
- Best-effort Android haptics; visual/audio fallback on iOS (no Web Vibration API)
- Zero third-party runtime on the client
- Logo source and generated icons are in-repo (no WordPress hotlink at build/runtime)

### Menu ambience (`js/menu-ambience.js`)

Atmosphere on the manuscript is built to cost nothing on the main thread: every loop is a
CSS transform/opacity animation on a few small elements, nothing tracks the pointer, and
nothing touches the 3D book. (The old pointer parallax re-composited the book on every mouse
move and made the menu lag; it was removed on 2026-09-03.)

- **The riverfront** — `art/riverfront.svg` is a painterly drawing of the Dobisky waterfront seen from the
  river, worked up from photographs of the site: the long low building with its silver roof, deep
  overhang and rows of white rafter tails, the clerestory along the ridge, full-height glass on a stacked-
  stone knee wall and the open porch with red picnic tables; the two-tier shingle gazebo with dark green
  posts on the concrete pier at the right; the marina's grey floating docks with green trim, a pontoon
  boat and a blue powerboat in front; green lantern lamps and slat benches on the promenade, hydrangeas
  and riprap along the water, the apartment tower behind the trees and the bridge far off to the left,
  under a mackerel sky. Inlined behind the book and recoloured per time of day. The excursion boat
  ties up at the end of the floating dock and makes trips out and back. The parchment grain and soft
  ink outlines sit on the built things only, not on the page.
- **Time of day** — `<html data-daypart="day|dusk|night">` picks the palette and which layers
  show: morning mist by day; fireflies, a moth at the fire and a rocking lantern light after dark.
- **Season** — `data-season` drops marigold petals for Día de los Muertos (Oct 25–Nov 3), snow
  Dec–Feb, and confetti for Cinco de Mayo (May 1–6) and Independencia (Sep 15–16).
- **Moon phase** — computed from the date and drawn in the scene's sky with tonight's real shape.
- **Always** — papel picado strung across the top, a boat crossing the river, a page-corner curl
  that hints the book flips, steam when a dish name is hovered or tapped, and a quiet paper-flip
  sound on page turns (speaker button beside the language chip; the choice is remembered per device).
- **Owner edits** — in `/menu?edit=1` a saved price or dish bleeds in like fresh ink.

Preview any state with query params: `/menu?daypart=dusk&season=snow&moon=0.5`.
Devices flagged `data-perf="lite"` (or `prefers-reduced-motion`) skip every loop and keep only
the palette, the moon, the sound toggle and the hint.

## License

MIT — see [LICENSE](LICENSE). Menu prices and brand marks remain property of The Dirty Gringo.
