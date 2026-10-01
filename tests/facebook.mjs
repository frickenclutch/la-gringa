// Facebook drafts flow (worker.js) against fake KV, Workers AI and Graph API:
// connect, draft extraction, de-duplication, the weekday-morning cron window,
// expired tokens and disconnect. Run: node tests/facebook.mjs

const repo = new URL('..', import.meta.url);
const worker = (await import(new URL('worker.js', repo).href)).default;

const store = new Map();
const kv = {
  get: async (k) => store.get(k) ?? null,
  put: async (k, v) => void store.set(k, v),
  delete: async (k) => void store.delete(k),
};
const posts = [
  { id: '111_1', created_time: new Date(Date.now() - 2 * 3600e3).toISOString(), message: 'TACO TUESDAY! Birria tacos $12 today only. Also we are now serving churros every day!', permalink_url: 'https://www.facebook.com/tdg.ogdensburg/posts/1' },
  { id: '111_2', created_time: new Date(Date.now() - 5 * 3600e3).toISOString(), message: 'Thank you Ogdensburg for an amazing summer ❤️' },
  { id: '111_3', created_time: new Date(Date.now() - 30 * 864e5).toISOString(), message: 'Old post: Fish fry Friday $10' },
];
let aiCalls = 0;
const env = {
  MENU_BOARD: kv,
  OWNER_PIN: 'TEST-PIN-1234',
  AI: {
    run: async (model, input) => {
      aiCalls++;
      const text = input.messages?.[1]?.content || '';
      if (/Translate to/.test(text)) return { response: '[t] ' + text.split('\n')[1] };
      if (/Birria/.test(text))
        return { response: { relevant: true, specials: [{ name: 'Birria Tacos', price: '$12', note: 'Today only', startsOn: '2026-10-01', endsOn: '2026-10-01' }], additions: ['Churros'], takeaways: [], notes: '' } };
      return { response: '{"relevant": false}' };
    },
  },
};
const graphCalls = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  graphCalls.push(u.pathname);
  const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
  if (u.pathname.endsWith('/oauth/access_token')) return ok({ access_token: 'LONG_USER' });
  if (u.pathname.endsWith('/me/accounts')) return ok({ data: [{ id: '111', name: 'The Dirty Gringo', username: 'tdg.ogdensburg', access_token: 'PAGE_TOKEN' }] });
  if (u.pathname.endsWith('/111') ) return ok({ id: '111', name: 'The Dirty Gringo' });
  if (u.pathname.endsWith('/111/posts')) {
    if (u.searchParams.get('access_token') !== 'PAGE_TOKEN') return new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 400 });
    return ok({ data: posts });
  }
  return new Response('{}', { status: 404 });
};

const ctx = { waitUntil: (p) => p };
const call = async (method, path, body, cookie) => {
  const res = await worker.fetch(
    new Request('https://dirtygringonny.com' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    ctx
  );
  return { status: res.status, cookie: res.headers.get('Set-Cookie'), data: await res.json().catch(() => null) };
};
const check = (cond, label) => {
  console.log((cond ? '✓ ' : '✗ ') + label);
  if (!cond) process.exitCode = 1;
};

check((await call('GET', '/api/owner/facebook')).status === 401, 'status needs a session');
const login = await call('POST', '/api/owner/login', { pin: 'TEST-PIN-1234' });
check(login.status === 200, 'owner login');
const cookie = login.cookie.split(';')[0];

let r = await call('GET', '/api/owner/facebook', null, cookie);
check(r.data.connected === false, 'starts disconnected');

r = await call('PUT', '/api/owner/facebook', { appId: 'APP', appSecret: 'SECRET', token: 'SHORT_USER' }, cookie);
check(r.status === 200 && r.data.connected && r.data.pageName === 'The Dirty Gringo', 'connect swaps tokens and names the page');
const saved = JSON.parse(store.get('fb-config'));
check(saved.token === 'PAGE_TOKEN' && !JSON.stringify(saved).includes('SECRET'), 'stores page token only, never the app secret');
check(r.data.drafts.length === 1, 'first check: one draft (thank-you skipped, 30-day-old post ignored)');
const d = r.data.drafts[0];
check(d.specials[0].name === 'Birria Tacos' && d.specials[0].price === '12' && d.additions[0] === 'Churros', 'draft carries the special, price and addition');
check(d.link.includes('facebook.com'), 'draft links back to the post');

const aiBefore = aiCalls;
r = await call('POST', '/api/owner/facebook/check', null, cookie);
check(r.data.drafts.length === 1 && aiCalls === aiBefore, 'second check: no duplicate drafts, no repeat AI calls');

const pub = await call('GET', '/api/menu-board');
check(pub.data.specials.every((s) => s.name !== 'Birria Tacos'), 'guests see nothing until the owner acts');

r = await call('POST', '/api/owner/facebook/draft', { id: d.id, status: 'used' }, cookie);
check(r.data.drafts.length === 0, 'marking a draft used clears it');

// scheduled(): runs only in the 6–10 am weekday window, Ogdensburg time
const before = JSON.parse(store.get('fb-state')).lastCheck;
const runAt = async (iso) => {
  let p = null;
  await worker.scheduled({ scheduledTime: Date.parse(iso) }, env, { waitUntil: (x) => (p = x) });
  if (p) await p;
  return Boolean(p);
};
check(await runAt('2026-10-01T10:00:00Z'), 'Thu 6 am EDT runs');
check(!(await runAt('2026-10-01T15:00:00Z')), 'Thu 11 am EDT skipped');
check(await runAt('2026-12-01T15:00:00Z'), 'Tue 10 am EST runs (winter)');
check(!(await runAt('2026-12-01T10:00:00Z')), 'Tue 5 am EST skipped (winter)');
check(!(await runAt('2026-10-03T12:00:00Z')), 'Saturday skipped');
check(JSON.parse(store.get('fb-state')).lastCheck !== before, 'cron run records its check');

// token goes bad → error surfaces, nothing crashes
store.set('fb-config', JSON.stringify({ ...saved, token: 'EXPIRED' }));
r = await call('POST', '/api/owner/facebook/check', null, cookie);
check(r.status === 200 && /bad token/.test(r.data.lastError || ''), 'expired token shows as an error for the owner');

r = await call('DELETE', '/api/owner/facebook', null, cookie);
check(r.data.connected === false, 'disconnect');
console.log('graph paths:', [...new Set(graphCalls)].join(' '));
