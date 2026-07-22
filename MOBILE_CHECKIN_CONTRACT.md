# Kinetic Mobile Phase 3 Check-In Contract

Status: `mobile-checkin.v1` Windows/shared contract and native SwiftUI Part B
implementation completed 2026-07-20. Swift fixture, failure, idempotency,
privacy, simulator build/install/launch, signed generic-device, and shared
frontend gates pass. Physical-device interaction and live same-user web/audit
readback remain the final Part B proof; see
[MOBILE_CHECKIN_HANDOFF.md](./MOBILE_CHECKIN_HANDOFF.md).

## Authority And Scope

The contract closes the bounded morning/evening loop without adding a mobile
mutation service or a mobile-only history model:

- perceived recovery writes the existing owner-scoped `readiness` envelope;
- workout outcomes update the existing owner-scoped `workouts` and
  `recommendations` envelopes together;
- existing web training-review and behavior-memory readers remain downstream
  authorities;
- `POST /ai/parse-intake` may route a note into either check-in, but parsing
  and routing never supply or persist check-in values.

The canonical fixture is
`ios/KineticCompanion/Tests/Fixtures/mobile-checkin-contract.json`. TypeScript,
Swift, and backend compatibility tests must consume that file without an
independent vocabulary.

## Versioned Requests

Every request uses `schema_version: "mobile-checkin.v1"`, `platform: "ios"`,
an ISO local day, and a bounded ISO capture timestamp. Unknown keys and enum
values fail closed.

`perceived_recovery` requires explicit 1–5 perceived-recovery, fatigue, and
soreness values. A sleep-hours correction is either `null` or an explicit
number from 0 through 24. The write merges only those subjective fields into
the local-day readiness entry. Existing HealthKit sleep, HRV, and
resting-heart-rate summaries are preserved unless the runner explicitly
supplies the bounded sleep correction. A merged HealthKit/manual entry uses
`source: "mixed"`.

`workout_outcome` requires an exact current-plan slot and records:

- `completed` plus effort 1–10 and an optional bounded reflection category; or
- `skipped` plus one bounded skip reason.

It also carries the already-displayed Today action, confidence, planned and
recommended workout kinds, and explicit adjustment response. Deterministic
validation rejects a stale day, missing or changed plan slot, changed goal,
invalid action/recommendation combination, completed workout without effort,
and skipped workout without a reason.

## Deterministic Application

`applyMobileCheckin` is pure: it does not write storage, Firebase, telemetry,
or backend state. It validates the request, timestamp, current plan and goal,
then returns exact replacement payloads and write domains.

Native Part B must:

1. capture bounded fields through explicit controls;
2. rebuild and validate the request against fresh owner-scoped state;
3. show the values being saved;
4. require an explicit save action;
5. atomically persist returned domains through the existing Firebase envelope
   and tombstone conventions.

The native implementation now follows that boundary. `MobileCheckinEngine` is
pure and consumes the canonical fixture; SwiftUI collects only explicit fixed
controls and adds a separate review step. The Firestore client re-reads goal,
plan, readiness, workouts, and recommendations in one owner-scoped transaction.
Recovery changes only `readiness`; workout outcomes set both existing history
domains in the same atomic transaction. Routine check-ins reject deletion
tombstones instead of starting a new data epoch.

Retrying the same request is idempotent. The workout slot and stable
`mobile:<date>:<week>:<day>` recommendation event are replaced, not appended.
No backend apply endpoint exists or is needed.

## Privacy Boundary

Requests reject identity, tokens, raw notes, generated prose, raw HealthKit
samples, caller-supplied HRV/resting-heart-rate, pain severity, injury,
diagnosis, and medical data. No free text becomes readiness, biometric,
completion, effort, skip reason, reflection, pain, injury, or medical data.

Phase 3 intentionally stores no raw workout notes. Reflection and skip reason
use fixed enums. Pain/discomfort remains the Phase 2.5 caution route; a
persistent pain flag is deferred until the deterministic engine has an
explicit safe consumer.

`mobile_checkin_synced` contains only:

- platform and check-in kind;
- completed/skipped/checked-in status and bounded outcome/failure state;
- write scope and deterministic-validation state;
- booleans for effort/reflection presence and update success;
- bounded latency.

It never contains captured values, note, prose, identity, token, medical data,
biometrics, or HealthKit samples. `/qa/mobile` reads the same bounded
owner-only event envelope.

## Failures

Stable failure states are `auth_required`, `offline`, `timeout`,
`invalid_payload`, `state_conflict`, `permission_denied`, and `unknown`.
Failure always uses `write_scope: "none"` and `update_succeeded: false`.
Validation must complete before persistence. A multi-domain workout write is
successful only when both existing envelopes commit.

## Explicit Exclusions

This contract does not implement general chat, notifications, Apple Calendar
ingestion, background HealthKit repair, full native plan editing,
onboarding, Garmin/Oura, coach sharing, hosted-AI changes, autonomous AI
mutation, a new persistence domain, or a new backend endpoint.
