# Kinetic Beta Runbook

This runbook is the operational handoff for the current beta-ready foundation.
It keeps the demo/free-tier path working while making the remaining beta gates
explicit.

## Current phase

Kinetic is past the demo release gate and the live Firebase persistence gate.
The current phase is beta hardening: dependency posture, repeatable operational
checks, final QA coverage, and privacy-bounded telemetry review.

Do not expand into hosted AI, wearable ingestion, native mobile, push
notifications, coach sharing, or autonomous AI plan mutation until this phase
is clean.

## Local services

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm run dev
```

Production-like frontend:

```powershell
cd frontend
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Local development may use permissive backend auth. Strict backend auth must be
verified before release checkpoints.

## Required beta checkpoint checks

Run these before a beta checkpoint commit:

```powershell
git status --short
cd frontend
npm run beta:readiness
npm run lint
npm run build
npm run smoke
cd ..\backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke
```

When network access to the npm registry is available, also run:

```powershell
cd frontend
npm run beta:audit
```

The audit command is intentionally separate from the offline demo path. It
passes with no moderate/high/critical npm advisories as of the 2026-07-09 beta
hardening checkpoint. A future blocked registry lookup is not proof of safety;
rerun it from a connected shell before broader beta exposure.

Firebase rule checks:

```powershell
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

## Live Firebase persistence QA

The live persistence gate is closed as of 2026-07-09. Re-run this QA whenever
the repository boundary, auth hydration, deletion, local cache ownership, or
Firestore rules change:

1. Sign in as Account A in one browser origin.
2. Create or hydrate profile, goal, plan, readiness, and recommendation state.
3. Open a second independent browser origin/session as Account A and verify the
   same user-scoped data hydrates.
4. Delete training data while signed in.
5. Reload and verify deleted training values do not reappear.
6. Sign into Account A from the second origin/session and verify deletion
   tombstones remain authoritative.
7. Sign into Account B and verify Account A data never appears in local cache or
   remote hydration.

Never weaken UID scoping, owner-only rules, deletion tombstones, or offline
fallback to make this pass.

## Observability QA

Kinetic observability is local/demo-safe only. It must remain:

- typed;
- capped;
- deterministic;
- sanitized;
- failure-isolated;
- free of raw notes, biometrics, workout/calendar text, tokens, email, UID, or
  unnecessary identity data.

Run `npm run smoke` and confirm `smoke-instrumentation.ts` passes before
shipping telemetry changes. Telemetry failures must never block training,
persistence, authentication, or AI fallback.

## Dependency posture

The current dependency posture is beta-checkpoint ready:

- connected frontend advisory audit passes, but should be rerun after package
  changes;
- direct frontend dependencies are exact-pinned in `package.json` and
  `package-lock.json`;
- direct backend requirements are exact-pinned in `backend/requirements.txt`.

Use `npm run beta:readiness` for the local posture report and
`npm run beta:audit` for the connected advisory gate.

## Protected local QA artifacts

These are local proof artifacts and must never be staged, deleted, or included
in product commits:

- `.edge-qa*`
- `tmp-onboarding-*.png`
