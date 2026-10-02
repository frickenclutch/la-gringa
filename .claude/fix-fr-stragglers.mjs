// Re-translate the strings the model left in English, anchored to the
// Spanish pack's translation style.
delete process.env.CLOUDFLARE_API_TOKEN;
import { readFileSync, writeFileSync } from 'node:fs';
const { getPlatformProxy } = await import('wrangler');

const FILE = 'data/i18n.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const keys = Object.keys(data.en).filter((k) => data.fr[k] === data.en[k] && data.es[k] !== data.en[k]);
console.log('fixing', keys.length, 'keys');

const proxy = await getPlatformProxy();
try {
  for (const k of keys) {
    const out = await proxy.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content:
            'Translate the English string to Canadian French for a Mexican restaurant menu. ' +
            'The Spanish version shows how completely to translate — do the same. ' +
            'Keep Mexican menu loanwords (queso, quesadilla, chipotle, taco) as-is. ' +
            'Match the capitalization style of the English. Reply with ONLY the French translation.',
        },
        { role: 'user', content: 'English: ' + data.en[k] + '\nSpanish: ' + data.es[k] + '\nFrench:' },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });
    let t = String(typeof out.response === 'string' ? out.response : out?.choices?.[0]?.message?.content || '').trim();
    if (t.length > 1 && t[0] === '"' && t.endsWith('"')) t = t.slice(1, -1).trim();
    if (t) {
      data.fr[k] = t;
      console.log(' ', k, '=>', JSON.stringify(t));
    } else {
      console.log(' ', k, 'STILL EMPTY');
    }
  }
} finally {
  await proxy.dispose();
}
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('done');
