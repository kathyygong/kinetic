# Kinetic iOS Companion Spike

This directory is the first native iOS spike for Kinetic. It is intentionally
thin: the web app remains the production demo/admin/proof surface, while this
scaffold proves the mobile-only loop around HealthKit readiness,
calendar-aware Today decisions, bounded intake review, Firebase sync, and
check-in.

## What This Is

- SwiftUI source for the Today surface.
- Codable models that match `MOBILE_READINESS_SCHEMA.md`.
- A deterministic conflict resolver for same-day readiness writes.
- Boundary stubs for HealthKit summarization and Firestore sync.
- Product placeholders for calendar freshness, review-only NLP intake, and web
  QA/eval observability.
- Setup notes for creating the Xcode app target on macOS.

## What This Is Not

- A complete App Store-ready app.
- A full native replacement for the web dashboard.
- A second training engine.
- A duplicate admin, QA, or eval dashboard.
- A place to upload raw HealthKit samples.

## Expected Xcode Setup

On macOS with Xcode:

1. Create a new iOS App project named `KineticCompanion`.
2. Use SwiftUI lifecycle and iOS 17 or newer.
3. Add the Swift files under this directory to the app target.
4. Add Firebase iOS SDK packages:
   - `FirebaseAuth`
   - `FirebaseFirestore`
   - `FirebaseCore`
5. Add HealthKit capability.
6. Add `GoogleService-Info.plist` to the app target. Keep the real file
   untracked; use `Config/GoogleService-Info.plist.example` as the shape
   reference only.
7. Add HealthKit usage strings to `Info.plist`:
   - `NSHealthShareUsageDescription`
   - `NSHealthUpdateUsageDescription` if writes are ever introduced. The spike
     should not request writes.

## Spike Acceptance

- HealthKit denied, partial, granted, stale, and unavailable states render.
- The app summarizes locally before writing Firestore.
- `readiness` receives bounded daily entries only.
- `health_sync` receives permission/freshness/coverage metadata only.
- Manual and CSV entries are not overwritten by HealthKit.
- Calendar-aware Today decisions consume existing availability/freshness and
  never invent schedule availability.
- Natural-language updates remain review-only until deterministic validation.
- Mobile-originated decisions and validation outcomes are auditable from the
  web admin/QA/eval surfaces.
- No raw HealthKit samples are persisted.

## Source Map

- `App/KineticCompanionApp.swift`: SwiftUI app entry.
- `App/TodayView.swift`: mobile-first Today UI.
- `App/DesignTokens.swift`: small visual constants.
- `Core/MobileReadinessModels.swift`: schema-aligned Codable models.
- `Core/MobileAuditModels.swift`: web-QA-compatible mobile audit event models.
- `Core/ReadinessConflictResolver.swift`: deterministic merge rules.
- `Health/HealthKitReadinessStore.swift`: HealthKit permission and summary
  boundary.
- `Sync/FirestoreSyncClient.swift`: Firebase envelope writes and transactions.
- `Tests/ReadinessConflictResolverTests.swift`: unit-test sketch for conflict
  rules.
- `Tests/MobileAuditModelsTests.swift`: unit-test sketch for audit event names,
  snake-case keys, and privacy boundaries.
- `Package.swift`: Swift Package for the core/sync model layer. The SwiftUI
  app files are meant to be added to an Xcode iOS app target.

## Verification Notes

This scaffold was created on Windows, so native compilation must happen later
on macOS/Xcode. `Tests/Fixtures/mobile-readiness-contract.json` is the shared
wire-contract fixture used by both the frontend smoke suite and Swift tests.
Keep web validation green while the native spike evolves:

```powershell
cd frontend
npm run lint
npm run build
npm run smoke
```

The Windows Firebase proof can be rerun from the repository root:

```powershell
npx firebase-tools emulators:exec --only auth,firestore "cd frontend && npm run test:firestore-rules"
```

Use the browser prototype at `/mobile-companion` to compare UI intent while
building the SwiftUI surface.

On macOS, the core package should be testable with:

```bash
cd ios/KineticCompanion
swift test
```

Run `swift test` before creating the Xcode app target. This verifies that the
native decoder and readiness conflict resolver still match the exact fixtures
already exercised on Windows.
