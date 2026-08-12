# Kinetic iOS App

This directory contains Kinetic's primary native product. Its initial
implementation established the bounded Phase 1 HealthKit/Firebase proof, Phase
2A native Today surface, Phase 2.5 bounded intake, Phase 3 check-in, and Phase
3.5 behavior-pattern results. Mobile Phases 5–8 now extend this same app
through permanent navigation/onboarding/settings, bounded plan ownership,
Apple Calendar/progress, and user-ready external-beta hardening.

The Phase 5 app target, product, and shared scheme are now named `Kinetic`.
The registered `com.kinetic.companion` bundle identifier and the existing
directory/project/source-module names remain deliberately stable so Firebase,
signing, HealthKit entitlements, package imports, and cross-platform fixture
paths continue to work.

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
- Strict `behavior-pattern-result.v1` Swift fixture parsing, authenticated
  finite-deadline networking, and sanitized shared recommendation-history
  requests.
- Native pattern cards for scoring review, web-routed preferred-day review,
  existing readiness/check-in prompts, and fixed discomfort caution.
- Transactional owner-scoped scoring-preference confirmation with idempotent
  retry and privacy-safe native pattern lifecycle audit.
- Strict `mobile-foundation.v1` Swift fixture parity, paired owner-scoped
  settings/onboarding persistence, copy-then-validate proof-state migration,
  and bounded foundation lifecycle audit.
- Firebase account creation, verification-email request, password recovery,
  sign-in/session restoration/sign-out, permanent Today/Plan/Progress/Settings
  navigation, native onboarding, progressive permission education, privacy/
  support/data controls, and the opt-in local evening reminder.
- Strict `mobile-plan-generation.v1` and `mobile-plan-lifecycle.v1` Swift
  parity, authenticated shared initial/future generation, bounded native edit
  proposals from saved goal/profile inputs, independent backend validation,
  explicit preview/confirm UI for all eleven lifecycle actions, and atomic
  owner-scoped plan/history/operation persistence with conflict and replay
  protection.
- The copied Swift mileage/pace/taper/scheduling generator and display-only
  phase heuristic have been removed. Production Swift consumes strict v2
  generation/lifecycle responses, persists and restores version-bound shared
  metadata, commits planning inputs and plan together, maps bounded weekly
  availability, and coordinates retry-safe account cleanup/finalization.
- Onboarding captures optional personal records, persists an incomplete draft,
  and requires shared plan review/confirmation before completion. Settings can
  prepare a full owner-scoped training-data export separately from the bounded
  foundation receipt.
- Preferred-day behavior patterns now open the native plan review/validator
  path instead of a web profile handoff.

The current app includes the Phase 6 bounded plan-ownership implementation and
the shared v2 closeout adapters. It still requires authenticated interaction,
live readback, accessibility/layout, and signed physical-device closeout proof.
It does not include real
Apple Calendar ingestion or the Phase 7 progress implementation; Progress is
an honest placeholder. General chat,
autonomous AI mutation, raw HealthKit cloud sync, full two-way Calendar sync,
Garmin/Oura, coach/social features, and broad push notifications remain out of
scope. Phase 4 Windows/shared work defines only an opt-in local evening
check-in reminder; native delivery belongs in permanent Phase 5 Settings. The
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
   `Config/GoogleService-Info.plist`, select the `Kinetic` target, and
   keep the real file untracked.
3. Select an Apple development team and run on an iPhone or supported
   simulator.

The decision client defaults to `http://127.0.0.1:8000`. Override it for a
physical device with the launch argument pair:

```text
-kinetic.api-base-url
http://<mac-lan-address>:8000
```

The Phase 3.5 preferred-day handoff defaults to
`http://127.0.0.1:3000/profile`. Point a physical/beta build at the reachable
web profile surface with:

```text
-kinetic.web-profile-url
https://<reachable-web-host>/profile
```

Hide the native behavior-pattern entry point without changing the contract or
stored state by setting:

```text
-kinetic.behavior-patterns-enabled
NO
```

Equivalent build-time plist keys are `KINETIC_WEB_PROFILE_URL` and
`KINETIC_BEHAVIOR_PATTERNS_ENABLED`.

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
  -scheme Kinetic \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

For Phase 3.5 Part B, run the focused behavior tests before the complete
52-test suite:

```bash
swift test --filter BehaviorPatternContractFixtureTests
swift test --filter MobileAuditModelsTests
swift test
```

The Phase 5 focused gate is `swift test --filter
MobileFoundationContractFixtureTests`. The Phase 6 focused gate is `swift test
--filter MobilePlanLifecycleContractFixtureTests`; the complete suite currently
contains 67 tests. The authoritative signed-build, simulator/device route, same-user web
readback, audit privacy, accessibility, rollback-control, and evidence
checklist is
[`MOBILE_PATTERN_RESULT_HANDOFF.md`](../../MOBILE_PATTERN_RESULT_HANDOFF.md).

The expanded Swift suite covers readiness/Today/intake/check-in/behavior canonical
fixtures, every intake route and draft kind, bounded request construction,
strict response/privacy rejection, authenticated networking, stable failure
mapping, confirmation grounding, availability/preferred-day transforms,
workout-swap invariants, HealthKit-preserving recovery merge, atomic workout
results, idempotent check-in retries, strict pattern route validation,
free-text request stripping, authenticated behavior networking, and
pattern-audit privacy. The Phase 3.5 Mac execution passed on
2026-07-24 at verified-fix commit `b61c4b5`: 4 focused behavior tests, 5
focused audit tests, all 52 package tests, clean unsigned simulator build and
launch, signed generic-device build, and rebuilt physical iPhone install and
launch. Physical scoring, preferred-day, readiness-prompt, and caution routes,
same-user web preference/schedule state, and privacy-safe `/qa/mobile`
readback passed. Maximum simulator Dynamic Type plus increased contrast also
rendered without clipping. Phase 3.5 is functionally complete; authenticated
pattern-card VoiceOver order, landscape, and small-screen remain explicitly
unverified and must run at the start of the next native-iOS-UI phase and before
external beta. That next UI phase is Mobile Phase 5: native foundation,
onboarding, and Settings. The notification boundary is governed by
[`MOBILE_NOTIFICATION_CONTRACT.md`](../../MOBILE_NOTIFICATION_CONTRACT.md).
The Phase 5 implementation checkpoint is `bfbaaef`; Phase 6 implementation and
the combined deferred closeout gates are tracked in
[`MOBILE_PHASE5_6_HANDOFF.md`](../../MOBILE_PHASE5_6_HANDOFF.md).
Final shared Windows/hosted
integration and the owner-only emulator suite passed in run
[30105302955](https://github.com/kathyygong/kinetic/actions/runs/30105302955).

Device auth, HealthKit interaction, authenticated decisions, Firestore audit
write/readback, and web readback require the untracked Firebase configuration,
a disposable user, a reachable backend URL, and an Apple signing team as
listed in `MOBILE_MAC_HANDOFF.md`.
