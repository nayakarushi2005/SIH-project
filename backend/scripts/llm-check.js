/**
 * Checks the Vertex AI setup with one tiny request.
 *   npm run llm:check
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const llm = require('../services/llm');

// Common failures → what to do about them.
const HINTS = [
  [/ENOENT|no such file/i, 'The key file path in VERTEX_KEY_FILE is wrong (relative paths are relative to backend/).'],
  [/different project/i, 'Set VERTEX_PROJECT_ID to the "project_id" inside the key file.'],
  [/PERMISSION_DENIED|403/i, 'Give the service account the "Vertex AI User" role, and enable the Vertex AI API on the project.'],
  [/NOT_FOUND|404|not found/i, 'The model or location isn’t available: set LLM_MODEL to a current Gemini model id, or try GOOGLE_CLOUD_LOCATION=global.'],
  [/invalid_grant|UNAUTHENTICATED|401/i, 'The service account key is invalid or was deleted — create a new key.'],
];

async function main() {
  const project = process.env.VERTEX_PROJECT_ID;
  console.log(`project:  ${project ?? '(not set)'}`);
  console.log(`location: ${llm.location()}`);
  console.log(`model:    ${llm.modelName()}`);

  if (!llm.isConfigured()) {
    throw new Error('Set VERTEX_PROJECT_ID and VERTEX_KEY_FILE in backend/.env');
  }
  const keyPath = llm.keyFile();
  if (!fs.existsSync(keyPath)) throw new Error(`ENOENT: key file not found at ${keyPath}`);
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  console.log(`key:      ${key.client_email ?? '(not a service account key?)'}`);
  if (key.project_id && key.project_id !== project) {
    throw new Error(`The key belongs to a different project (${key.project_id}) than VERTEX_PROJECT_ID (${project})`);
  }

  const started = Date.now();
  const result = await llm.generateJson({
    system: 'Answer with the JSON requested.',
    prompt: 'Reply with ok set to true.',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  });
  if (result?.ok !== true) throw new Error(`Unexpected reply: ${JSON.stringify(result)}`);
  console.log(`\n✅ Vertex AI works (${Date.now() - started} ms)`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  const hint = HINTS.find(([pattern]) => pattern.test(err.message));
  if (hint) console.error(`   → ${hint[1]}`);
  process.exit(1);
});
