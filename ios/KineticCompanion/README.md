# Kinetic iOS Companion Phase 1 Spike

This directory contains the bounded native HealthKit/Firebase spike described
in `MOBILE_MAC_HANDOFF.md`. It is not a full native companion app.

## Implemented Gates

- Firebase email/password sign-in and ID-token verification.
- Read-only HealthKit access for sleep analysis, HRV, and resting heart rate.
- Local-day summarization with schema bounds and partial coverage handling.
- Transactional `readiness` and `health_sync` Firestore writes under the
  authenticated Firebase UID.
- Manual/CSV precedence, stale HealthKit rejection, and tombstone protection.
- A local summary that remains visible when Firestore fails.
- Same-user web readiness hydration, including mobile-only account routing to
  the Recovery readback surface.
- Authoritative web tombstones that clear the native local summary and prevent
  HealthKit data from being recreated on the next sync attempt.

The spike does not include plan editing, onboarding, notifications, calendar
ingestion, AI coaching, or raw HealthKit cloud sync.

## Firebase Scope Decisions

- Firebase is installed with Swift Package Manager. The app target links
  `FirebaseCore`, `FirebaseAuth`, and `FirebaseFirestore`.
- Firebase startup initialization is handled directly in
  `KineticCompanionApp.init()`. It loads the bundled
  `GoogleService-Info.plist` and calls `FirebaseApp.configure(options:)` before
  any authentication or Firestore work begins, so a separate app delegate is
  not required for this Phase 1 target.
- Firebase Analytics is intentionally excluded from Phase 1. It is not needed
  for the authentication, token, Firestore, or HealthKit proof gates. Revisit
  it only after defining an analytics event contract, consent expectations,
  retention, and a rule prohibiting health values or other sensitive details
  in analytics events.

## Local Configuration

1. Open `KineticCompanion.xcodeproj`.
2. Add the Firebase iOS app configuration as
   `Config/GoogleService-Info.plist`, select the `KineticCompanion` target, and
   keep the real file untracked.
3. Select an Apple development team and run on an iPhone or supported
   simulator.

The bundle identifier is `com.kinetic.companion`, matching the checked-in plist
shape example. No HealthKit write usage description or write authorization is
configured.

## Validation

Run the package contract gate before generating or changing the Xcode target:

```bash
cd ios/KineticCompanion
swift test
```

Compile the unsigned simulator target with:

```bash
xcodebuild \
  -project KineticCompanion.xcodeproj \
  -scheme KineticCompanion \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Device auth, HealthKit permission interaction, Firestore writes, and web
readback require the untracked Firebase configuration, a disposable user, and
an Apple signing team as listed in `MOBILE_MAC_HANDOFF.md`.
