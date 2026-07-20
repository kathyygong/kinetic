# Kinetic Beta Runbook

This runbook is the operational handoff for the beta-ready foundation. It keeps
the demo/free-tier path working while making release checks, rollback, and
triage explicit.

## Current phase

Kinetic is past the demo release gate, live Firebase persistence gate,
dependency posture gate, privacy-bounded telemetry QA gate, and final runbook
review. The current foundation is beta-ready for a small controlled audience,
not a broad production launch.

The web beta includes Apple Health CSV import as a bounded readiness-input
bridge. Mobile Companion Phase 1 completed on 2026-07-16: a physical iPhone
proved Firebase sign-in, read-only HealthKit summarization, bounded Firestore
sync, same-user web readback, retry behavior, and deletion tombstones. The
shared authenticated contract for calendar-aware Native Today completed on
Windows on 2026-07-16, and its SwiftUI/signed-device implementation completed
on 2026-07-17. That work was integrated into `main` on 2026-07-20. The active
milestone is Phase 2.5 bounded mobile natural-language intake, followed by the
recovery/check-in loop. Do not expand into a full native app,
Garmin/Oura ingestion, hosted AI, broad push notifications, coach sharing, or
autonomous AI plan mutation without another explicit product decision.

The mobile phase plan lives in
[MOBILE_COMPANION_PLAN.md](./MOBILE_COMPANION_PLAN.md). The completed native
execution record lives in [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md), and
the stable Today request/cache/failure boundary lives in
[MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md). The active Windows-first
Phase 2.5 scope and future Mac handoff are in
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md).

## Environment posture

| Environment | Auth posture | AI posture | Persistence posture |
| --- | --- | --- | --- |
| Local demo | permissive backend auth is allowed | `fallback` or optional `local_ollama` | local-first with Firebase mirror when signed in |
| Strict local QA | `KINETIC_AUTH_REQUIRED=true` | usually `fallback` for deterministic proof | Firebase ID token required for protected backend calls |
| Hosted beta | `KINETIC_AUTH_REQUIRED=true` | `fallback` unless local/hosted AI is explicitly selected | Cloud Firestore with owner-only rules |

Hosted beta should keep `KINETIC_AI_MODE=fallback` unless a live AI runtime is
being intentionally demonstrated. Fallback mode is a product-supported mode, not
an outage state.

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

## Hosted beta preflight

Before sending a hosted beta link:

1. Confirm `KINETIC_AUTH_REQUIRED=true` on the backend.
2. Confirm `KINETIC_CORS_ORIGINS` contains only the intended frontend origins.
3. Confirm Firebase Auth authorized domains include the frontend domain.
4. Confirm Cloud Firestore rules are deployed from `firestore.rules`.
5. Confirm `NEXT_PUBLIC_API_BASE_URL` points at the intended backend.
6. Confirm `NEXT_PUBLIC_ENABLE_DEMO_TOOLS` is unset or `false` for hosted beta.
7. Confirm `/health` returns `{"status":"ok"}` on the backend.
8. Sign in from the hosted frontend and verify `/decision` returns 200.
9. Run the live persistence QA again if repository, auth, rules, or deletion
   behavior changed after the last proof.

## Mobile companion preflight

Before inviting mobile beta users:

1. Confirm the Phase 1 physical-device proof remains recorded in
   [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md); rerun it after changes to
   native auth, HealthKit, Firestore sync, or deletion behavior.
2. Confirm the iOS app uses the same Firebase project and UID ownership model.
3. Confirm HealthKit permission copy names the specific read types and explains
   that raw samples stay on device.
4. Confirm Firestore contains bounded daily readiness summaries only, not raw
   HealthKit samples. Use
   [MOBILE_READINESS_SCHEMA.md](./MOBILE_READINESS_SCHEMA.md) as the contract.
5. Confirm the web dashboard can consume mobile readiness summaries and still
   shows freshness/confidence accurately.
6. Confirm mobile Today consumes existing calendar availability/freshness and
   lowers confidence when calendar data is stale, missing, or unavailable.
   Validate against [MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md) and
   its shared JSON fixture; explicit zero-minute windows must remain zero and a
   missing calendar must use the labeled planned-workout fallback.
7. Confirm bounded mobile natural-language intake routes every supported note
   to a concrete flow: reviewable draft, guided check-in, read-only
   explanation, clarifying prompt, or safe refusal/routing.
8. Confirm recovery and pain language opens explicit perceived-recovery or
   caution capture. AI must not fabricate readiness, biometric, pain, or injury
   values from free text.
9. Confirm schedule/availability/travel/goal/preference NLP uses review-only
   drafts, rejects anonymous requests under strict auth, and cannot apply
   without deterministic validation.
10. Confirm behavior patterns have bounded outcomes: confirmed schedule-style
   patterns can update preferred-day inputs for deterministic plan generation;
   scoring patterns remain capped nudges; stale-data patterns prompt sync or
   check-in; pain patterns route to caution only.
11. Confirm existing web admin/QA/eval review surfaces can inspect
   mobile-originated decisions, intake drafts, validation outcomes, check-ins,
   and privacy-safe telemetry. Use `/qa/mobile` for the local web audit view.
12. Confirm denied, partial, stale, offline, signed-out, and delete-pending
   states have visible fallbacks.
13. Confirm owner-only Firestore rules and emulator tests cover any new mobile
   sync domain.
14. Confirm delete/disconnect stops future mobile sync and respects tombstones
   across web and iOS.
15. Confirm existing deterministic backend gates still pass after any mobile
   schema or decision-input changes.

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
shipping telemetry changes. The smoke covers every typed event family,
sensitive-key rejection, bounded values, log capping, and localStorage
write/remove failure isolation. Telemetry failures must never block training,
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

## Rollback and triage

If a hosted beta issue appears:

1. Preserve the deterministic safety core first: do not loosen auth, Firestore
   rules, UID scoping, tombstones, or AI validation to make a demo pass.
2. Check whether the problem is frontend-only, backend-only, Firebase auth,
   Firestore rules, or external availability.
3. If training recommendations fail, switch or keep the backend in
   `KINETIC_AI_MODE=fallback`; AI failures should not block deterministic
   recommendations.
4. If persistence fails, keep local-first behavior available and surface the
   retryable error. Do not silently clear signed-in local state unless remote
   deletion tombstones are confirmed.
5. Roll back to the last green commit/deploy in Vercel or Render if the issue
   affects auth, persistence, or the primary training flow.
6. After rollback, rerun the checkpoint checks and update `EVAL_REPORT.md` or
   `QA_MATRIX.md` if the release proof changed.

## Protected local QA artifacts

These are local proof artifacts and must never be staged, deleted, or included
in product commits:

- `.edge-qa*`
- `tmp-onboarding-*.png`
