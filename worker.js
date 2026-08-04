/**
 * Edge worker: reward codes + monthly menu board / owner APIs.
 * Static pages fall through to the Assets binding.
 */

const REWARDS = {
  queso: 'PATIOQUESO20',
  marino: 'MARINOBRIDGE15',
  marley: 'RIVERMARLEY10',
};

const BOARD_KEY = 'current';
const HISTORY_KEY = 'history';
const COOKIE_NAME = 'dg_owner';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORY_LIMIT = 40;
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_SEC = 600;
const OWNER_AUTH_KEY = 'owner-auth';
const CLAIM_TOKEN_KEY = 'owner-claim-token';
const MENU_OVERRIDES_KEY = 'menu-overrides';
const MENU_HISTORY_KEY = 'menu-history';
const MENU_HISTORY_LIMIT = 20;
const MENU_MAX_ITEMS = 400;
const MENU_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,79}$/;
const MENU_TEXT_LANGS = ['en', 'es', 'fr'];
const MENU_TEXT_KINDS = ['name', 'desc'];
const MENU_FIELDS = [
  'price', 'regular', 'loaded', 'p1', 'p2',
  'name_en', 'name_es', 'name_fr', 'desc_en', 'desc_es', 'desc_fr',
];
// Text fields auto-translated to every sibling language on save. Fields the
// owner typed themselves ("manual") always beat machine output; machine-filled
// fields are tracked per item in `_auto` (server-derived, never client-trusted).
const TRANSLATE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TRANSLATE_FALLBACK_MODEL = '@cf/meta/m2m100-1.2b';
const TRANSLATE_SYSTEM =
  'You translate text for a US Mexican restaurant menu between English, Spanish (Latin American), and Canadian French. ' +
  'Return ONLY the translation, no quotes, no commentary. Keep food terms natural for a menu.';
const LANG_NAMES = { en: 'english', es: 'spanish', fr: 'french' };
// PBKDF2 sized for the Workers free-tier CPU budget; the per-IP lockout and a
// passphrase-length PIN carry the brute-force load, not iteration count.
const PBKDF2_ITERATIONS = 25000;
const MIN_PIN_LENGTH = 6;

const SEED_BOARD = {
  month: {
    label: 'August 2026',
    year: 2026,
    additions: ['Street corn elote cup', 'Mango chile agua fresca'],
    takeaways: ['Winter pozole'],
    notes: 'Patio season — specials change with the river wind.',
  },
  specials: [
    {
      id: 'sp-birria-friday',
      name: 'Birria Quesatacos',
      price: '14.00',
      note: 'Consommé, onions, cilantro — while it lasts',
      startsOn: null,
      endsOn: null,
      active: true,
    },
    {
      id: 'sp-river-fish',
      name: 'River Fish Taco Plate',
      price: '13.50',
      note: 'Catch of the day, chipotle crema',
      startsOn: null,
      endsOn: null,
      active: true,
    },
  ],
  updatedAt: '2026-08-01T12:00:00.000Z',
  updatedBy: 'seed',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS,
      ...extraHeaders,
    },
  });
}

function todayISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isSpecialActive(special, today = todayISO()) {
  if (!special || special.active === false) return false;
  if (special.startsOn && today < special.startsOn) return false;
  if (special.endsOn && today > special.endsOn) return false;
  return true;
}

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board || SEED_BOARD));
}

function sanitizeBoard(input, { touch = true } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const monthSrc = src.month && typeof src.month === 'object' ? src.month : {};
  const specialsIn = Array.isArray(src.specials) ? src.specials : [];

  const month = {
    label: String(monthSrc.label || '').trim() || SEED_BOARD.month.label,
    year: Number.isFinite(Number(monthSrc.year)) ? Number(monthSrc.year) : SEED_BOARD.month.year,
    additions: Array.isArray(monthSrc.additions)
      ? monthSrc.additions.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    takeaways: Array.isArray(monthSrc.takeaways)
      ? monthSrc.takeaways.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    notes: String(monthSrc.notes || '').trim(),
  };

  const specials = specialsIn
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      if (!name) return null;
      const id = String(item.id || '').trim() || `sp-${Date.now()}-${index}`;
      return {
        id,
        name,
        price: String(item.price ?? '').trim(),
        note: String(item.note || '').trim(),
        startsOn: item.startsOn ? String(item.startsOn).slice(0, 10) : null,
        endsOn: item.endsOn ? String(item.endsOn).slice(0, 10) : null,
        active: item.active !== false,
      };
    })
    .filter(Boolean);

  return {
    month,
    specials,
    updatedAt: touch ? new Date().toISOString() : String(src.updatedAt || SEED_BOARD.updatedAt),
    updatedBy: String(src.updatedBy || 'owner').trim() || 'owner',
  };
}

