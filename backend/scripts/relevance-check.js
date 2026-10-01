/**
 * Calibrates the ranking's relevance signal against the real embedding model:
 * prints how similar jobs of the same kind are vs. different work in the
 * same trade, to set CONFIG.simFloor / simCeil in services/relevance.js.
 *   node scripts/relevance-check.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const llm = require('../services/llm');
const { CONFIG } = require('../services/relevance');
const { dot } = require('../services/vectors');

// [job being dispatched, a past job, same kind of work?]
const PAIRS = [
  ['AC Repair: AC not cooling, needs gas refill', 'AC Repair: Gas leak in split AC, refilled R32 gas', true],
  ['AC Repair: AC not cooling, needs gas refill', 'AC Repair: एसी में गैस भरनी है, ठंडा नहीं कर रहा', true],
  ['AC Repair: AC not cooling, needs gas refill', 'AC Repair: Install new 1.5 ton split AC on the wall', false],
  ['AC Repair: AC not cooling, needs gas refill', 'AC Repair: Clean filters and service window AC', false],
  ['Plumber: Kitchen sink pipe is leaking', 'Plumber: Replace leaking pipe under the wash basin', true],
  ['Plumber: Kitchen sink pipe is leaking', 'Plumber: Fit a new geyser in the bathroom', false],
  ['Electrician: Fan not working, regulator burnt', 'Electrician: Ceiling fan regulator replaced', true],
  ['Electrician: Fan not working, regulator burnt', 'Electrician: Full house wiring for new flat', false],
];

async function main() {
  if (!llm.isConfigured()) throw new Error('Set VERTEX_PROJECT_ID and VERTEX_KEY_FILE in backend/.env');
  const texts = [...new Set(PAIRS.flatMap(([a, b]) => [a, b]))];
  const vectors = await llm.embed(texts);
  const vec = new Map(texts.map((t, i) => [t, vectors[i]]));

  const same = [];
  const different = [];
  for (const [a, b, alike] of PAIRS) {
    const sim = dot(vec.get(a), vec.get(b));
    (alike ? same : different).push(sim);
    console.log(`${sim.toFixed(3)}  ${alike ? 'same     ' : 'different'}  ${a}  ↔  ${b}`);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`\nsame kind: avg ${avg(same).toFixed(3)}, min ${Math.min(...same).toFixed(3)}`);
  console.log(`different: avg ${avg(different).toFixed(3)}, max ${Math.max(...different).toFixed(3)}`);
  console.log(`current CONFIG: simFloor ${CONFIG.simFloor}, simCeil ${CONFIG.simCeil}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
