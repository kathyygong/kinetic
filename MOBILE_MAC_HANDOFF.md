# Kinetic Mobile Mac Handoff

This is the execution checklist for the first macOS/Xcode session. It starts
from the Windows preflight state and turns it into a real iOS HealthKit/Firebase
sync spike. Do not use this checklist to broaden scope into a full native app.

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

## Stop Line For Non-Mac Work

The next meaningful product risk is native execution. Before adding more
Windows-only mobile behavior, run these Mac gates:

1. `swift test` in `ios/KineticCompanion`.
2. Xcode app target compiles with the scaffold files.
3. Firebase iOS SDK signs in to the same project/UID model as web.
4. HealthKit permission request runs on simulator/device where supported.
5. A bounded daily summary writes to Firestore and is readable by web.

Without those gates, additional Windows-only mobile features risk becoming
parallel product fiction instead of implementation proof.

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

These are deferred until the HealthKit/Firebase sync spike proves the core
mobile loop.
