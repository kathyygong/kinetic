# Kinetic Mobile Mac Handoff

This is the completed execution record for the Phase 1 and Phase 2A
macOS/Xcode sessions. It began from the Windows preflight state and produced a
real iOS HealthKit/Firebase sync spike plus the native Today surface. The work
was integrated into `main` on 2026-07-20. Do not rerun this as an active
handoff unless a regression specifically requires it.

## Current Starting Point

Already complete on Windows:

- Mobile product phase and iOS MVP are defined in `MOBILE_COMPANION_PLAN.md`.
- Bounded readiness and `health_sync` schema are defined in
  `MOBILE_READINESS_SCHEMA.md`.
- Swift scaffold lives under `ios/KineticCompanion`.
- Shared TypeScript/Swift fixture lives at
  `ios/KineticCompanion/Tests/Fixtures/mobile-readiness-contract.json`.
- Firestore rules and emulator tests cover owner-only mobile readiness,
  `health_sync`, unknown-domain denial, and tombstones.
- Web hydration validates mobile-originated `readiness` and `health_sync`
  before updating dashboard state.
- `/mobile-companion` is a browser prototype only; it is not the production
  mobile surface.

## Historical Stop Line For Non-Mac Work — Closed

This was the stop line before Phase 1 native execution. All five gates are now
closed:

1. `swift test` in `ios/KineticCompanion`.
2. Xcode app target compiles with the scaffold files.
3. Firebase iOS SDK signs in to the same project/UID model as web.
4. HealthKit permission request runs on simulator/device where supported.
5. A bounded daily summary writes to Firestore and is readable by web.

Phase 2.5 subsequently started on Windows with the shared intake contract in
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md), then completed its
macOS/native and physical-device proof on 2026-07-20 without changing that
contract or its fixtures.

## Mac Prerequisites

- macOS with current Xcode.
- iOS simulator and, ideally, one physical iPhone for HealthKit behavior.
- Apple developer account/team selected in Xcode.
- Access to the Kinetic Firebase project.
- A disposable Firebase test user.
- A local clone with the latest commits from this branch.

Keep real secrets untracked:

- `GoogleService-Info.plist`
- Apple signing profiles/certificates
- local simulator/device logs containing account details

## First Commands

From the repo root:

```bash
git status --short
cd ios/KineticCompanion
swift test
```

Expected result:

- The shared fixture decodes.
- Native readiness conflict resolver matches TypeScript fixture outcomes.
- No Swift package tests are skipped because of missing fixture resources.

If `swift test` fails, fix that before creating or wiring the Xcode app target.

## Xcode Target Setup

1. Create or open an iOS app target named `KineticCompanion`.
2. Use SwiftUI lifecycle.
3. Set minimum iOS to 17 unless there is a specific reason to support older.
4. Add these scaffold files to the app target:
   - `App/KineticCompanionApp.swift`
   - `App/TodayView.swift`
   - `App/DesignTokens.swift`
   - `Core/MobileReadinessModels.swift`
   - `Core/MobileAuditModels.swift`
   - `Core/ReadinessConflictResolver.swift`
   - `Health/HealthKitReadinessStore.swift`
   - `Sync/FirestoreSyncClient.swift`
5. Add package dependencies:
   - `FirebaseCore`
   - `FirebaseAuth`
   - `FirebaseFirestore`
6. Add `GoogleService-Info.plist` to the app target only. Do not commit it.
7. Enable HealthKit capability.
8. Add `NSHealthShareUsageDescription`.
9. Do not add HealthKit write permission unless a later product decision
   explicitly requires it.

## Phase 1 Native Gates

Gate 1: Auth

- App launches without crashing.
- Firebase config initializes.
- Disposable test user can sign in.
- App obtains a Firebase ID token.
- UID matches the owner boundary used by web Firestore paths:
  `users/{uid}/kinetic/{domain}`.

Gate 2: HealthKit Permission

- Request read-only access only for:
  - sleep analysis;
  - HRV;
  - resting heart rate.
- Denied state renders.
- Partial state renders.
- Granted state renders.
- Unavailable state renders on unsupported simulator/device paths.
- User-facing copy distinguishes local reading from cloud sync.

Gate 3: Local Summarization

