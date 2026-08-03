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

async function isAuthed(request, env) {
  const secret = getOwnerSecret(env);
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

async function handleOwnerLogin(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const secret = getOwnerSecret(env);
  if (!secret) {
    return json({ error: 'Owner PIN is not configured on the worker' }, 503);
  }

  let pin = '';
  try {
    const body = await request.json();
    pin = String(body?.pin || body?.password || body?.token || '').trim();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!pin || pin !== secret) {
    return json({ error: 'Invalid PIN' }, 401);
  }

  const token = await signSession(secret, Date.now());
  return json(
    { ok: true, expiresIn: TOKEN_TTL_MS },
    200,
    { 'Set-Cookie': sessionCookie(token, Math.floor(TOKEN_TTL_MS / 1000)) }
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
