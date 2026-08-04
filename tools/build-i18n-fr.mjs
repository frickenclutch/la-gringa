/**
 * Generate the French pack for data/i18n.json via Workers AI.
 * - Keys the human Spanish pack left identical to English are treated as
 *   invariant (brand names, dish proper nouns) and copied verbatim.
 * - Passport strings are hand-written, not machine translated.
 * - Re-runnable: only fills keys missing from fr unless --force.
 */
delete process.env.CLOUDFLARE_API_TOKEN; // stale machine token hijacks wrangler auth
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { getPlatformProxy } = await import('wrangler');

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FILE = join(root, 'data', 'i18n.json');
const FORCE = process.argv.includes('--force');

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const SYS =
  'You translate text for a US Mexican restaurant menu and its small website from English to French (Canadian French, menu register). ' +
  'Keep dish/brand proper nouns as-is. Preserve \\n newlines and any HTML tags exactly. Keep measurements like "2OZ." as printed. ' +
  'Reply with ONLY a JSON array of the translated strings, same order and length as the input array.';

// The trilingual passport ask is shared by every pack.
const TITLE = '¿Español, English,\nou Français?';
const MANUAL_FR = {
  'passport.eyebrow': 'Traversée du fleuve · frontière du Saint-Laurent',
  'passport.title': TITLE,
  'passport.sub': 'Choisis ta langue. Tamponne ton passeport. Entre sur le patio.',
  'passport.es': 'Español',
  'passport.esHint': 'Mi amigo',
  'passport.en': 'English',
  'passport.enHint': 'My friend',
  'passport.fr': 'Français',
  'passport.frHint': 'Mon ami',
  'passport.toggle': 'Langue',
};

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const en = data.en;
const es = data.es;
const fr = FORCE ? {} : data.fr || {};

// New passport keys ride along in every pack.
en['passport.fr'] = 'Français';
en['passport.frHint'] = 'Mon ami';
es['passport.fr'] = 'Français';
es['passport.frHint'] = 'Mon ami';
en['passport.title'] = TITLE;
es['passport.title'] = TITLE;

const keys = Object.keys(en);
const todo = [];
for (const k of keys) {
  if (fr[k] != null) continue;
  if (MANUAL_FR[k] != null) {
    fr[k] = MANUAL_FR[k];
  } else if (es[k] === en[k]) {
    fr[k] = en[k]; // invariant (brand/dish names, printed labels)
  } else {
    todo.push(k);
  }
}
console.log('keys:', keys.length, '| to translate:', todo.length);

let neurons = 0;
const proxy = await getPlatformProxy();
try {
  async function translateBatch(batchKeys) {
    const texts = batchKeys.map((k) => en[k]);
    const out = await proxy.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      max_tokens: 1600,
      temperature: 0.1,
    });
    neurons += (out.usage && out.usage.neurons) || 0;
    // Workers AI may hand back `response` pre-parsed (when the model emitted
    // pure JSON), a raw string, or only OpenAI-style choices[].message.content.
    let payload = out && out.response != null ? out.response : out?.choices?.[0]?.message?.content;
    let arr;
    if (Array.isArray(payload)) {
      arr = payload;
    } else {
      const raw = String(payload || '').trim();
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      arr = JSON.parse(raw.slice(start, end + 1));
    }
    if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('batch shape mismatch');
    batchKeys.forEach((k, i) => {
      fr[k] = String(arr[i]);
    });
  }

  const BATCH = 12;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      await translateBatch(batch);
    } catch (e) {
      console.log('batch fell back to singles at', i, '-', String(e).slice(0, 80));
      for (const k of batch) {
        try {
          await translateBatch([k]);
        } catch (e2) {
          console.log('  FAILED:', k);
        }
      }
    }
    process.stdout.write('  translated ' + Math.min(i + BATCH, todo.length) + '/' + todo.length + '\r');
  }
} finally {
  await proxy.dispose();
}

// Rebuild all packs in en key order for a stable file.
const ordered = { en: {}, es: {}, fr: {} };
for (const k of keys) {
  ordered.en[k] = en[k];
  ordered.es[k] = es[k] != null ? es[k] : en[k];
  ordered.fr[k] = fr[k] != null ? fr[k] : en[k];
}
writeFileSync(FILE, JSON.stringify(ordered, null, 2) + '\n');

const missing = keys.filter((k) => fr[k] == null);
console.log('\nwrote fr pack:', Object.keys(ordered.fr).length, 'keys | unresolved:', missing.length, '| neurons:', neurons.toFixed(1));
console.log('samples:');
for (const k of ['menu.sec.sidesSalads', 'menu.item.tacoSalad.desc', 'menu.note.hours', 'hub.card.menu.title']) {
  if (ordered.fr[k]) console.log(' ', k, '=>', JSON.stringify(ordered.fr[k]).slice(0, 110));
}