- Raw samples are read only locally.
- Daily output is bounded to existing readiness fields:
  - `date`;
  - `sleep_hours`;
  - `hrv`;
  - `resting_hr`;
  - `source`;
  - `updated_at`.
- No raw sample timestamps, device identifiers, notes, calendar text, email,
  UID, or tokens are included in Firestore payloads or telemetry.

Gate 4: Firestore Write

- `readiness` write uses the existing envelope:
  - `schemaVersion: 1`;
  - `payload`;
  - `deleted`;
  - `clientUpdatedAt`.
- `health_sync` write uses the bounded metadata contract.
- Manual and CSV entries are not overwritten by HealthKit.
- Stale HealthKit data does not overwrite fresher HealthKit data.
- Firestore write failures leave local Today usable.

Gate 5: Web Readback

- Sign into web as the same Firebase user.
- Hydrate the mobile-written `readiness` payload.
- Confirm dashboard/recovery readiness uses bounded mobile data.
- Confirm `health_sync` metadata remains inspectable and does not affect
  safety rules directly.
- Confirm delete/tombstone semantics still clear mobile summaries.

## Manual QA Matrix

Use a disposable user and record exact device/simulator, iOS version, and date.

| Case | Expected |
| --- | --- |
| Signed out launch | No protected data shown; sign-in required |
| Signed in, no HealthKit permission | Manual check-in fallback; no unsafe plan mutation |
| HealthKit denied | `health_sync.permission_state=denied`; no raw data written |
| HealthKit partial | Missing metrics marked missing/not permitted; confidence reduced |
| HealthKit granted | Bounded daily readiness summary written |
| Background delivery stale | Foreground open repairs or marks stale; no guessed readiness |
| Existing manual readiness same day | Manual entry wins; conflict recorded |
| Existing CSV readiness same day | CSV entry wins; conflict recorded |
| Fresher HealthKit same day | Only biometric fields merge; subjective fields not invented |
| Firestore offline | Local UI degrades; retryable sync state shown |
| Web readback | Web dashboard consumes mobile readiness safely |
| Delete training data from web | Mobile summaries tombstoned or cleared on next sync |

## Required Validation After Mac Spike

Run on Mac:

```bash
cd ios/KineticCompanion
swift test
```

Run from repo root, with Firebase emulator support available:

