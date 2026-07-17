# Kinetic iOS Companion

This directory contains the bounded Phase 1 HealthKit/Firebase proof and Phase
2A native Today surface described in `MOBILE_MAC_HANDOFF.md`. It is not a full
native companion app.

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
- Confirmed `Reconnect Apple Health` recovery that starts new bounded
  readiness, health-sync, and audit epochs without restoring deleted history.
- Exact Swift parity with `Tests/Fixtures/mobile-today-contract.json`.
- Owner-scoped Firestore reads for profile presence, goal, saved plan,
  readiness, HealthKit freshness, workout history, confirmed preferences, and
  calendar freshness.
- Authenticated, finite-deadline `POST /decision` networking with strict
  wrapped/legacy response validation.
- Six-hour fresh, same-day stale, 24-hour maximum decision cache behavior.
- SwiftUI live, cached, stale, missing-readiness, signed-out, offline, timeout,
  backend-unavailable, and invalid-response states.
- Capped privacy-safe native decision audit transport and `/qa/mobile`
  Firebase readback.

The app does not include plan editing, onboarding, notifications, calendar
ingestion, mobile intake/check-ins, AI mutation, or raw HealthKit cloud sync.

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

The decision client defaults to `http://127.0.0.1:8000`. Override it for a
physical device with the launch argument pair:

```text
-kinetic.api-base-url
http://<mac-lan-address>:8000
```

The debug build declares local-network usage for a Mac development backend.
Allow the iOS Local Network prompt during signed-device QA. A USB private-link
address may be used when Wi-Fi client isolation prevents LAN access.

For bounded calendar-conflict QA without event text, add an integer from `0`
through `240` to the scheme environment:

```text
KINETIC_QA_AVAILABLE_MINUTES=0
```

For `devicectl`, place the environment option before the bundle identifier and
the backend launch argument after `--`:

```bash
xcrun devicectl device process launch \
  --device <device-id> \
  --terminate-existing \
  --environment-variables '{"KINETIC_QA_AVAILABLE_MINUTES":"0"}' \
  com.kinetic.companion -- \
  -kinetic.api-base-url http://<mac-private-link-address>:8000
```

This is a QA-only local availability input. Production continues to use the
bounded local calendar cache and explicit planned-duration fallback.

For local strict-auth backend QA without a service-account file, set the exact
Firebase project ID together with `KINETIC_AUTH_REQUIRED=true`. This mode
verifies public-key signature, audience, issuer, expiry, and subject and has no
Firebase Admin capability. Credential-backed Admin verification takes
precedence when a real credential file is present.

The bundle identifier is `com.kinetic.companion`, matching the checked-in plist
shape example. No HealthKit write usage description or write authorization is
configured.

## Validation

Run the package contract gate before changing the Xcode target:

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

The Swift suite covers canonical request/snapshot/cache parity, missing
context, explicit zero availability, stale/prior-day cache behavior, privacy
rejection, malformed optional AI, and stable HTTP failure mapping.

Device auth, HealthKit interaction, authenticated decisions, Firestore audit
write/readback, and web readback require the untracked Firebase configuration,
a disposable user, a reachable backend URL, and an Apple signing team as
listed in `MOBILE_MAC_HANDOFF.md`.
