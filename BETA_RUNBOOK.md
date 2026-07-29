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
bridge. Initial Mobile Phase 1 completed on 2026-07-16: a physical iPhone
proved Firebase sign-in, read-only HealthKit summarization, bounded Firestore
sync, same-user web readback, retry behavior, and deletion tombstones. The
shared authenticated contract for calendar-aware Native Today completed on
Windows on 2026-07-16, and its SwiftUI/signed-device implementation completed
on 2026-07-17. That work was integrated into `main` on 2026-07-20. Phase 2.5
shared and native implementation plus repeatable Mac gates completed on
2026-07-20; signed physical-device intake, deterministic confirmation and
rejection, native audit readback, and Phase 1/2A regressions also passed that
day. The complete Phase 2.5 tree then passed the Windows dependency,
frontend, backend, and Firebase rerun and was fast-forwarded into `main`.
Phase 3 Part A and the native Part B recovery/check-in implementation completed
on the feature branch on 2026-07-20; physical-device recovery and
completed/skipped workout interaction plus live same-user Recovery,
training-review, memory, and audit readback passed 2026-07-21. The branch
was fast-forwarded into `main` on 2026-07-23 after the July dependency blocker
and hosted Windows integration gate were cleared. The 2026-07-29 product
rebaseline authorizes a user-ready native app through onboarding/settings,
bounded plan ownership, Apple Calendar, progress, and external-beta hardening.
Garmin/Oura, hosted AI, broad push notifications, coach sharing, full two-way
Calendar sync, open-ended chat, and autonomous AI plan mutation remain outside
that authorization.

Mobile Phase 3.5 Part B reached its Mac/physical-device checkpoint on
2026-07-24: 52 Swift tests, simulator and signed-device builds, strict
scoring/preferred-day/prompt/caution interaction, same-user web readback, and
privacy-safe `/qa/mobile` readback passed. Phase 3.5 is functionally complete.
Authenticated pattern-card VoiceOver/landscape/small-screen remains explicitly
unverified and was deferred on 2026-07-29 to Mobile Phase 5. It
remains required before external beta.
Final shared Windows/hosted integration and the owner-only emulator suite
passed in run
[30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955).

The mobile phase plan lives in
[MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md). The completed native
execution record lives in [MOBILE_MAC_HANDOFF.md](./MOBILE_MAC_HANDOFF.md), and
the stable Today request/cache/failure boundary lives in
[MOBILE_TODAY_CONTRACT.md](./MOBILE_TODAY_CONTRACT.md). The fixed Phase 2.5
scope and native evidence are in
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md). The fixed Phase 3
boundary and current evidence are in
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md).

