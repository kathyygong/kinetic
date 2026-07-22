# Kinetic iOS Companion

This directory contains the bounded Phase 1 HealthKit/Firebase proof, Phase 2A
native Today surface, Phase 2.5 bounded intake implementation, and Phase 3
check-in implementation described in the mobile handoff documents. It is not a
full native companion app.

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
- Exact Swift parity with `Tests/Fixtures/mobile-intake-contract.json` for all
  eight routes and all six review-draft kinds.
- Strict bounded intake request/response/privacy validation plus authenticated
  finite-deadline `POST /ai/parse-intake` networking.
- Native Today entry point and concrete review, recovery, caution,
  missed-workout, reflection, explanation, clarification, and refusal
  destinations.
- Explicit deterministic confirmation through the existing owner-scoped
  goal/profile/plan envelopes, including workout-swap race-day, unique-day,
  load, and hard-spacing protections.
- Fixed privacy-safe native intake audit transport.
- Exact Swift parity with `Tests/Fixtures/mobile-checkin-contract.json` for all
  recovery/workout successes and fixed failures.
- Explicit review-before-save recovery and completed/skipped workout controls.
- Owner-scoped transactional recovery merge or atomic workout/recommendation
  persistence with tombstone, conflict, retry, and idempotency protection.
- Fixed privacy-safe native check-in audit transport.

The app does not include general plan editing, onboarding, notifications,
calendar ingestion, general chat, AI mutation, or raw HealthKit cloud sync. The
fixed Phase 3 boundary and completed physical-device/live evidence are in
[`MOBILE_CHECKIN_HANDOFF.md`](../../MOBILE_CHECKIN_HANDOFF.md).

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

The 47-test Swift suite covers readiness/Today/intake/check-in canonical
fixtures, every intake route and draft kind, bounded request construction,
strict response/privacy rejection, authenticated networking, stable failure
mapping, confirmation grounding, availability/preferred-day transforms,
workout-swap invariants, HealthKit-preserving recovery merge, atomic workout
results, and idempotent check-in retries.

Device auth, HealthKit interaction, authenticated decisions, Firestore audit
write/readback, and web readback require the untracked Firebase configuration,
a disposable user, a reachable backend URL, and an Apple signing team as
listed in `MOBILE_MAC_HANDOFF.md`.
