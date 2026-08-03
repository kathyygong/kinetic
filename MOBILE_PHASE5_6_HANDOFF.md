# Mobile Phases 5–6 Mac Handoff

Windows Batch A completed on branch `codex/mobile-phase5-6-contracts`.
Authoritative implementation commit: `2146aee`. Hosted Windows integration,
including connected dependency audit and owner-only Firebase emulators, passed
in [run 30553666395](https://github.com/kathyygong/kinetic/actions/runs/30553666395).

The subsequent Windows robustness pass exercises every Phase 6 lifecycle
action, the strict-auth HTTP boundary, malformed/conflict/replay/invariant
failures, stricter Phase 5 migration/deletion consistency, and expanded
owner/cross-user/anonymous Firestore access. It also updates the development
tool graph to patched `brace-expansion`/`minimatch` releases and passes a
zero-advisory connected audit.

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
- a native deterministic proposal builder derived from the existing shared
  plan-generator rules and saved owner-scoped goal/profile inputs, including
  bounded volume/taper/pace rules, preferred-day mapping, hard-effort spacing,
  stable workout identity, and locked race day;
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
malformed/privacy/persistence rejection, every lifecycle action, deterministic
generation bounds and spacing, stable SHA-256 fingerprints, stale-version
conflict, exact-operation replay, different-fingerprint conflict, missing auth,
and offline failure. The backend remains storage-neutral; SwiftUI never writes
a proposal directly.

Still open before Phase 6 closeout:

- authenticated owner generate/preview/commit/browse and all-action live
  readback against the reachable backend and Firestore;
- owner-only transaction, same-operation retry, cross-user denial, deletion
  boundary, legacy replacement, and `/qa/mobile` privacy readback;
- rejected spacing/race/completed-history UI and offline retry interaction;
- the combined Phase 5–6 VoiceOver, Dynamic Type, contrast, landscape,
  small-screen, and signed physical-device matrix.

## Copy-ready continuation prompt

> Continue the combined Mobile Phase 5–6 proof pass. Read
> `MOBILE_FOUNDATION_PLAN_CONTRACT.md`,
> `MOBILE_NOTIFICATION_CONTRACT.md`, and
> `MOBILE_PATTERN_RESULT_HANDOFF.md`. Restore the Apple signing account and use
> a disposable authenticated owner against a reachable backend. Run the
> deferred foundation/pattern accessibility checks plus native plan
> generate/preview/commit/browse and all eleven lifecycle actions. Prove the
> owner-only three-document transaction,
> conflict/replay/offline/deletion/legacy behavior, and privacy-safe
> `/qa/mobile` readback. Close the combined physical VoiceOver, Dynamic Type,
> contrast, landscape, and small-screen matrix without changing bundle identity
> or entitlements. Do not start Phase 7 EventKit until these gates pass.

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

Do not start Phase 7 EventKit implementation in this pass. Record native
permission/free-busy uncertainties for the separate early Mac spike instead of
encoding them into these schemas.
