# Deployment guide — Google Cloud Run + Expo APK

Everything runs in the cloud, so the app works without your laptop.

```mermaid
graph LR
    APK[Android APK<br>built by Expo EAS] -->|HTTPS| API
    APK -->|HTTPS| AI
    Portal[Web portal] -->|HTTPS| API
    subgraph Google Cloud Run · asia-south1
        API[sih-backend<br>Node API]
        DISP[sih-dispatcher<br>queues + sweeps]
        AI[sih-ai<br>Python voice agents]
    end
    API --> Mongo[(MongoDB Atlas)]
    DISP --> Mongo
    AI --> Mongo
    API --> Redis[(Upstash Redis)]
    DISP --> Redis
    AI -->|checks tokens| API
    API & DISP & AI --> Vertex[Vertex AI Gemini]
    API --> Cloudinary
```

| Service | What it runs | Settings |
|---|---|---|
| `sih-backend` | `backend/` API (`server.js`) | public, 1 instance always warm (SOS must not wait for a cold start) |
| `sih-dispatcher` | `backend/dispatcher.js`: job dispatch, feedback graph, voice-note triage, safety sweeps | private, exactly 1 instance, CPU always on |
| `sih-ai` | `ai-service/` (FastAPI) | public |

Commands below are for **Git Bash** on Windows (or any bash). Run them from the repo root.

---

## 1. One-time setup

### Google Cloud

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), then:

   ```bash
   gcloud auth login
   gcloud config set project <PROJECT_ID>
   gcloud config set run/region asia-south1
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com
   ```

2. Store the Vertex AI service-account key in Secret Manager (it is mounted into the containers as a
   file, never baked into an image), and let Cloud Run read it:

   ```bash
   gcloud secrets create vertex-key --data-file=backend/keys/vertex-service-account.json

   PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
   gcloud secrets add-iam-policy-binding vertex-key \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/secretmanager.secretAccessor
   ```

   The key's service account needs the **Vertex AI User** role (it already works locally if
   `npm run llm:check` passes).

### MongoDB Atlas

Cloud Run has no fixed outgoing IP, so in **Network Access** allow `0.0.0.0/0`, and make sure the
database user has a strong password.

### Redis (Upstash)

Cloud Run can't reach a Redis on your laptop. Create a free database at
[upstash.com](https://upstash.com) (region Mumbai) and copy its `rediss://…` URL. The dispatcher is
already tuned for Upstash's per-command billing.

### Env files

```bash
cp deploy/backend.env.example.yaml deploy/backend.env.yaml   # fill in from backend/.env
cp deploy/ai.env.example.yaml deploy/ai.env.yaml             # fill in NODE_API_URL after step 2
```

Both are gitignored. Never put `PORT` in them — Cloud Run sets it.

---

## 2. Deploy the backend

```bash
gcloud run deploy sih-backend --source backend \
  --allow-unauthenticated --min-instances 1 \
  --env-vars-file deploy/backend.env.yaml \
  --set-secrets=/secrets/vertex/key.json=vertex-key:latest
```

It prints the service URL, e.g. `https://sih-backend-xxxxx.asia-south1.run.app`. Check it:

```bash
curl https://sih-backend-xxxxx.asia-south1.run.app/api/health
```

If this is a fresh database, load the job categories once from your laptop (with `MONGODB_URI` in
`backend/.env` pointing at Atlas): `cd backend && npm run seed:categories`.

## 3. Deploy the dispatcher

Same image as the backend, started with `node dispatcher.js`. It must run all the time (it takes work
from Redis rather than HTTP requests), so CPU is never throttled and there is exactly one instance.

```bash
gcloud run deploy sih-dispatcher --source backend \
  --command node --args dispatcher.js \
  --no-allow-unauthenticated --no-cpu-throttling \
  --min-instances 1 --max-instances 1 \
  --env-vars-file deploy/backend.env.yaml \
  --set-secrets=/secrets/vertex/key.json=vertex-key:latest
```

Its logs should show `Listening on the "dispatch" queue` (and `graph`, `safety-voice`).

## 4. Deploy the AI service

Set `NODE_API_URL` in `deploy/ai.env.yaml` to the backend URL + `/api`, then:

```bash
gcloud run deploy sih-ai --source ai-service \
  --allow-unauthenticated \
  --env-vars-file deploy/ai.env.yaml \
  --set-secrets=/secrets/vertex/key.json=vertex-key:latest

curl https://sih-ai-xxxxx.asia-south1.run.app/health   # "vertexConfigured": true
```

---

## 5. Build the APK (Expo EAS)

`client-native/.env` is gitignored, so EAS builds never see it — the values go into EAS instead.

```bash
cd client-native
npx eas-cli@latest login

npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_API_BASE_URL --value https://sih-backend-xxxxx.asia-south1.run.app/api
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_AI_BASE_URL --value https://sih-ai-xxxxx.asia-south1.run.app
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <same as in client-native/.env>
npx eas-cli@latest env:create --environment preview --visibility sensitive \
  --name GOOGLE_MAPS_API_KEY --value <same as in client-native/.env>

npx eas-cli@latest build --platform android --profile preview-apk
```

The build ends with a download link for the `.apk`; open it on a phone to install.

### Before handing the APK out: signing fingerprint

EAS signs the APK with its own key, so Google sees a different app fingerprint than your debug build.
Get the SHA-1 with `npx eas-cli@latest credentials -p android`, then in Google Cloud Console →
**APIs & Services → Credentials**:

1. **Google Sign-In** — create (or edit) an *Android* OAuth client for package
   `com.sihproject.connect` with that SHA-1. Without it, sign-in fails with `DEVELOPER_ERROR`.
2. **Maps key** — if it is restricted to Android apps, add the same package + SHA-1, or the Sisterhood
   Shield map stays blank.

---

## 6. Web portal (optional)

The portal (`client/`) is a static site. Build it against the backend (without `/api`):

```bash
cd client
VITE_API_URL=https://sih-backend-xxxxx.asia-south1.run.app npm run build   # output in client/dist
```

Host `client/dist` anywhere static (e.g. Firebase Hosting). Then set `CLIENT_ORIGIN` in
`deploy/backend.env.yaml` to the portal URL, redeploy the backend (step 2), and add that URL to the
web OAuth client's **Authorized JavaScript origins**. The portal signs in with a refresh-token cookie,
so it works best on the same site as the API (e.g. `portal.example.com` + `api.example.com` via Cloud
Run domain mappings).

---

## Updating

| Changed | Do |
|---|---|
| `backend/` | re-run steps 2 **and** 3 (same code) |
| `ai-service/` | re-run step 4 |
| an env value | edit the yaml, re-run that service's deploy (or `gcloud run services update <name> --update-env-vars KEY=value`) |
| `client-native/` | `npx eas-cli@latest build --platform android --profile preview-apk` and share the new APK |

Logs: `gcloud run services logs read sih-backend --limit 100` (or Cloud Console → Cloud Run → service → Logs).

## Cost notes

`sih-backend` (1 warm instance) and `sih-dispatcher` (1 instance, CPU always on) are billed around the
clock; `sih-ai` scales to zero. For a demo, both always-on services fit in the free trial credit; to save
money between demos, set `--min-instances 0` on the backend (first request after idle takes a few seconds).
