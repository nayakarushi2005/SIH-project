/**
 * Re-runs feedback through the knowledge graph builder.
 *   npm run graph:reprocess           # feedback the LLM hasn't read yet
 *                                     # (e.g. saved before the key was set up)
 *   npm run graph:reprocess -- --all  # everything — after changing the scoring
 *                                     # in services/graph.js (no new LLM calls
 *                                     # for feedback already extracted)
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Feedback = require('../models/Feedback');
const { processFeedback } = require('../services/graph');
const llm = require('../services/llm');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const all = process.argv.includes('--all');
  if (!llm.isConfigured()) console.warn('⚠️  LLM not configured — rebuilding from rating chips only.');

  const ids = await Feedback.find(all ? {} : { extracted: null }).select('_id').sort({ createdAt: 1 }).lean();
  console.log(`Reprocessing ${ids.length} feedback…`);

  let failed = 0;
  for (const { _id } of ids) {
    await processFeedback(_id);
    const f = await Feedback.findById(_id).select('extracted extractionError').lean();
    if (f.extractionError) failed += 1;
    console.log(
      `  ${_id}  ${f.extracted ? `✓ ${f.extracted.specialties.join(', ') || '(no specialties)'}` : `✗ ${f.extractionError ?? 'not extracted'}`}`
    );
  }
  console.log(`\nDone. ${ids.length - failed} ok, ${failed} failed.`);
}

main()
  .catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    process.exit();
  });
