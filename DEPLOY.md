# Deploying Kinetic

Kinetic is split into two services:

- **Frontend** — a Next.js 16 app in `frontend/`. Hosted on **Vercel**.
- **Backend** — a FastAPI service in `backend/`. Hosted on **Render**.

Both have free tiers and don't require a credit card for the basic
flow described here.

> Heads-up: Render's free tier sleeps the service after ~15 min of
> inactivity, so the very first request after idling takes ~30 s to
> wake the dyno. Subsequent requests are fast.

Before deploying a beta link, run the checkpoint in
[BETA_RUNBOOK.md](./BETA_RUNBOOK.md). Hosted beta should use strict backend
auth, deployed Firestore owner-only rules, and deterministic AI fallback unless
a live AI runtime is intentionally selected.

---

## 1. Deploy the backend to Render

1. Sign in at https://render.com and connect your GitHub account.
2. **New + → Blueprint** → pick this `kinetic` repo. Render reads
   [`render.yaml`](./render.yaml) and proposes a service called
   `kinetic-backend`. Click **Apply**.
3. Once the service exists, open it in the dashboard and set:
   - **Settings → Secret Files → Add Secret File**
     - Filename: `firebase-admin.json`
     - Contents: paste your Firebase service-account JSON (the one
       that lives locally at `secrets/firebase-admin.json`)
     - Render auto-mounts it at `/etc/secrets/firebase-admin.json`,
       which is what `FIREBASE_CREDENTIALS` already points at.
   - **Environment → Add Environment Variable**
     - Key: `KINETIC_CORS_ORIGINS`
     - Value: leave blank for now — you'll paste the Vercel URL after
       step 2 below.
4. Trigger a deploy. When it goes live, note the URL (something like
   `https://kinetic-backend.onrender.com`) and confirm
   `https://<your-url>/health` returns `{"status":"ok"}`.
5. Keep `KINETIC_AUTH_REQUIRED=true` for hosted beta. Local permissive auth is
   only for development.

## 2. Deploy the frontend to Vercel

1. Sign in at https://vercel.com and connect your GitHub account.
2. **Add New → Project** → import the `kinetic` repo.
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build & Output Settings**: leave defaults
4. **Environment Variables** — paste these (see
   [`frontend/.env.example`](./frontend/.env.example) for the full
   list and where to find each value):
   - All seven `NEXT_PUBLIC_FIREBASE_*` keys (copy from your local
     `frontend/.env.local`).
   - `NEXT_PUBLIC_API_BASE_URL` = the Render URL from step 1
     (e.g. `https://kinetic-backend.onrender.com`).
5. Click **Deploy**. Vercel will give you a URL like
   `https://kinetic-<hash>.vercel.app`.

## 3. Wire the two together

1. Back in **Render → kinetic-backend → Environment**, set
   `KINETIC_CORS_ORIGINS` to the Vercel URL (e.g.
   `https://kinetic-<hash>.vercel.app`). Render will redeploy
   automatically.
2. In **Firebase Console → Authentication → Settings → Authorized
   domains**, add the Vercel domain so sign-in works from production.

## 4. Try it

Visit your Vercel URL, sign in with Google, walk through onboarding,
and the dashboard should pull a real recommendation from the Render
backend. Open browser DevTools → Network and confirm the `/decision`
request hits `https://kinetic-backend.onrender.com` and returns 200.

Also verify Profile deletion still writes confirmed Firebase tombstones before
local state clears. If auth, persistence, or repository code changed, rerun the
live Firebase persistence QA from [BETA_RUNBOOK.md](./BETA_RUNBOOK.md).

## 5. Rollback

- **Frontend** — use Vercel's deployment history to promote the last green
  deployment.
- **Backend** — use Render's deploy history or redeploy the last green commit.
- **Firebase rules** — redeploy the last known-good `firestore.rules`; never
  temporarily allow cross-user reads/writes to unblock a demo.
- After rollback, rerun the runbook checkpoint and confirm `/health`,
  signed-in `/decision`, and Profile deletion behavior.

---

## Custom domain (optional)

- **Vercel** — Project → Settings → Domains → add yours, follow the
  CNAME instructions.
- After it resolves, update Firebase Authorized domains and the
  Render `KINETIC_CORS_ORIGINS` value to include the new domain
  (you can list multiple comma-separated origins).
