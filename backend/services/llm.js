/**
 * The one LLM client for the whole backend: Google Gemini on Vertex AI,
 * authenticated with a service account key. Everything that talks to an LLM
 * goes through generateJson(), so the model, auth, region, timeout and output
 * parsing are configured here and nowhere else.
 *
 * backend/.env:
 *   VERTEX_PROJECT_ID=your-gcp-project-id       # "project_id" in the key file
 *   VERTEX_LOCATION=global                      # or a region, e.g. asia-south1
 *   VERTEX_KEY_FILE=./keys/vertex-service-account.json
 *   LLM_MODEL=gemini-3.8-flash                  # optional
 *
 * These are deliberately not Google's standard GOOGLE_CLOUD_PROJECT /
 * GOOGLE_APPLICATION_CREDENTIALS: those are often set machine-wide for other
 * projects, and a variable already in the environment wins over .env — so
 * this app would silently use someone else's key.
 *
 * The service account needs the "Vertex AI User" role. Check the setup with
 * `npm run llm:check`.
 */

const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_LOCATION = 'global';
const TIMEOUT_MS = 30 * 1000;

let client = null;

/** True when the env has what's needed to call Vertex AI. */
function isConfigured() {
  return !!(process.env.VERTEX_PROJECT_ID && process.env.VERTEX_KEY_FILE);
}

function modelName() {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

function location() {
  return process.env.VERTEX_LOCATION || DEFAULT_LOCATION;
}

/** Absolute path of the service account key; relative paths are relative to backend/. */
function keyFile() {
  return path.resolve(__dirname, '..', process.env.VERTEX_KEY_FILE);
}

/** The shared client, created on first use. */
function getClient() {
  if (!client) {
    if (!isConfigured()) {
      throw new Error('LLM is not configured: set VERTEX_PROJECT_ID and VERTEX_KEY_FILE in backend/.env');
    }
    client = new GoogleGenAI({
      enterprise: true, // Vertex AI — the SDK's newer name for `vertexai: true`
      project: process.env.VERTEX_PROJECT_ID,
      location: location(),
      googleAuthOptions: {
        keyFilename: keyFile(), // explicit, so no machine-wide credentials are picked up
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
      httpOptions: { timeout: TIMEOUT_MS },
    });
  }
  return client;
}

/**
 * Asks the model for JSON matching `schema` (a JSON Schema object) and
 * returns it parsed. Deterministic by default (temperature 0).
 */
async function generateJson({ system, prompt, schema, temperature = 0 }) {
  const response = await getClient().models.generateContent({
    model: modelName(),
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });

  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason;
    throw new Error(`LLM returned no text${reason ? ` (${reason})` : ''}`);
  }
  return JSON.parse(text);
}

module.exports = {
  generateJson,
  isConfigured,
  keyFile,
  location,
  modelName,
};
