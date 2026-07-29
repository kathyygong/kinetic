# Mobile Phase 4 Notification Contract

Date: 2026-07-29

## Product decision

Phase 4 begins with one deliberately small notification experiment: an
opt-in local evening check-in reminder. The Today/check-in loop is implemented
and device-proven, so a reminder that helps a runner close that loop is a
reasonable product hypothesis. There is not yet retention evidence for broader
notification behavior.

Morning Today-ready and stale-readiness notifications remain deferred. They
would add interruption, permission, freshness, background-delivery, and
potentially sensitive lock-screen-copy risk without evidence that users need
them.

This is a user-versus-technical tradeoff:

- user value: one quiet reminder can reduce forgotten evening check-ins;
- user cost: notifications interrupt attention and can expose context on a
  lock screen;
- technical value: a local notification needs no push service, device token,
  hosted scheduler, or new backend domain;
- technical cost: permission, time-zone, cancellation, and stale-request
  behavior still need deterministic handling.

The resulting product boundary is opt-in, local-only, generic, and easy to
remove. It tests the retention hypothesis without creating broad notification
infrastructure.

## Shared contract

The canonical schema is `mobile-notification.v1`. Windows/shared Part A owns:

- strict request validation and a canonical cross-platform fixture;
- an off-by-default preference;
- explicit notification-permission states;
- deterministic schedule, cancel, permission-request, and no-op decisions;
- scheduling only for a planned workout whose check-in is still pending;
- cancellation after completion, skip, opt-out, permission denial, or elapsed
  target;
- one stable identifier per local day so scheduling is idempotent;
- fixed generic lock-screen copy with no workout, readiness, biometric, pain,
  or medical detail.

The shared contract does not schedule an operating-system notification. Mobile
Phase 5 will translate the decision into `UNUserNotificationCenter` operations
inside the permanent onboarding/Settings architecture.

## Native delivery boundary

The native implementation may add:

- one evening-check-in preference, off by default;
- notification permission requested only after explicit opt-in;
- local notification scheduling and cancellation;
- a safe explanation for denied permission;
- privacy-safe fixed-enum lifecycle evidence.

The native implementation must not add:

- remote push, device-token storage, or a notification backend;
- morning or stale-readiness notifications;
- health values, workout details, pain language, or inferred risk on the lock
  screen;
- pressure, streak-loss, guilt, medical, or injury-risk framing;
- a second check-in or plan-mutation authority.

## Deferred Phase 3.5 validation

Phase 3.5 is functionally complete. Its authenticated pattern-card VoiceOver,
landscape, and small-screen checks remain explicitly unverified. They are a
mandatory entry check for Phase 5 because that is the next phase that changes
native iOS UI.

Do not build a temporary Phase 4 notification screen. Native delivery and its
preference belong in the permanent Phase 5 onboarding/Settings architecture.
The Phase 5 Mac pass must test both the existing pattern-card surface and the
new permission/preference states. The checks remain required before external
beta.

## Windows/shared acceptance

- Every fixture case returns the expected deterministic action and reason.
- Input objects are not mutated.
- Notification permission is never requested before explicit opt-in.
- Completed, skipped, inapplicable, disabled, denied, and elapsed cases never
  schedule a reminder.
- Only an authorized or provisional, opted-in, pending same-day check-in can
  schedule.
- Lock-screen title/body are fixed generic copy and contain none of the
  forbidden sensitive terms.
- Unknown kinds, extra sensitive fields, malformed timestamps, and cross-day
  targets fail closed.
- The contract smoke is part of the default frontend smoke suite.

## Subsequent native implementation prompt

> Continue Mobile Phase 5 native foundation implementation.

Use this prompt after Windows Batch A in
[MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md) has defined and handed off the Phase
5 onboarding/settings/auth and Phase 6 plan-lifecycle boundaries. Start by
reading this contract and
[MOBILE_PATTERN_RESULT_HANDOFF.md](./MOBILE_PATTERN_RESULT_HANDOFF.md). Run the
deferred pattern-card VoiceOver, landscape, and small-screen checks before
changing native UI. Build the permanent navigation, onboarding, and Settings
foundation; place only the local evening-check-in preference/delivery inside
that architecture, then repeat affected accessibility/layout checks.
