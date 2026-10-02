// Compare active models on real menu text (quality + neuron cost).
delete process.env.CLOUDFLARE_API_TOKEN;
const { getPlatformProxy } = await import('wrangler');

const SYS =
  'You translate text for a US Mexican restaurant menu between English and Spanish (Latin American). ' +
  'Return ONLY the translation, no quotes, no commentary. Keep food terms natural for a menu.';

const samples = [
  ['Spanish', 'Crisp shell piled with seasoned beef or chicken, fresh greens, cheddar jack, pico and cool sour cream - served with chips.'],
  ['English', 'Tortilla de harina rellena de chorizo con queso fundido y salsa de la casa.'],
];
const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fp8'];

const proxy = await getPlatformProxy();
try {
  for (const model of models) {
    for (const [target, text] of samples) {
      try {
        const out = await proxy.env.AI.run(model, {
          messages: [
            { role: 'system', content: SYS },
            { role: 'user', content: 'Translate to ' + target + ':\n' + text },
          ],
          max_tokens: 300,
          temperature: 0.1,
        });
        console.log(model.split('/').pop(), '->', target + ':', JSON.stringify(out.response), 'neurons:', out.usage && out.usage.neurons);
      } catch (e) {
        console.log(model.split('/').pop(), '->', target, 'FAILED:', String(e).slice(0, 120));
      }
    }
  }
} finally {
  await proxy.dispose();
}
