# Mobile Phases 5–6 Cross-Platform Closeout

Windows Batch A completed on branch `codex/mobile-phase5-6-contracts`.
The hardened Windows baseline is `c9e375a`; hosted integration, including the
connected dependency audit and expanded owner/cross-user/anonymous Firebase
emulators, passed in
[run 30557508276](https://github.com/kathyygong/kinetic/actions/runs/30557508276).

The subsequent Windows robustness pass exercises every Phase 6 lifecycle
action, the strict-auth HTTP boundary, malformed/conflict/replay/invariant
failures, stricter Phase 5 migration/deletion consistency, and expanded
owner/cross-user/anonymous Firestore access. It also updates the development
tool graph to patched `brace-expansion`/`minimatch` releases and passes a
zero-advisory connected audit.

Mac implementation checkpoints `bfbaaef` and `f52dc39`, followed by automated
closeout commit `1435369`, added most Phase 5–6 native surfaces. Hosted Windows
integration for that combined tree passed in
[run 31008015360](https://github.com/kathyygong/kinetic/actions/runs/31008015360).
The phases are still open: the Mac implementation copied full plan-generation
rules into Swift, authenticated live/device proof remains incomplete, and
account deletion currently stops at a retryable boundary.

## Authoritative execution sequence

Complete these stages in order. A green result in the first Windows stage is a
dependency handoff, not the final Windows integration.

1. **Windows Batch B — shared authority.** Work on
   `codex/mobile-phase5-6-closeout`. Add authenticated
   `mobile-plan-generation.v1` to FastAPI as the single runtime authority for
   initial and future generation. Keep `/mobile/plan-lifecycle`
   storage-neutral and independently validating, migrate the web runtime away
   from local TypeScript generation, add canonical/chained/auth/privacy gates,
   run the Windows suite, update this file, commit, and push.
2. **Mac Batch B — native correction and closeout.** Fetch the Windows Batch B
   commit. Replace Swift generation with the authenticated shared-generation
   client, retain only bounded review proposals that still pass through the
   lifecycle validator, finish retryable Firebase account deletion, and run
   the automated plus authenticated simulator/physical-device matrix below.
   Commit and push the Mac evidence to the same closeout branch.
3. **Final Windows integration — mandatory.** Fetch the Mac closeout commit,
   reconcile all documentation and fixtures, run the full frontend, backend,
   Firebase emulator, dependency-audit, and hosted Windows workflow, and record
   the exact final commit and run. Do not declare Phases 5–6 complete, merge,
   or start Phase 7 until this final return-to-Windows stage is green.

## Platform ownership

- **Windows/shared:** generation and lifecycle contracts, FastAPI authority,
  web runtime, canonical fixtures, deterministic/security tests, Firebase
  rules/emulators, dependency audit, documentation reconciliation, hosted CI,
  and final integration.
- **Mac/native:** Swift contract clients and view models, SwiftUI flows,
  Firebase client transactions, account-deletion interaction, Xcode signing,
  simulator/physical-device behavior, accessibility, and live readback.
- **Never duplicate:** mileage, pace, taper, workout scheduling, or future
  regeneration rules in Swift. The lifecycle endpoint validates a candidate;
  it does not generate one.

## Windows Batch B exit evidence

- Strict `mobile-plan-generation.v1` request/response fixture and parsers.
- Authenticated FastAPI initial-generation and future-regeneration endpoint.
- Deterministic bounds, invariant, malformed, privacy, and anonymous-auth
  tests, including generator-output acceptance by `/mobile/plan-lifecycle`.
- Production web generation calls the shared authority; the TypeScript planner
  is no longer a production runtime authority.
- Clean install/audit, lint, TypeScript, complete smoke, production build,
  backend compile/evals, and owner/cross-user/anonymous emulator results.
- One pushed Windows handoff commit. Mac work must start from that commit.

## Phase 5 native implementation checkpoint — 2026-08-03

Native Phase 5 implementation is committed at `bfbaaef` as an explicit
implementation checkpoint. By owner decision, the phase is not marked
complete: the remaining authenticated and physical-device gates below are
deferred into one combined Phase 5–6 proof pass before merge or Phase 7.

Implemented:

- migrated the app target, product, and shared scheme from proof-era
  `KineticCompanion` to `Kinetic`; retained the registered
  `com.kinetic.companion` bundle identifier, existing development team,
  Firebase plist contract, HealthKit entitlement, project path, source module,
  and package tests so signing and cross-platform fixture paths do not break;
- added strict Swift Codable/semantic parity for `mobile-foundation.v1` and
  deterministic parity for `mobile-notification.v1`;
- added paired owner-scoped `settings`/`onboarding` persistence with optimistic
  revision checks, legacy proof-state detection, copy-then-validate migration,
  and rejection of mismatched paired state;
- added Firebase account creation, verification-email request, password
  recovery, sign-in, returning-session restoration, actionable fixed auth
  failures, sign-out, and account-switch-safe in-memory clearing;
- replaced the single proof shell with permanent Today/Plan/Progress/Settings
  tabs and persisted route restoration; Plan and Progress are honest Phase 6/7
  placeholders rather than alternate authorities;
- added native onboarding summary inputs and progressive Health,
  notification, and deferred-Calendar education; Calendar remains deliberately
  deferred without EventKit behavior;
- added the opt-in local-only evening reminder with the shared fixed generic
  copy, explicit permission request, stable local-day identifier, and
  cancellation on opt-out/denial/account-deletion request;
- added privacy/support/foundation-export, training-data tombstone sweep, and
  retryable account-deletion-boundary controls; account deletion does not claim
  completion while owner-domain cleanup or Firebase reauthentication remains;
- added bounded `mobile_foundation_lifecycle` native audit encoding.

Automated/local evidence:

```text
Date: 2026-08-03
Branch source: codex/mobile-phase5-6-contracts at bfbaaef
macOS/Xcode: current Mac; Xcode 26.3 (17C529)
Focused Phase 3.5 entry tests: BehaviorPatternContractFixtureTests 4/4; MobileAuditModelsTests baseline 5/5
Baseline complete Swift suite: 52/52
Phase 5 focused Swift tests: 4/4
Phase 5 complete Swift suite: 57/57
Unsigned simulator build: clean Kinetic scheme build passed
Small-screen launch: iPhone SE (3rd generation), iOS 26.3.1 passed
Accessibility launch: accessibility XXXL + increased contrast rendered the signed-out foundation in a scrollable Form
Signed generic-device build: blocked; local Xcode account credentials/profile are unavailable even with -allowProvisioningUpdates
```

The continuation pass tightened the persistence boundary after automated
review found that synthesized Swift encoding omitted the contract-required
explicit `null` values for `requested_at` and `legacy_revision`. Custom
encoding now preserves both keys, the Firestore restore path rejects unknown
keys at every foundation nesting level, onboarding answers are bounded before
owner-scoped goal/profile writes, and the focused/full suites pass at 4/4 and
57/57. A concrete ad-hoc-signed iPhone SE simulator build installs and launches
cleanly at accessibility XXXL with increased contrast; its error/fault log is
clean after removing a premature Firebase configuration lookup.

Deferred gates required before declaring Phases 5–6 complete or starting Phase 7:

- authenticated pattern-card VoiceOver order/labels, landscape, and small-screen
  traversal on the carried Phase 3.5 surface;
- authenticated new-account, recovery, returning-session, sign-out, and
  account-switch interaction/readback;
- authenticated onboarding denied/deferred/notification opt-in, permanent-tab
  route restoration, deletion retry/tombstone, and `/qa/mobile` privacy
  readback;
- signed physical-device build/install/launch and the affected foundation
  VoiceOver, Dynamic Type, landscape, and small-screen matrix;
- restore a valid Xcode account/provisioning profile for
  `com.kinetic.companion` without changing bundle identity or entitlements.

## Phase 6 native implementation checkpoint — 2026-08-03

Implemented after the Phase 5 checkpoint:

- strict Swift request/response, exact-key, explicit-null, semantic, and
  privacy validation for `mobile-plan-lifecycle.v1`;
- a native deterministic proposal builder copied from the shared
  plan-generator rules. This historical checkpoint includes full
  volume/taper/pace/scheduling authority in Swift and is therefore explicitly
  nonconforming; Mac Batch B must replace its generation paths with the shared
  service;
- authenticated finite-deadline `POST /mobile/plan-lifecycle` networking;
- a real Plan tab for native generate, preview, explicit confirm, save/browse,
  move, shorten, replace, skip, availability, preferred-day, future
  regeneration, pause, and resume paths;
- replaced the Phase 3.5 preferred-day pattern Safari handoff with that same
  native validator/transaction review path and success audit;
- persistence of only `commit_ready` packages in one owner-scoped Firestore
  transaction across `plan`, `plan_history`, and `plan_operations`, with a
  deletion-boundary read, current-version equality, exact replay, and
  different-fingerprint idempotency conflict handling;
- fail-closed legacy-plan detection: proof-era data remains untouched until
  the runner approves a backend-validated native replacement, then the raw
  prior payload is retained in `plan_history` for recovery;
- bounded `mobile_plan_lifecycle` native audit output with no operation ID,
  fingerprint, workout content, date, goal, identity, or health fields.

Automated/local evidence:

```text
Phase 6 focused Swift tests: 7/7
Complete Swift suite: 65/65
Unsigned generic iOS Simulator build: passed
Concrete iPhone SE (3rd generation), iOS 26.3.1 build/install/launch: passed
Simulator error/fault log after launch: clean
```

The Swift gates cover canonical fixture parity, exact endpoint/auth behavior,
malformed/privacy/persistence rejection, every lifecycle action, the temporary
native generation implementation, stable SHA-256 fingerprints, stale-version
conflict, exact-operation replay, different-fingerprint conflict, missing auth,
and offline failure. The backend remains storage-neutral; SwiftUI never writes
a proposal directly. These tests do not make Swift generation authoritative;
the generation code must still be removed.

Still open before Phase 6 closeout:

- authenticated owner generate/preview/commit/browse and all-action live
  readback against the reachable backend and Firestore;
- owner-only transaction, same-operation retry, cross-user denial, deletion
  boundary, legacy replacement, and `/qa/mobile` privacy readback;
- rejected spacing/race/completed-history UI and offline retry interaction;
- the combined Phase 5–6 VoiceOver, Dynamic Type, contrast, landscape,
  small-screen, and signed physical-device matrix.

## Combined closeout pass — 2026-08-05

The Mac closeout reran every automated gate then available and closed the
dependency and unsigned-runtime portions of the proof pass. It added useful
owner-isolation coverage, but it did not close deterministic authority because
full generation remained duplicated in Swift.

Passed in this pass:

```text
Swift package suite: 65/65
Frontend ESLint: passed
Frontend TypeScript compile: passed
Frontend complete smoke suite: passed
Frontend Next.js 16.3.0 production build with non-secret demo Firebase config: passed
Backend Python 3.12 compileall: passed
Backend deterministic round-trip smoke: passed
Backend mobile plan authority/strict-auth HTTP smoke: passed
Firebase Auth + Firestore emulator owner/cross-user/anonymous rules suite: passed
Connected npm audit: 0 vulnerabilities
iPhone SE (3rd generation), iOS 26.3 simulator clean build/install/launch: passed
Standard and Accessibility XXXL, dark mode, and increased-contrast signed-out layouts: rendered without an app crash or fault
```

The emulator suite proves authenticated owner access and cross-user/anonymous
denial for foundation, plan, plan-history, plan-operation, readiness, check-in,
health-sync, audit, and tombstone documents. The Swift/backend suites prove all
eleven plan actions plus stale-version, exact replay, different-fingerprint,
completed-history, race-day, spacing, malformed-response, missing-auth, and
offline failure behavior. These automated results do not substitute for the
still-required native authenticated interaction and atomic live-readback gate.

The connected advisory feed published newer findings after the Windows pass.
The closeout updates Next/eslint-config-next to 16.3.0, PostCSS to 8.5.23,
minimatch to 10.2.5, and brace-expansion to 5.0.9. A clean `npm ci`, complete
frontend regression pass, production build, emulator rules suite, and connected
zero-vulnerability audit all pass on the updated lockfile.

External blockers observed on 2026-08-05:

- the paired iPhone 17 is available, but `security find-identity` reports zero
  valid signing identities;
- `xcodebuild -allowProvisioningUpdates` fails with `No Accounts` and no
  development profile for `com.kinetic.companion`;
- macOS denies Simulator landscape automation because the invoking process has
  not been granted Accessibility control.

Therefore Phases 5–6 are not yet declared complete and Phase 7 remains gated.
After adding the Apple developer account/profile in Xcode, finish the disposable
authenticated-owner interaction/readback, rejected/offline UI, VoiceOver order,
landscape, and signed physical-device matrix. Do not change the bundle identity
or entitlements to work around signing.

## Continuation prompts

Current Windows task:

> Continue Windows Batch B on `codex/mobile-phase5-6-closeout`. Read `MOBILE_PHASE5_6_HANDOFF.md`.

Next Mac task, only after the Windows Batch B commit is pushed:

> Continue Mobile Phases 5–6 closeout on Mac. Read `MOBILE_PHASE5_6_HANDOFF.md`.

Final Windows task, only after the Mac closeout commit is pushed:

> Complete final Windows integration for Mobile Phases 5–6. Read `MOBILE_PHASE5_6_HANDOFF.md`.

## Phase 5 checkpoint evidence

- Final product/target/scheme/bundle identity and migration result.
- Firebase Auth new-account, recovery, returning-session, sign-out, and
  account-switch results.
- `mobile-foundation.v1` Swift Codable fixture tests.
- Today/Plan/Progress/Settings route and restoration results.
- Onboarding with each permission denied/deferred plus notification opt-in.
- Training-data deletion and account-deletion retry/tombstone results.
- Deferred authenticated pattern-card and affected foundation VoiceOver,
  Dynamic Type, landscape, and small-screen evidence.
- Unsigned simulator build/launch and signed physical-device
  install/launch evidence.

## Phase 6 closeout evidence

- Swift Codable fixture parity for `mobile-plan-lifecycle.v1`.
- Generate/preview/commit and browse/readback on the authenticated owner.
- Move, shorten, replace, skip, availability, preferred-day confirmation,
  future regeneration, pause, and resume.
- Stale-version conflict, same-operation replay, different-fingerprint
  idempotency conflict, offline/retry, and rejected invariant UI.
- Completed-history, race-day, mileage/spacing/taper, availability, and
  preferred-day preservation checks.
- Owner-only `plan`, `plan_history`, and `plan_operations` transaction
  readback plus cross-user denial.
- Privacy-safe `/qa/mobile` readback for foundation and plan lifecycle events.
- Simulator and physical-device proof that normal plan ownership no longer
  requires the web.

## Stop conditions

Do not start Phase 7 EventKit implementation. Do not mark Phases 5–6 complete
after Windows Batch B or after the Mac pass alone. Completion requires the
final return-to-Windows integration and its green hosted run. Record native
permission/free-busy uncertainties for the separate early Mac spike instead of
encoding them into these schemas.