```bash
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

Run frontend gates:

```bash
cd frontend
npm run lint
npm run build
npm run smoke
```

If a dependency or schema changed, also run:

```bash
npm run beta:readiness
```

Run backend gates before beta-facing demos:

```powershell
cd backend
.\.venv\Scripts\python.exe -m compileall app evals
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals._smoke
```

## Demo Proof

A successful Phase 1 demo shows:

1. iOS sign-in.
2. HealthKit permission state.
3. Local daily summarization.
4. Firestore `readiness` and `health_sync` writes.
5. Web readback under the same user.
6. Deterministic conflict behavior.
7. Delete/tombstone behavior.
8. No raw HealthKit samples in Firestore or telemetry.

## Phase 1 Proof Record

Completed on July 16, 2026:

- Physical device: iPhone 17, iOS 26.5.2.
- Xcode: 26.3.
- Firebase email/password sign-in and ID-token verification succeeded with a
  disposable user.
- HealthKit requested read access only for sleep analysis, HRV, and resting
  heart rate. The device reported read access granted.
- The app produced a bounded local daily summary with date, sleep, HRV,
  resting heart rate, and confidence.
- A Firestore permission failure left the local summary usable and exposed a
  retryable cloud state.
- After deploying the checked-in Firestore rules, the same device retry wrote
  `readiness` and `health_sync` successfully.
- The same Firebase user signed into the web app, and `/recovery` hydrated and
  displayed the mobile-written sleep, HRV, and resting heart rate.
- Web deletion wrote tombstones. On the next physical-device sync attempt, the
  native app reported `Training data deleted`, wrote nothing back, and cleared
  its local summary.
- Shared fixtures and tests proved manual/CSV precedence, fresher HealthKit
  merging, stale HealthKit rejection, bounded contracts, and tombstones.

Validation completed:

```text
swift test: 10 passed
Xcode simulator build: passed
Xcode signed physical-device build and install: passed
Firestore rules emulator suite: passed
frontend lint: passed
frontend production build: passed
frontend smoke suite: passed
backend compileall: passed
```

The backend `_gates` and `_smoke` suites later passed in an isolated Python
3.12 environment during the Phase 2A device rerun.

## Phase 2A Native Today Proof Record

Implemented and locally validated on July 17, 2026:

- Swift Codable request, response, snapshot, cache, failure, and source-state
  models consume the canonical `mobile-today-contract.json` fixture.
- Native request construction matches the authoritative fixture, including
  reconstructed tempo duration, rolling HRV baseline, recent controlled
  workout labels, confirmed preference filtering, and adjustment bias.
- Firebase reads remain owner scoped and use the existing profile, goal, plan,
  readiness, `health_sync`, workouts, preferences, `calendar_sync`, and
  `calendar_failure` domains.
- `POST /decision` attaches the Firebase ID token, uses an eight-second
  deadline, validates deterministic bounds, accepts wrapped or legacy
  responses, and drops malformed optional AI copy.
- The reduced local cache is fresh for six hours, visibly stale only on the
  same local day, and expired after 24 hours or a day change.
- SwiftUI Today includes live, fresh/stale cache, missing-readiness,
  signed-out, offline, timeout, backend-unavailable, and invalid-response
  states.
- Native `mobile_decision_validated` events contain only bounded properties,
  write to a capped owner-only `mobile_audit` envelope, honor deletion
  tombstones, and are readable by `/qa/mobile`.

Local evidence:

```text
swift test: 21 passed
Xcode unsigned iOS Simulator build: passed
Xcode signed generic iOS device build: passed
iPhone 17 / iOS 26.3 simulator install and signed-out launch: passed
Xcode signed iPhone 17 / iOS 26.5.2 build, install, and launch: passed
Firestore Auth/rules emulator suite: passed
frontend lint: passed
frontend TypeScript no-emit check: passed
frontend deterministic smoke: passed
frontend production build: passed
backend compileall: passed
backend deterministic gates: passed
backend smoke: passed
```

The deterministic Swift suite covers fresh/stale/prior-day cache, explicit
zero-minute calendar conflict, planned-duration fallback, malformed response,
malformed optional AI, privacy rejection, and stable HTTP failure mapping.

Signed-device rerun completed on July 17, 2026:

- The physical iPhone 17 / iOS 26.5.2 connected through CoreDevice. A signed
  build installed and launched with the local-network usage description.
- The Mac backend listened only on its USB private-link address. The iPhone
  sent a Firebase bearer token, project-scoped strict verification accepted
  it, and `POST /decision` returned `200`.
- `/qa/mobile` read back a live, privacy-safe success with deterministic
  validation passed, ready readiness, fresh cache, and no identity or health
  values.
- A device-only zero-minute availability input produced
  `availability_source=calendar`, `calendar_state=conflict`,
  `selected_action=rest`, and another authenticated `200`.
- A timed-out request selected the fresh same-day cache and recorded
  `decision_source=cache`, `cache_state=fresh`, and `failure_state=timeout`.
- Prior-day cache rejection passed the deterministic Swift clock-controlled
  test. Physical device time was not changed.
- The same account recovered after web deletion only through the confirmed
  native `Reconnect Apple Health` action. Routine sync remained blocked by
  tombstones; the confirmed action created new readiness, `health_sync`, and
  empty privacy-safe `mobile_audit` epochs while leaving previously deleted
  data deleted.
- The checked-in owner-only Firestore rules were deployed to `kinetic-aca73`
  to enable the new `mobile_audit` domain; the emulator rules gate remains the
  repeatable policy proof.

Remaining blocker: none for the Phase 2A Native Today handoff. Fresh/stale and
prior-day cache timing remain deterministic automated gates. The separately
scoped Phase 2.5 mobile-intake milestone completed on 2026-07-20; check-ins,
notifications, and calendar ingestion remain later work.

## Do Not Add Yet

- Native plan editing.
- Native onboarding replacement.
- Push notifications.
- Apple Calendar ingestion.
- Garmin/Oura integrations.
- Coach sharing.
- Hosted AI changes.
- Autonomous AI plan mutation.
- Raw HealthKit cloud sync.

These remain deferred after the HealthKit/Firebase and Native Today proofs.
