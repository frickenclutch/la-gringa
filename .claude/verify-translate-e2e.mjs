// E2E through the real worker: EN edit -> auto Spanish; manual ES edit is
// then never clobbered by later EN edits. PIN comes from .dev.vars, unprinted.
delete process.env.CLOUDFLARE_API_TOKEN;
import { readFileSync } from 'node:fs';
const { unstable_dev } = await import('wrangler');

const pinLine = readFileSync('.dev.vars', 'utf8').split(/\r?\n/).find((l) => l.startsWith('OWNER_PIN='));
const PIN = pinLine ? pinLine.slice('OWNER_PIN='.length).trim() : '';

const worker = await unstable_dev('worker.js', {
  config: 'wrangler.jsonc',
  experimental: { disableExperimentalWarning: true },
});

try {
  const login = await worker.fetch('http://dg/api/owner/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: PIN }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  console.log('login:', login.status);

  const put = (items) =>
    worker.fetch('http://dg/api/owner/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ items }),
    });

  // 1 — EN edit: Spanish should be machine-filled and marked _auto
  let res = await put({
    'item.streetCornSalad': {
      desc_en: 'Char-grilled corn, cotija cheese and lime crema over mixed greens with seasoned chicken.',
    },
  });
  let data = await res.json();
  let entry = data.overrides.items['item.streetCornSalad'];
  console.log('1 EN edit ->', res.status, 'translated:', JSON.stringify(data.translated));
  console.log('  desc_es:', JSON.stringify(entry.desc_es));
  console.log('  _auto:', JSON.stringify(entry._auto));

  // 2 — the wife fixes the Spanish herself (manual ES)
  entry = { ...entry, desc_es: 'Elote asado, queso cotija y crema de limón sobre ensalada con pollo sazonado.' };
  res = await put({ 'item.streetCornSalad': entry });
  data = await res.json();
  entry = data.overrides.items['item.streetCornSalad'];
  console.log('2 manual ES ->', res.status, 'translated:', JSON.stringify(data.translated), '_auto:', JSON.stringify(entry._auto || null));

  // 3 — another EN edit: her Spanish must survive untouched
  entry = { ...entry, desc_en: 'Fire-roasted corn, cotija and lime crema over crisp greens with seasoned chicken.' };
  res = await put({ 'item.streetCornSalad': entry });
  data = await res.json();
  entry = data.overrides.items['item.streetCornSalad'];
  console.log('3 EN edit again ->', res.status, 'translated:', JSON.stringify(data.translated));
  console.log('  her Spanish kept:', JSON.stringify(entry.desc_es));
} finally {
  await worker.stop();
}
