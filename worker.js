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
    label: '',
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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

// Specials start and end on the restaurant's calendar day, not UTC's (which
// rolls over around 8 pm in Ogdensburg). en-CA formats as YYYY-MM-DD.
const RESTAURANT_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function todayISO(date = new Date()) {
  return RESTAURANT_DAY.format(date);
}

function monthKey(date = new Date()) {
  return todayISO(date).slice(0, 7); // YYYY-MM on the restaurant's calendar
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// "September 2026" / "SEPT 2026" style labels only name a month, so the guest
// page can print the month itself (in the reader's language). Anything else
// ("Patio Season") is the owner's own wording and is kept for that month.
function isPlainMonthLabel(label) {
  const words = String(label || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((w) => /^\d{4}$/.test(w) || MONTH_NAMES.some((m) => m.startsWith(w) && w.length >= 3));
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
    label: String(monthSrc.label || '').trim(),
    year: Number.isFinite(Number(monthSrc.year)) ? Number(monthSrc.year) : SEED_BOARD.month.year,
    // The month this board was saved for; a save always means "current".
    key: touch ? monthKey() : /^\d{4}-\d{2}$/.test(monthSrc.key || '') ? monthSrc.key : null,
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

  const translations = {};
  if (src.translations && typeof src.translations === 'object') {
    for (const [text, pack] of Object.entries(src.translations)) {
      if (!pack || typeof pack !== 'object') continue;
      const clean = {};
      for (const lang of BOARD_LANGS) {
        if (typeof pack[lang] === 'string' && pack[lang].trim()) clean[lang] = pack[lang].trim().slice(0, 500);
      }
      if (Object.keys(clean).length) translations[String(text).slice(0, 500)] = clean;
    }
  }

  return {
    month,
    specials,
    translations,
    updatedAt: touch ? new Date().toISOString() : String(src.updatedAt || SEED_BOARD.updatedAt),
    updatedBy: String(src.updatedBy || 'owner').trim() || 'owner',
  };
}

// The guest month label rolls over by itself on the 1st (restaurant time):
// `label` survives only when it is the owner's own wording for the current
// month; otherwise it is empty and the page prints `key` as a month name.
function publicBoard(board, today = todayISO()) {
  const full = cloneBoard(board);
  const key = today.slice(0, 7);
  const custom = full.month.key === key && !isPlainMonthLabel(full.month.label);
  return {
    month: { ...full.month, key, year: Number(key.slice(0, 4)), label: custom ? full.month.label : '' },
    specials: (full.specials || []).filter((s) => isSpecialActive(s, today)),
    translations: full.translations || {},
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

let boardTranslationRunning = false; // one backfill per isolate at a time

async function handleMenuBoardGet(env, ctx) {
  const board = await loadBoard(env);
  // A board saved before translation existed (or while AI was down) gets its
  // ES/FR filled once in the background; guests see English until then.
  if (env.AI && env.MENU_BOARD && ctx && !boardTranslationRunning && boardNeedsTranslation(board)) {
    boardTranslationRunning = true;
    ctx.waitUntil(
      (async () => {
        if (await translateBoard(env, board, board)) {
          await writeKvJson(env.MENU_BOARD, BOARD_KEY, board);
        }
      })()
        .catch(() => {})
        .finally(() => {
          boardTranslationRunning = false;
        })
    );
  }
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

// Every owner-typed text on the specials board (notes, additions, takeaways,
// specials, a custom month label). Owners write in English; ES/FR come from
// the same Workers AI translator as menu edits.
const BOARD_LANGS = ['es', 'fr'];

function boardTexts(board) {
  const m = board.month || {};
  const texts = [m.notes, ...(m.additions || []), ...(m.takeaways || [])];
  if (!isPlainMonthLabel(m.label)) texts.push(m.label);
  for (const sp of board.specials || []) texts.push(sp.name, sp.note);
  return [...new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))];
}

/** Fill `board.translations` ({ text: { es, fr } }) for texts that lack one,
 *  reusing earlier translations and dropping ones no longer on the board.
 *  Returns true when anything changed (so the caller can persist). */
async function translateBoard(env, board, previous) {
  const known = { ...((previous && previous.translations) || {}), ...(board.translations || {}) };
  const next = {};
  let changed = false;
  for (const text of boardTexts(board)) {
    const pack = { ...(known[text] || {}) };
    for (const lang of BOARD_LANGS) {
      if (pack[lang]) continue;
      const t = await translateText(env, text, LANG_NAMES.en, LANG_NAMES[lang]);
      if (t) {
        pack[lang] = t;
        changed = true;
      }
    }
    if (Object.keys(pack).length) next[text] = pack;
  }
  if (Object.keys(next).length !== Object.keys(board.translations || {}).length) changed = true;
  board.translations = next;
  return changed;
}

function boardNeedsTranslation(board) {
  const have = board.translations || {};
  return boardTexts(board).some((t) => BOARD_LANGS.some((lang) => !(have[t] && have[t][lang])));
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

  const board = sanitizeBoard({ ...body, translations: null, updatedBy: body?.updatedBy || 'owner' });
  const previous = await loadBoard(env);
  await translateBoard(env, board, previous);
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

// ── Canonical address ──────────────────────────────────────────────────────
// https://dirtygringonny.com is the one public address. Every other way into
// this Worker — www., the old new. test host, the workers.dev address, plain
// http:// — answers with a 301 to the same path on the real domain, so old
// links, QR codes and search results all land on the proper site. Old
// WordPress paths get a home too. (`run_worker_first: true` in wrangler.jsonc
// makes sure page requests pass through here as well, not just /api/*.)
const CANONICAL_HOST = 'dirtygringonny.com';
const ALIAS_HOSTS = new Set([
  'www.dirtygringonny.com',
  'new.dirtygringonny.com',
  'la-gringas.the-dirty-gringo.workers.dev',
]);
const LEGACY_PATHS = [
  [/^\/wp\/menu(?:\/|$)/i, '/menu'],
  [/^\/wp\/wp-content\/uploads\/.*\.pdf$/i, '/menu'],
  [/^\/wp(?:\/|$)/i, '/'],
];

function isAliasHost(host) {
  if (host === CANONICAL_HOST) return false;
  return ALIAS_HOSTS.has(host) || host.endsWith('.' + CANONICAL_HOST);
}

function canonicalRedirect(request, url) {
  const host = url.hostname.toLowerCase();
  const alias = isAliasHost(host);
  const insecure = host === CANONICAL_HOST && url.protocol === 'http:';
  const legacy = LEGACY_PATHS.find(([re]) => re.test(url.pathname));
  if (!alias && !insecure && !legacy) return null;
  // Retired origins keep serving the service worker itself, so an app
  // installed there can update to the version that unregisters (see sw.js).
  if (alias && !legacy && url.pathname === '/sw.js') return null;
  const target = new URL(url);
  if (alias || insecure) {
    target.protocol = 'https:';
    target.hostname = CANONICAL_HOST;
    target.port = '';
  }
  if (legacy) {
    target.pathname = legacy[1];
    target.search = '';
  }
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
  return new Response(null, {
    status,
    headers: { Location: target.toString(), 'Cache-Control': 'public, max-age=3600' },
  });
}

// ---------------------------------------------------------------------------
// Facebook drafts: the TDG Facebook page is read on a schedule (Mon–Fri,
// hourly 6–10 am Ogdensburg time) and posts that announce specials or monthly
// changes become DRAFTS in the owner's editor. Nothing reaches guests until
// the owner adds a draft to the board and saves it.
//
// The owner connects once from /owner with a Facebook app id + secret and a
// user token from Graph API Explorer; the worker swaps those for a page token
// that does not expire and keeps only that (never the app secret).
// ---------------------------------------------------------------------------
const FB_GRAPH = 'https://graph.facebook.com/v23.0';
const FB_CONFIG_KEY = 'fb-config';
const FB_STATE_KEY = 'fb-state';
const FB_DRAFTS_KEY = 'fb-drafts';
const FB_DRAFTS_LIMIT = 20;
const FB_SEEN_LIMIT = 60;
const FB_FIRST_LOOKBACK_DAYS = 7;
const FB_CHECK_HOURS = [6, 7, 8, 9, 10]; // restaurant time, Mon–Fri
const FB_EXTRACT_SYSTEM =
  'You read Facebook posts from The Dirty Gringo, a Mexican restaurant in Ogdensburg, NY, and pull out ' +
  'anything that belongs on its in-restaurant specials board. Reply with ONLY a JSON object, no prose:\n' +
  '{"relevant": boolean, "specials": [{"name": string, "price": string, "note": string, "startsOn": "YYYY-MM-DD"|null, "endsOn": "YYYY-MM-DD"|null}], ' +
  '"additions": [string], "takeaways": [string], "notes": string}\n' +
  'specials = dishes or deals offered for a day or a limited time (price digits only, e.g. "14.00", or ""). ' +
  'additions = items newly added to the regular menu; takeaways = items removed. notes = one short line ' +
  'worth showing guests (holiday hours, closures), else "". Resolve words like "today" or "this Friday" ' +
  'against the post date given. Posts that are not about food, prices, hours or menu changes ' +
  '(memes, thank-yous, hiring) are {"relevant": false}. Never invent dishes or prices.';

function restaurantClock(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { weekday: parts.weekday, hour: Number(parts.hour) };
}

function inFacebookWindow(date = new Date()) {
  const { weekday, hour } = restaurantClock(date);
  return !['Sat', 'Sun'].includes(weekday) && FB_CHECK_HOURS.includes(hour);
}

async function graph(path, params = {}) {
  const url = new URL(FB_GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.error) {
    const msg = (data && data.error && data.error.message) || 'Facebook answered HTTP ' + res.status;
    const err = new Error(msg);
    err.code = data && data.error && data.error.code;
    throw err;
  }
  return data;
}

/** user token (+ app id/secret) → never-expiring page token for the page. */
async function connectFacebook({ appId, appSecret, token, page }) {
  let userToken = token;
  if (appId && appSecret) {
    const long = await graph('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    userToken = long.access_token || token;
  }
  let pages = [];
  try {
    const accounts = await graph('/me/accounts', { fields: 'id,name,username,access_token', access_token: userToken });
    pages = accounts.data || [];
  } catch {
    pages = []; // a page token has no /me/accounts — fall through and use it as-is
  }
  const want = String(page || '')
    .trim()
    .toLowerCase()
    .replace(/^.*facebook\.com\//, '')
    .replace(/[/?#].*$/, '');
  const match =
    pages.find((p) => want && (p.id === want || String(p.username || '').toLowerCase() === want)) ||
    (pages.length === 1 ? pages[0] : null);
  if (pages.length && !match) {
    throw new Error(
      'That Facebook login manages ' + pages.map((p) => p.name).join(', ') + ' — none matched "' + page + '".'
    );
  }
  const pageToken = match ? match.access_token : userToken;
  const me = await graph(match ? '/' + match.id : '/me', { fields: 'id,name', access_token: pageToken });
  return { pageId: me.id, pageName: me.name, token: pageToken, connectedAt: new Date().toISOString() };
}

function parseJsonLoose(raw) {
  if (raw && typeof raw === 'object') return raw; // Workers AI may pre-parse JSON
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanDraft(found) {
  if (!found || found.relevant === false) return null;
  const str = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const list = (v) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 12) : []);
  const specials = (Array.isArray(found.specials) ? found.specials : [])
    .map((s) => ({
      name: str(s && s.name),
      price: str(s && s.price, 12).replace(/^\$/, ''),
      note: str(s && s.note),
      startsOn: day(s && s.startsOn),
      endsOn: day(s && s.endsOn),
    }))
    .filter((s) => s.name)
    .slice(0, 8);
  const draft = {
    specials,
    additions: list(found.additions),
    takeaways: list(found.takeaways),
    notes: str(found.notes, 240),
  };
  return draft.specials.length || draft.additions.length || draft.takeaways.length || draft.notes ? draft : null;
}

async function extractFromPost(env, post) {
  if (!env.AI) return undefined;
  const postDay = todayISO(new Date(post.created_time));
  try {
    const out = await env.AI.run(TRANSLATE_MODEL, {
      messages: [
        { role: 'system', content: FB_EXTRACT_SYSTEM },
        { role: 'user', content: 'Post date: ' + postDay + '\nPost:\n' + String(post.message).slice(0, 3000) },
      ],
      max_tokens: 700,
      temperature: 0,
    });
    const raw = out && out.response != null ? out.response : out?.choices?.[0]?.message?.content;
    const parsed = parseJsonLoose(raw);
    if (!parsed) return undefined; // unreadable answer: retry on the next check
    return cleanDraft(parsed);
  } catch {
    return undefined; // AI hiccup: leave the post unseen so the next check retries it
  }
}

async function checkFacebook(env, { now = new Date() } = {}) {
  const kv = env.MENU_BOARD;
  const config = await readKvJson(kv, FB_CONFIG_KEY);
  if (!config || !config.token) return { skipped: 'not connected' };
  const state = (await readKvJson(kv, FB_STATE_KEY)) || { seen: [] };
  const seen = new Set(state.seen || []);
  state.lastCheck = now.toISOString();
  let added = 0;
  try {
    const feed = await graph('/' + config.pageId + '/posts', {
      fields: 'id,message,created_time,permalink_url',
      limit: '15',
      access_token: config.token,
    });
    const since = state.firstCheckDone ? 0 : now.getTime() - FB_FIRST_LOOKBACK_DAYS * 864e5;
    const drafts = (await readKvJson(kv, FB_DRAFTS_KEY)) || [];
    for (const post of (feed.data || []).slice().reverse()) {
      if (!post.id || seen.has(post.id)) continue;
      if (!post.message || new Date(post.created_time).getTime() < since) {
        seen.add(post.id);
        continue;
      }
      const draft = await extractFromPost(env, post);
      if (draft === undefined) continue;
      seen.add(post.id);
      if (!draft) continue;
      drafts.unshift({
        id: 'fb-' + post.id,
        postId: post.id,
        postedAt: post.created_time,
        link: post.permalink_url || 'https://www.facebook.com/' + post.id,
        excerpt: String(post.message).slice(0, 280),
        status: 'pending',
        ...draft,
      });
      added += 1;
    }
    while (drafts.length > FB_DRAFTS_LIMIT) drafts.pop();
    if (added) await writeKvJson(kv, FB_DRAFTS_KEY, drafts);
    state.firstCheckDone = true;
    state.lastError = null;
  } catch (error) {
    state.lastError = String(error.message || error).slice(0, 300);
  }
  state.seen = [...seen].slice(-FB_SEEN_LIMIT);
  state.lastAdded = added;
  await writeKvJson(kv, FB_STATE_KEY, state);
  return { added, error: state.lastError };
}

async function facebookStatus(env) {
  const config = await readKvJson(env.MENU_BOARD, FB_CONFIG_KEY);
  const state = (await readKvJson(env.MENU_BOARD, FB_STATE_KEY)) || {};
  const drafts = (await readKvJson(env.MENU_BOARD, FB_DRAFTS_KEY)) || [];
  return {
    connected: Boolean(config && config.token),
    pageName: (config && config.pageName) || null,
    connectedAt: (config && config.connectedAt) || null,
    lastCheck: state.lastCheck || null,
    lastError: state.lastError || null,
    drafts: drafts.filter((d) => d.status === 'pending'),
  };
}

async function handleOwnerFacebook(request, env, path) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!(await isAuthed(request, env))) return json({ error: 'Unauthorized' }, 401);
  if (!env.MENU_BOARD) return json({ error: 'MENU_BOARD KV binding is not configured' }, 503);
  const kv = env.MENU_BOARD;
  let body = {};
  if (request.method === 'POST' || request.method === 'PUT') {
    const text = await request.text();
    try {
      body = text.trim() ? JSON.parse(text) || {} : {};
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
  }

  if (path === '/api/owner/facebook' && request.method === 'GET') {
    return json(await facebookStatus(env));
  }
  if (path === '/api/owner/facebook' && request.method === 'PUT') {
    const token = String(body.token || '').trim();
    if (!token) return json({ error: 'Paste the access token from Graph API Explorer.' }, 400);
    try {
      const config = await connectFacebook({
        appId: String(body.appId || '').trim(),
        appSecret: String(body.appSecret || '').trim(),
        token,
        page: body.page || 'tdg.ogdensburg',
      });
      await writeKvJson(kv, FB_CONFIG_KEY, config);
      await kv.delete(FB_STATE_KEY);
      await checkFacebook(env);
      return json(await facebookStatus(env));
    } catch (error) {
      return json({ error: 'Facebook did not accept that: ' + (error.message || error) }, 400);
    }
  }
  if (path === '/api/owner/facebook' && request.method === 'DELETE') {
    await kv.delete(FB_CONFIG_KEY);
    await kv.delete(FB_STATE_KEY);
    return json(await facebookStatus(env));
  }
  if (path === '/api/owner/facebook/check' && request.method === 'POST') {
    await checkFacebook(env);
    return json(await facebookStatus(env));
  }
  if (path === '/api/owner/facebook/draft' && request.method === 'POST') {
    const status = body.status === 'used' ? 'used' : body.status === 'dismissed' ? 'dismissed' : null;
    if (!status) return json({ error: 'status must be used or dismissed' }, 400);
    const drafts = (await readKvJson(kv, FB_DRAFTS_KEY)) || [];
    const draft = drafts.find((d) => d.id === body.id);
    if (!draft) return json({ error: 'No such draft' }, 404);
    draft.status = status;
    draft.decidedAt = new Date().toISOString();
    await writeKvJson(kv, FB_DRAFTS_KEY, drafts);
    return json(await facebookStatus(env));
  }
  return json({ error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const redirect = canonicalRedirect(request, url);
    if (redirect) return redirect;
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/reward') {
      return handleReward(request);
    }
    if (path === '/api/menu-board') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      return handleMenuBoardGet(env, ctx);
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
    if (path === '/api/owner/facebook' || path.startsWith('/api/owner/facebook/')) {
      return handleOwnerFacebook(request, env, path);
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

  // Cron fires hourly 10:00-15:00 UTC on weekdays (wrangler.jsonc), which
  // covers 6-10 am in Ogdensburg in both EDT and EST; the clock check keeps
  // exactly the five local-morning runs.
  async scheduled(event, env, ctx) {
    if (!env.MENU_BOARD || !inFacebookWindow(new Date(event.scheduledTime))) return;
    ctx.waitUntil(checkFacebook(env));
  },
};
