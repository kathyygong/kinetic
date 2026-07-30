# Mobile Phases 5–6 Mac Handoff

Windows Batch A completed on branch `codex/mobile-phase5-6-contracts`.

## Copy-ready continuation prompt

> Continue Mobile Phase 5 native foundation implementation, then checkpoint it
> before Mobile Phase 6. Read `MOBILE_FOUNDATION_PLAN_CONTRACT.md`,
> `MOBILE_NOTIFICATION_CONTRACT.md`, and
> `MOBILE_PATTERN_RESULT_HANDOFF.md`. Start by running the deferred
> authenticated pattern-card VoiceOver, Dynamic Type, landscape, and
> small-screen checks. Migrate the proof-era KineticCompanion identity
> deliberately, preserving signing, Firebase configuration, entitlements, and
> tests. Build permanent Today/Plan/Progress/Settings navigation, Firebase Auth
> account creation/recovery/session restoration, native onboarding,
> progressive permissions, privacy/support/export/deletion controls, and the
> local-only evening reminder inside Settings. Consume
> `mobile-foundation.v1`; do not invent additional persisted identity or
> permission states. Run the affected accessibility/device checks and commit a
> Phase 5 checkpoint. Then implement Phase 6 against
> `mobile-plan-lifecycle.v1`: native generate/preview/save/browse and bounded
> lifecycle actions must call the authenticated backend validator; persist
> only `commit_ready` packages in one owner-scoped Firestore transaction with
> plan history and operation idempotency. Preserve completed workouts and race
> day, surface conflicts/rejections, and add Swift fixture tests. Do not add
> EventKit behavior or a second native planning authority. Return to Windows
> only for a blocking shared-contract fix or final integration.

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
