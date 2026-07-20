# Mobile Intake Contract

Status: Windows/shared Part A and macOS/native Part B implementation completed
on 2026-07-20. Swift package, simulator build/launch, signed generic-device
build, strict-auth backend, shared web/backend, advisory, and Firestore rules
gates pass. Physical-device install/interaction and native `/qa/mobile`
readback remain pending because the connected iPhone was unavailable.

This contract defines the bounded mobile request and routing response carried
by the existing authenticated `POST /ai/parse-intake` endpoint. Its schema is
`mobile-intake.v1`. The TypeScript authority is
`frontend/lib/mobileIntakeContract.ts`, the backend authority is
`backend/app/mobile_intake.py`, and the canonical cross-platform fixture is
`ios/KineticCompanion/Tests/Fixtures/mobile-intake-contract.json`.

## Authority and mutation boundary

- Firebase Auth remains the endpoint gate. Strict mode rejects anonymous
  intake with `401`.
- Routing and parsing are read-only. The backend intake modules have no
  persistence or plan-mutation imports and every response declares
  `mutation_performed: false`.
- Review drafts are untrusted until the user reviews and explicitly confirms
  them and the frontend reruns deterministic validation.
- Goal, preferred-day, availability, travel, and schedule changes reuse the
  current plan generator and availability adjuster.
- Workout swaps use the same confirmed intake apply path. Deterministic
  validation requires an existing plan, rejects race-day movement, duplicate
  days, changed weekly load, and newly unsafe hard-workout spacing.
- Recovery, caution, missed-workout, and reflection routes do not persist in
  Phase 2.5 Part A. They identify a bounded destination for the later native
  UI; Phase 3 owns deeper check-in persistence.
- Explanation uses bounded current-decision facts and a deterministic template
  identifier. It does not call AI or expose generated prose.

## Request

The mobile request contains:

- `schema_version: "mobile-intake.v1"`;
- `platform: "ios"`;
- a trimmed transient `text` value of 1 to 280 characters;
- the device-local `today`;
- optional bounded current goal fields: race distance, target date, and weekly
  mileage;
- optional bounded profile fields: experience level and preferred training
  days;
- optional decision facts: selected action, readiness/calendar state,
  confidence bucket, and capped staleness-warning count.

Unknown fields are rejected. UID, email, name, token, raw readiness,
biometrics, HealthKit samples, calendar/workout text, and unrelated history
are not accepted as mobile context. The transient note is required to perform
the requested parse but is never added to persistence or telemetry.

## Typed outcomes

Every successful response contains one tagged `outcome`:

| Route | Result | Mutable |
| --- | --- | --- |
| `review_draft` | One or more typed `schedule`, `availability`, `travel`, `workout_swap`, `goal`, or `preferred_day` drafts | Review-only; explicit confirmation and deterministic validation required |
| `perceived_recovery` | Route to explicit perceived-recovery, fatigue, soreness, and optional sleep-correction capture | No; values are not inferred and Part A does not persist |
| `caution` | Conservative stop/reduce, discomfort-flag, and qualified-care choices | No diagnosis, pain severity, injury state, or training clearance |
| `missed_workout` | Route to mark-skipped, reschedule, or rebalance choices | No completion is inferred and Part A does not persist |
| `reflection` | Route to explicit completion and perceived-effort capture | No completion or effort is inferred and Part A does not persist |
| `explanation` | Read-only deterministic Today trace facts | No generated prose or mutation |
| `clarification` | Bounded supported-route choices for ambiguous/incomplete input | No |
| `refusal` | `unsupported` or `unsafe` with one bounded next action | No |

The route priority is conservative: unsafe requests stop, pain/injury language
routes to caution, recovery language routes to explicit capture, and no such
text is allowed to become a hidden readiness, biometric, diagnosis,
pain-severity, completion, effort, or medical value.

## Failure contract

| Failure | Stable behavior |
| --- | --- |
| Missing/rejected auth | HTTP `401`; client code `auth_required`; no mutation |
| Client deadline | `timeout`; no cached draft is applied |
| Network unavailable | `offline`; no mutation |
| Backend `5xx` | `backend_unavailable`; no mutation |
| Malformed/non-contract response | `invalid_response`; strict client validator rejects it |
| AI timeout | Deterministic draft remains review-only with parser failure `ai_timeout` |
| AI unavailable/disabled | Deterministic draft remains review-only with a bounded parser failure |
| Malformed/ungrounded AI | AI output is discarded; deterministic draft remains review-only |
| Ambiguous input | `clarification` |
| Unsupported input | Bounded `refusal` |

Only an already-grounded deterministic draft can survive an AI failure. A
failure never confirms or applies a draft.

## Observability and readback

`mobile_intake_lifecycle` stores only capped enum/bucket fields:

- action, outcome, route, draft kind, failure state, parser source, mutation
  state, deterministic-validation state, platform, and bounded latency;
- optional legacy fields remain readable so Phase 1/2A native audit entries do
  not break before the Part B model migration.

Raw notes, grounding text, generated prose, identity, tokens, raw health
values, recovery values, pain severity, completion, and medical data are
forbidden. `/qa/mobile` reads the owner-only capped `mobile_audit` envelope and
shows the bounded route, failure, mutation, and validation fields. Firestore
rules continue to allow only the owning Firebase UID.

## Shared validation

On 2026-07-20 the Windows suite passed:

- frontend lint and TypeScript;
- the full frontend deterministic smoke suite, including all canonical mobile
  intake routes, failure mappings, request/response privacy, telemetry,
  deterministic confirmation, and workout-swap validation;
- frontend production build and beta-readiness (with the expected connected
  advisory-audit skip warning);
- backend compile, deterministic gates, and smoke, including strict-auth
  rejection and AI timeout/unavailable/malformed fallback;
- Auth + Firestore emulator rules, including owner read/write and cross-user
  denial for bounded mobile intake lifecycle audit events.

## Native consumption

The native implementation consumes this exact schema and fixture:

- Swift exact-key validation rejects unknown enums, extra structure,
  malformed JSON, mutation claims, and privacy-forbidden response fields.
- The request builder includes only the transient trimmed note, local day,
  bounded goal/profile context, and optional Today decision buckets.
- The authenticated client uses the existing `/ai/parse-intake` endpoint with
  a 30-second deadline and stable auth/offline/timeout/backend/invalid-response
  failures. Drafts are never cached.
- Native Today exposes the short entry point and renders all eight bounded
  destinations. Recovery, caution, missed-workout, and reflection remain
  non-persisting Phase 2.5 destinations.
- Confirmation keeps the note only in volatile memory, re-reads the existing
  owner-scoped `goal`, `profile`, and `plan` envelopes in one transaction, and
  reruns grounding and plan validation before any write.
- Preferred-day, availability/travel, and workout-swap changes transform the
  existing plan deterministically. Workout swaps preserve unique days and
  weekly load, reject race-day movement, and cannot worsen adjacent hard-day
  spacing. Goal or experience changes update their existing domain and
  tombstone the now-stale saved plan for deterministic regeneration.
- Native audit transport uses only the fixed action/outcome/route/draft-kind/
  failure/parser/mutation/validation/platform/latency vocabulary.

The dated command and device evidence is in
[MOBILE_INTAKE_HANDOFF.md](./MOBILE_INTAKE_HANDOFF.md). The implementation
does not add a native mutation endpoint or the deferred Phase 3 persistence
loop.
