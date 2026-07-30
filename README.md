# The Dirty Gringo (la-gringa)

Static patio experience for **The Dirty Gringo at the Dobisky** — skillet gate game, hub crossroads, and a 3D “lost manuscript” menu. Served from Cloudflare (Workers + Assets).

Live brand domain: [dirtygringonny.com](https://www.dirtygringonny.com)

## Quick start

```bash
npm install
npm run build        # Tailwind + stage dist/ for Workers Assets
npm test             # repo smoke tests
npm run dev          # local preview with /api/reward worker
```

Optional asset rebuilds (logo is vendored under `assets/logo-source.png`):

```bash
npm run build:icons
npm run build:fonts
```

## Site map

| Path | Role |
|------|------|
| `/` (`index.html`) | Gated entrance + skillet catch game |
| `/hub` | Crossroads: menu, call, directions, hours |
| `/menu` | Interactive parchment menu |
| `POST /api/reward` | Issues patio promo codes (worker only — not in client JS) |

## Configuration

Venue copy and SEO facts live in [`data/site.json`](data/site.json). Game recipes (no codes) live in [`data/recipes.json`](data/recipes.json). Reward codes are mapped only in [`worker.js`](worker.js).

To re-skin for another venue: update `data/site.json`, recipes, menu HTML, and brand colors in the page `<style>` / Tailwind theme — keep the gate → hub → menu flow.

## Deploy

```bash
npm run deploy
```

`deploy` builds CSS, stages a clean `dist/` (no `node_modules`), then runs Wrangler. Point the custom domain in the Cloudflare dashboard when ready. Enable **Web Analytics** (free, cookieless) on the project for traffic without a third-party tag manager.

## Stack notes

- Production Tailwind build (not Play CDN)
- Self-hosted fonts + PWA (manifest, icons, menu-safe service worker)
- Zero third-party runtime on the client
- Logo source and generated icons are in-repo (no WordPress hotlink at build/runtime)

## License

MIT — see [LICENSE](LICENSE). Menu prices and brand marks remain property of The Dirty Gringo.