function publicBoard(board, today = todayISO()) {
  const full = cloneBoard(board);
  return {
    month: full.month,
    specials: (full.specials || []).filter((s) => isSpecialActive(s, today)),
    updatedAt: full.updatedAt,
    updatedBy: full.updatedBy,
  };
}

async function readKvJson(kv, key) {
  if (!kv) return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeKvJson(kv, key, value) {
  if (!kv) throw new Error('MENU_BOARD KV binding is not configured');
  await kv.put(key, JSON.stringify(value));
}

async function loadBoard(env) {
  const stored = await readKvJson(env.MENU_BOARD, BOARD_KEY);
  if (stored && stored.month) {
    return sanitizeBoard({ ...stored, updatedBy: stored.updatedBy || 'kv' }, { touch: false });
  }
  return cloneBoard(SEED_BOARD);
}

function getOwnerSecret(env) {
  return String(env.OWNER_PIN || env.OWNER_TOKEN || '').trim();
}

function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// Best-effort per-IP login throttle on the KV binding. KV is eventually
// consistent with ~60s edge read caching, so this is a brake on casual
// brute force, not a hard guarantee — the long PIN is the real defense.
function loginFailKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return 'login-fails:' + ip;
}

async function loginFailCount(env, request) {
  if (!env.MENU_BOARD) return 0;
  const raw = await env.MENU_BOARD.get(loginFailKey(request));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function recordLoginFail(env, request, fails) {
  if (!env.MENU_BOARD) return;
  await env.MENU_BOARD.put(loginFailKey(request), String(fails + 1), {
    expirationTtl: LOGIN_WINDOW_SEC,
  });
}

async function clearLoginFails(env, request) {
  if (!env.MENU_BOARD) return;
  try {
    await env.MENU_BOARD.delete(loginFailKey(request));
  } catch {
    // best-effort
  }
}

async function pbkdf2Hash(pin, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Owner auth config lives in KV once the owner claims the board:
 *  { salt, hash, iterations, sessionSecret, updatedAt } (base64url fields).
 *  env.OWNER_PIN remains a legacy/dev override when no KV config exists. */
async function loadOwnerAuth(env) {
  const cfg = await readKvJson(env.MENU_BOARD, OWNER_AUTH_KEY);
  if (!cfg || !cfg.salt || !cfg.hash || !cfg.sessionSecret) return null;
  return cfg;
}

async function saveOwnerAuth(env, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hash(pin, salt, PBKDF2_ITERATIONS);
  const sessionSecret = crypto.getRandomValues(new Uint8Array(32));
  const cfg = {
    salt: b64urlEncode(salt),
    hash: b64urlEncode(hash),
    iterations: PBKDF2_ITERATIONS,
    sessionSecret: b64urlEncode(sessionSecret),
    updatedAt: new Date().toISOString(),
  };
  await writeKvJson(env.MENU_BOARD, OWNER_AUTH_KEY, cfg);
  return cfg;
}

async function verifyOwnerPin(cfg, pin) {
  const expected = b64urlDecode(cfg.hash);
  const actual = await pbkdf2Hash(
    pin,
    b64urlDecode(cfg.salt),
    Number(cfg.iterations) || PBKDF2_ITERATIONS
  );
  return bytesEqual(expected, actual);
}

async function getSigningSecret(env) {
  const cfg = await loadOwnerAuth(env);
  if (cfg) return cfg.sessionSecret;
  return getOwnerSecret(env);
}

/** Active one-time setup token: KV in production, env override for local dev
 *  (wrangler dev --var OWNER_CLAIM_TOKEN:… — the local KV CLI is flaky on Windows). */
async function getActiveClaimToken(env) {
  const fromEnv = String(env.OWNER_CLAIM_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  if (!env.MENU_BOARD) return '';
  return String((await env.MENU_BOARD.get(CLAIM_TOKEN_KEY)) || '').trim();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function b64urlEncode(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlEncodeText(text) {
  return b64urlEncode(new TextEncoder().encode(text));
}

function b64urlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signSession(secret, issuedAt) {
  const payload = b64urlEncodeText(JSON.stringify({ iat: issuedAt, exp: issuedAt + TOKEN_TTL_MS }));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

async function verifySession(secret, token) {
  if (!secret || !token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(sig),
    new TextEncoder().encode(payload)
  );
  if (!ok) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function sessionCookie(token, maxAgeSec) {
  const secure = 'Secure; ';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// The session cookie is HttpOnly, so signing out must happen server-side.
function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function isAuthed(request, env) {
  const secret = await getSigningSecret(env);
  if (!secret) return false;
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  if (await verifySession(secret, cookies[COOKIE_NAME])) return true;
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return verifySession(secret, auth.slice(7).trim());
  }
  return false;
}

async function handleReward(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let recipe;
  try {
    const body = await request.json();
    recipe = typeof body?.recipe === 'string' ? body.recipe.trim().toLowerCase() : '';
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const code = REWARDS[recipe];
  if (!code) {
    return json({ error: 'Unknown recipe' }, 404);
  }

  return json({ recipe, code });
}

async function handleMenuBoardGet(env) {
  const board = await loadBoard(env);
  return json(publicBoard(board));
}

/** Menu overrides: sparse per-dish patches the owner lays over the printed
 *  manuscript. Only whitelisted fields, bounded ids, bounded sizes. */
function sanitizeMenuOverrides(input) {
  const src = input && typeof input === 'object' ? input : {};
  const itemsIn = src.items && typeof src.items === 'object' ? src.items : {};
  const items = {};
  let count = 0;
  for (const [id, entryIn] of Object.entries(itemsIn)) {
    if (count >= MENU_MAX_ITEMS) break;
    if (!MENU_ID_RE.test(id) || !entryIn || typeof entryIn !== 'object') continue;
    const entry = {};
    for (const field of MENU_FIELDS) {
      const value = entryIn[field];
      if (value == null) continue;
      const text = String(value).trim().slice(0, 500);
      if (text) entry[field] = text;
    }
    if (Object.keys(entry).length) {
      items[id] = entry;
      count++;
    }
  }
  return {
    items,
    updatedAt: new Date().toISOString(),
    updatedBy: String(src.updatedBy || 'owner').trim() || 'owner',
  };
}

function cleanTranslation(raw) {
  let t = String(raw == null ? '' : raw).trim();
  // Strip a single layer of wrapping quotes an LLM might add.
  if (t.length > 1 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === '“' && t.endsWith('”')))) {
    t = t.slice(1, -1).trim();
  }
  return t.slice(0, 500) || null;
}

async function translateText(env, text, from, to) {
  if (!env.AI || !text) return null;
  try {
    const out = await env.AI.run(TRANSLATE_MODEL, {
      messages: [
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: 'Translate to ' + to.charAt(0).toUpperCase() + to.slice(1) + ':\n' + text },
      ],
      max_tokens: 300,
      temperature: 0.1,
    });
    const raw =
      out && typeof out.response === 'string'
        ? out.response
        : out?.choices?.[0]?.message?.content;
    const t = cleanTranslation(raw);
    if (t) return t;
  } catch {
    // fall through to the dedicated translation model
  }
  try {
    const out = await env.AI.run(TRANSLATE_FALLBACK_MODEL, {
      text,
      source_lang: from,
      target_lang: to,
    });
    return cleanTranslation(out && out.translated_text);
  } catch {
    return null; // AI unavailable (local dev, quota) — save proceeds untranslated
  }
}

/** Diff-based provenance + machine fill:
 *  - a field whose value differs from the stored doc is a fresh human edit;
 *  - its sibling language gets machine-translated only while absent or
 *    machine-owned — text the owner typed is never overwritten;
 *  - `_auto` (machine-owned fields) is re-derived here, never client-trusted
 *    (the sanitizer already strips it from incoming payloads). */
async function autoTranslateMenu(env, next, previous) {
  const translated = [];
  const prevItems = (previous && previous.items) || {};
  for (const [id, entry] of Object.entries(next.items)) {
    const prevEntry = prevItems[id] || {};
    const prevAuto = new Set(Array.isArray(prevEntry._auto) ? prevEntry._auto : []);
    const auto = new Set();
    for (const f of prevAuto) {
      if (entry[f] != null && entry[f] === prevEntry[f]) auto.add(f); // unchanged machine text
    }
    const filledNow = new Set();
    for (const kind of MENU_TEXT_KINDS) {
      for (const srcLang of MENU_TEXT_LANGS) {
        const src = kind + '_' + srcLang;
        const srcFreshManual =
          entry[src] != null && entry[src] !== prevEntry[src] && !filledNow.has(src);
        if (!srcFreshManual) continue;
        for (const dstLang of MENU_TEXT_LANGS) {
          if (dstLang === srcLang) continue;
          const dst = kind + '_' + dstLang;
          if (filledNow.has(dst)) continue; // one machine fill per field per save
          const dstFreshManual =
            entry[dst] != null && entry[dst] !== prevEntry[dst] && !filledNow.has(dst);
          if (dstFreshManual) continue;
          // Machine-owned = absent, or carried machine text (which must refresh
          // so a re-edited source never drifts from its stale translation).
          const dstMachineOwned = entry[dst] == null || prevAuto.has(dst);
          if (!dstMachineOwned) continue;
          const t = await translateText(env, entry[src], LANG_NAMES[srcLang], LANG_NAMES[dstLang]);
          if (t) {
            entry[dst] = t;
            auto.add(dst);
            filledNow.add(dst);
            translated.push(id + '.' + dst);
          }
        }
      }
    }
    if (auto.size) entry._auto = [...auto];
  }
  return translated;
}

async function loadMenuOverrides(env) {
  const stored = await readKvJson(env.MENU_BOARD, MENU_OVERRIDES_KEY);
  if (stored && stored.items && typeof stored.items === 'object') return stored;
  return { items: {}, updatedAt: null, updatedBy: null };
}

async function handleMenuOverridesGet(env) {
  return json(await loadMenuOverrides(env));
}

async function handleOwnerMenuPut(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!env.MENU_BOARD) {
    return json({ error: 'MENU_BOARD KV binding is not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const overrides = sanitizeMenuOverrides(body);
  const previous = await loadMenuOverrides(env);
  const translated = await autoTranslateMenu(env, overrides, previous);
  const history = (await readKvJson(env.MENU_BOARD, MENU_HISTORY_KEY)) || [];
  history.unshift({ at: overrides.updatedAt, by: overrides.updatedBy, items: previous.items });
  while (history.length > MENU_HISTORY_LIMIT) history.pop();

  await writeKvJson(env.MENU_BOARD, MENU_OVERRIDES_KEY, overrides);
  await writeKvJson(env.MENU_BOARD, MENU_HISTORY_KEY, history);

  return json({ ok: true, overrides, translated });
}

async function handleOwnerLogin(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const cfg = await loadOwnerAuth(env);
  const envSecret = getOwnerSecret(env);
  if (!cfg && !envSecret) {
    return json({ error: 'Owner PIN is not set up yet', mode: 'claim' }, 503);
  }

  let pin = '';
  try {
    const body = await request.json();
    pin = String(body?.pin || body?.password || body?.token || '').trim();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const fails = await loginFailCount(env, request);
  if (fails >= LOGIN_MAX_FAILS) {
    return json(
      { error: 'Too many attempts — the board is resting. Try again later.' },
      429,
      { 'Retry-After': String(LOGIN_WINDOW_SEC) }
    );
  }

  const valid = pin && (cfg ? await verifyOwnerPin(cfg, pin) : safeEqual(pin, envSecret));
  if (!valid) {
    await recordLoginFail(env, request, fails);
    return json({ error: 'Invalid PIN' }, 401);
  }

  await clearLoginFails(env, request);
  const token = await signSession(cfg ? cfg.sessionSecret : envSecret, Date.now());
  return json(
    { ok: true, expiresIn: TOKEN_TTL_MS },
    200,
    { 'Set-Cookie': sessionCookie(token, Math.floor(TOKEN_TTL_MS / 1000)) }
  );
}

async function handleOwnerStatus(env) {
  const cfg = await loadOwnerAuth(env);
  if (cfg || getOwnerSecret(env)) return json({ mode: 'login' });
  const claimToken = await getActiveClaimToken(env);
  return json({ mode: claimToken ? 'claim' : 'unconfigured' });
}

async function handleOwnerClaim(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!env.MENU_BOARD) {
    return json({ error: 'MENU_BOARD KV binding is not configured' }, 503);
  }
  if (await loadOwnerAuth(env)) {
    return json({ error: 'The board is already claimed' }, 409);
  }

  let token = '';
  let pin = '';
  try {
    const body = await request.json();
    token = String(body?.token || '').trim();
    pin = String(body?.pin || '').trim();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const fails = await loginFailCount(env, request);
  if (fails >= LOGIN_MAX_FAILS) {
    return json(
      { error: 'Too many attempts — try again later.' },
      429,
      { 'Retry-After': String(LOGIN_WINDOW_SEC) }
    );
  }

  const stored = await getActiveClaimToken(env);
  if (!stored) {
    return json({ error: 'No setup link is active — ask for a fresh one' }, 403);
  }
  if (!token || !safeEqual(token, stored)) {
    await recordLoginFail(env, request, fails);
    return json({ error: 'That setup link is not valid' }, 403);
  }
  if (pin.length < MIN_PIN_LENGTH) {
    return json({ error: `PIN must be at least ${MIN_PIN_LENGTH} characters` }, 400);
  }

  const cfg = await saveOwnerAuth(env, pin);
  await env.MENU_BOARD.delete(CLAIM_TOKEN_KEY);
  await clearLoginFails(env, request);

  const session = await signSession(cfg.sessionSecret, Date.now());
  return json(
    { ok: true, expiresIn: TOKEN_TTL_MS },
    200,
    { 'Set-Cookie': sessionCookie(session, Math.floor(TOKEN_TTL_MS / 1000)) }
  );
}

async function handleOwnerPinChange(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const cfg = await loadOwnerAuth(env);
  if (!cfg) {
    return json({ error: 'PIN is managed by the deployment secret on this install' }, 400);
  }

  let currentPin = '';
  let newPin = '';
  try {
    const body = await request.json();
    currentPin = String(body?.currentPin || '').trim();
    newPin = String(body?.newPin || '').trim();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const fails = await loginFailCount(env, request);
  if (fails >= LOGIN_MAX_FAILS) {
    return json(
      { error: 'Too many attempts — try again later.' },
      429,
      { 'Retry-After': String(LOGIN_WINDOW_SEC) }
    );
  }
  if (!currentPin || !(await verifyOwnerPin(cfg, currentPin))) {
    await recordLoginFail(env, request, fails);
    return json({ error: 'Current PIN is wrong' }, 401);
  }
  if (newPin.length < MIN_PIN_LENGTH) {
    return json({ error: `New PIN must be at least ${MIN_PIN_LENGTH} characters` }, 400);
  }

  const next = await saveOwnerAuth(env, newPin);
  await clearLoginFails(env, request);
  // Rotating the session secret invalidates every other signed-in device.
  const session = await signSession(next.sessionSecret, Date.now());
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': sessionCookie(session, Math.floor(TOKEN_TTL_MS / 1000)) }
  );
}

async function handleOwnerBoardGet(request, env) {
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const board = await loadBoard(env);
  return json(board);
}

async function handleOwnerBoardPut(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!env.MENU_BOARD) {
    return json({ error: 'MENU_BOARD KV binding is not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const board = sanitizeBoard({ ...body, updatedBy: body?.updatedBy || 'owner' });
  const previous = await loadBoard(env);
  const history = (await readKvJson(env.MENU_BOARD, HISTORY_KEY)) || [];
  const snapshot = {
    at: board.updatedAt,
    by: board.updatedBy,
    month: previous.month,
    specials: previous.specials,
  };
  history.unshift(snapshot);
  while (history.length > HISTORY_LIMIT) history.pop();

  await writeKvJson(env.MENU_BOARD, BOARD_KEY, board);
  await writeKvJson(env.MENU_BOARD, HISTORY_KEY, history);

  return json({ ok: true, board });
}

async function handleOwnerHistory(request, env) {
  if (!(await isAuthed(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const history = (await readKvJson(env.MENU_BOARD, HISTORY_KEY)) || [];
  return json({ history });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/reward') {
      return handleReward(request);
    }
    if (path === '/api/menu-board') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      return handleMenuBoardGet(env);
    }
    if (path === '/api/owner/login') {
      return handleOwnerLogin(request, env);
    }
    if (path === '/api/owner/status') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      return handleOwnerStatus(env);
    }
    if (path === '/api/owner/claim') {
      return handleOwnerClaim(request, env);
    }
    if (path === '/api/owner/pin') {
      return handleOwnerPinChange(request, env);
    }
    if (path === '/api/menu-overrides') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      return handleMenuOverridesGet(env);
    }
    if (path === '/api/owner/menu') {
      return handleOwnerMenuPut(request, env);
    }
    if (path === '/api/owner/logout') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    if (path === '/api/owner/board') {
      if (request.method === 'GET') return handleOwnerBoardGet(request, env);
      if (request.method === 'PUT' || request.method === 'OPTIONS') {
        return handleOwnerBoardPut(request, env);
      }
      return json({ error: 'Method not allowed' }, 405);
    }
    if (path === '/api/owner/history') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      return handleOwnerHistory(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