The initial proof is not the user-ready mobile gate. Mobile Phases 5–8 must
add permanent navigation/onboarding/settings, native plan ownership, Apple
Calendar and progress, then close production, accessibility/device,
offline/sync/migration, privacy, TestFlight, support, and install-to-deletion
external-beta evidence. See
[MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md).

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
.\.venv\Scripts\python.exe -m evals.generate_report --check
.\.venv\Scripts\python.exe -m evals._smoke
```

When network access to the npm registry is available, also run:

```powershell
cd frontend
npm run beta:audit
```

The audit command is intentionally separate from the offline demo path. It
passed with no moderate/high/critical npm advisories at the 2026-07-20
dependency-hardening checkpoint. Newly published July 2026 advisories changed
that result. On 2026-07-22 the affected `brace-expansion` and `sharp` ranges
were constrained to patched versions, reducing the connected audit from three
high findings to one. On 2026-07-23 Next.js and `eslint-config-next` were
upgraded together to `16.2.11`; the connected audit then passed with 0
failures, 0 warnings, and 14 checks.

The current lockfile passes `npm ci` on the Mac and in
[GitHub-hosted Windows integration](https://github.com/kathyygong/kinetic/actions/runs/30012524615).
It retains the Next-only PostCSS `8.5.22` override, pins legacy
`brace-expansion` at `1.1.16` and `sharp` at `0.35.0`, and resolves modern
`brace-expansion` consumers independently while awaiting a compatible patched
graph. The managed local Windows
proxy can still return `E404` for the new Next.js tarball; use the checked-in
`.github/workflows/windows-integration.yml` gate rather than treating that
workstation feed limitation as evidence against the lockfile.

On 2026-07-29, GHSA-r28c-9q8g-f849 made the prior PostCSS override vulnerable;
the override was moved to patched `8.5.22`. The same registry window added
GHSA-mh99-v99m-4gvg to the transitive ESLint/minimatch/brace-expansion
development-tool graph. GitHub lists `brace-expansion` `5.0.8` as patched, but
the npm registry did not yet expose a compatible patched path for the current
ESLint graph. The audit gate therefore permits only that exact advisory and
exact 15-package dev-tool graph until 2026-08-15. It emits a warning and still
fails for any other advisory, direct runtime dependency, package-set change,
or expiry. Remove the exception as soon as a compatible patched graph is
published; do not extend it without a new documented security review.

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

## Mobile app preflight

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
   explanation, clarifying prompt, or safe refusal/routing. Use
   [MOBILE_INTAKE_CONTRACT.md](./MOBILE_INTAKE_CONTRACT.md) and its canonical
   cross-platform fixture.
8. Confirm recovery and pain language opens explicit perceived-recovery or
   caution capture. AI must not fabricate readiness, biometric, pain, or injury
   values from free text.
9. Confirm schedule/availability/travel/workout-swap/goal/preferred-day NLP
   uses review-only drafts, rejects anonymous requests under strict auth, and
   cannot apply without explicit confirmation and deterministic validation.
   Verify timeout, unavailable AI, malformed AI/response, ambiguous,
   unsupported, and unsafe inputs stop or fall back without mutation.
10. Confirm behavior patterns have bounded outcomes: confirmed schedule-style
   patterns can update preferred-day inputs for deterministic plan generation;
   scoring patterns remain capped nudges; stale-data patterns prompt sync or
   check-in; pain patterns route to caution only. Validate
   `behavior-pattern-result.v1` against
   [MOBILE_PATTERN_RESULT_CONTRACT.md](./MOBILE_PATTERN_RESULT_CONTRACT.md) and
   its canonical cross-platform fixture.
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

Phase 2.5 Part A and Part B passed the repeatable contract, physical-device,
strict-auth backend, dependency, and Firestore gates on 2026-07-20. The iPhone
17 / iOS 26.5.2 physical matrix passed install, authenticated route interaction,
confirmed availability mutation, unsafe/ungrounded swap rejection, bounded
`/qa/mobile` readback, Today/cache, HealthKit, reconnect, and tombstone checks.

Phase 3 Parts A and B now implement the fixed `mobile-checkin.v1` boundary on
the feature branch. Recovery writes merge only explicit bounded subjective
fields into `readiness`; workout outcomes update existing `workouts` and
`recommendations` atomically. The canonical fixture, 47-test Swift suite,
simulator install/launch, signed physical-device build, strict backend,
owner-only emulator, and shared frontend regressions pass. Physical-device
recovery/completed/skipped interaction and live Recovery, training-review,
behavior-memory, and `/qa/mobile` readback passed 2026-07-21. No free text,
inferred readiness, raw
HealthKit sample, pain severity, injury, or medical field may cross this
boundary. Use [MOBILE_CHECKIN_CONTRACT.md](./MOBILE_CHECKIN_CONTRACT.md) and
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md) for the exact proof and
the completed patched-Active-LTS Next.js hosted Windows proof. The managed
Windows workstation proxy may still lack that tarball, but it is no longer a
repository or hosted-integration blocker.

Mobile Phase 3.5 Part A adds the strict shared Behavior Pattern Result
Contract, deterministic schedule confirmation through the existing intake
planner, bounded scoring confirmation, prompt/caution-only non-mutation
routes, and privacy-safe `/qa/mobile` readback. Use
[MOBILE_PATTERN_RESULT_HANDOFF.md](./MOBILE_PATTERN_RESULT_HANDOFF.md) for the
Windows evidence and the native Part B execution record. The deferred
authenticated VoiceOver/landscape/small-screen checks are now an entry gate
for Mobile Phase 5 and remain a pre-external-beta requirement; see
[MOBILE_NOTIFICATION_CONTRACT.md](./MOBILE_NOTIFICATION_CONTRACT.md).
Final hosted Windows/owner-only integration passed in run
[30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955);
Swift suite/app compile, simulator/device routes, same-user preference/
web-schedule readback, and privacy-safe audit readback also passed on
2026-07-24.

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

For `mobile_intake_lifecycle`, also verify that `/qa/mobile` contains only
action, outcome, route, draft kind, failure, parser, mutation, validation,
platform, and bounded latency fields. It must not contain the note, grounding
text, generated prose, recovery/pain/completion values, or medical data.

For `mobile_checkin_synced`, verify that `/qa/mobile` contains only platform,
check-in kind, status, outcome, failure, write scope, deterministic-validation
state, effort/reflection presence, update success, and bounded latency. It
must not contain captured values, notes, prose, identity, tokens, biometrics,
HealthKit samples, pain/injury, or medical data.

Run `npm run smoke` and confirm `smoke-instrumentation.ts` passes before
shipping telemetry changes. The smoke covers every typed event family,
sensitive-key rejection, bounded values, log capping, and localStorage
write/remove failure isolation. Telemetry failures must never block training,
persistence, authentication, or AI fallback.

## Dependency posture

The dependency posture passed the 2026-07-23 beta checkpoint and was
re-triaged on 2026-07-29:

- the connected frontend advisory audit has no untriaged moderate, high, or
  critical findings; its only warning is the exact, expiring
  GHSA-mh99-v99m-4gvg ESLint dev-tool exception described above;
- direct frontend dependencies are exact-pinned in `package.json` and
  `package-lock.json`;
- Next.js and `eslint-config-next` are aligned at patched Active LTS
  `16.2.11`;
- legacy `brace-expansion` is pinned at `1.1.16`, `sharp` at `0.35.0`, and a
  Next-only override retains patched PostCSS `8.5.22`;
- direct backend requirements are exact-pinned in `backend/requirements.txt`.

Use `npm run beta:readiness` for the local posture report and
`npm run beta:audit` for the connected advisory gate.

The `16.2.11` checkpoint passed `npm ci`, the connected audit, lint,
TypeScript, smoke, production build, beta readiness, backend compile, backend
gates, backend smoke, and the Auth/Firestore emulator suite on the
GitHub-hosted Windows runner on 2026-07-23.
Remove the PostCSS override only after Next itself depends on PostCSS `8.5.18`
or newer and the same gates pass without the override.

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
