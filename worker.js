/**
 * Edge worker: keeps reward codes off the static client bundle.
 * Everything else falls through to the static assets binding.
 */
const REWARDS = {
  queso: 'PATIOQUESO20',
  marino: 'MARINOBRIDGE15',
  marley: 'RIVERMARLEY10',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/reward') {
      return handleReward(request);
    }
    return env.ASSETS.fetch(request);
  },
};
