# Mobile Behavior Pattern Result Contract

Date: 2026-07-23
Contract: `behavior-pattern-result.v1`

## Purpose

This contract closes the pre-beta behavior-memory gap without introducing a
new mutation authority. `POST /behavior-insights` remains authenticated and
read-only. It may detect supported patterns, but every surfaced pattern must
carry one deterministic product result.

Pattern detection, response parsing, card rendering, and review never mutate
training state. Only an explicit confirmation can persist a bounded scoring
preference or pass reviewed preferred-day inputs through the existing intake
planner and validator.

## Canonical fixture

The cross-platform fixture is:

`ios/KineticCompanion/Tests/Fixtures/mobile-pattern-result-contract.json`

Frontend, backend, and future Swift tests must consume the same
`behavior-pattern-result.v1` vocabulary. Do not add a native-only result kind.

## Request boundary

The existing authenticated endpoint remains:

`POST /behavior-insights`

Request:

```json
{
  "recommendation_events": []
}
```

Inputs are the existing bounded recommendation/check-in event shape. Raw
workout notes are excluded from the AI prompt. The only new optional context
signals are bounded enums:

- `readinessFreshness`: `fresh`, `stale`, or `missing`;
- `checkinStatus`: `completed`, `missing`, or `not_due`.

Pain/discomfort detection consumes only the existing bounded
`skipReason: pain_or_discomfort` flag. It never consumes free-text pain
descriptions, severity, injury, or medical fields.

## Response envelope

Every successful response contains:

- `contract_version: behavior-pattern-result.v1`;
- bounded `analysis` source/fallback/failure metadata;
- no more than 20 strictly typed patterns;
- bounded warning strings.

Every pattern contains a stable ID, supported family, bounded confidence,
support count of at least two, what Kinetic noticed, why it matters, the
suggested bounded response, and a discriminated `result`.

The result always states:

- whether review is required;
- whether confirmation is required;
- the only permitted mutation target;
- the action label;
- what can change;
- what never changes.

Unknown families, result kinds, mutations, days, preference types, malformed
responses, and support counts below two are rejected.

## Result routes

| Pattern family | Result kind | Allowed effect |
| --- | --- | --- |
| `heavy_calendar_misses` | `scoring_preference_review` | After confirmation, a capped `busy_day_preference` may nudge shorter/easier candidates |
| `specific_day_skips` | `preferred_day_review` | Review training days; confirmation reuses deterministic intake validation and plan generation |
| `long_run_day_preference` | `preferred_day_review` | Review training days including the observed long-run day; deterministic spacing remains authoritative |
| `rest_override` | `scoring_preference_review` | After confirmation, a capped recovery-alternative nudge may apply when not at risk |
| `adjustment_tolerance` | `scoring_preference_review` | After confirmation, a capped difficulty nudge may apply when not at risk |
| `stale_data_or_checkin_gap` | `checkin_prompt` | Open sync/check-in UX only; no training mutation |
| `pain_or_discomfort_recurrence` | `caution` | Show fixed caution actions only; no diagnosis, preference, or training mutation |

Tentative patterns never score. Unsupported model output cannot create a
result. The backend intersects model-selected families with deterministic
detector output and authors all displayed actions and boundaries
deterministically.

## Confirmation authority

Scoring results:

1. Review does not write.
2. Confirmation builds a typed `LearnedPreference`.
3. The existing behavior repository persists it.
4. The decision engine keeps the existing per-rule and net-delta caps.
5. At-risk safety still overrides rest/intensity personalization.

Preferred-day results:

1. The runner reviews an explicit day selection.
2. The observed avoided day must be removed, or the observed preferred
   long-run day must be included.
3. The selection must contain enough days to preserve the current plan shape.
4. A grounded `IntakeDraft` is constructed without free text.
5. `validateIntakeDraft` and `buildConfirmedIntakeState` rerun.
6. Only `persistConfirmedIntake` writes the reviewed profile and regenerated
   plan.

Review cancellation, invalid selection, missing goal, malformed response,
strict-auth rejection, unavailable AI, timeout, and unsupported AI leave
state unchanged.

### Native v1 authority decision

The native client may confirm scoring preferences because that write is small,
typed, owner-scoped, idempotent, and still capped by the shared decision
engine. It must route preferred-day results to the web review surface in v1.

This deliberately optimizes the user/technical tradeoff:

- users get immediate native value for low-risk personalization and existing
  check-in/readiness actions;
- users do not receive subtly different plans depending on which client they
  used;
- engineering retains one deterministic plan validator and persistence
  authority instead of maintaining Swift and TypeScript planner parity;
- native schedule completeness is deferred until a shared validator can be
  reused without weakening safety, spacing, taper, or race-day rules.

## Failure contract

`analysis.failure` is one of:

- `none`;
- `timeout`;
- `ai_unavailable`;
- `malformed_ai`;
- `invalid_ai`;
- `unsupported_ai`;
- `unknown`.

All AI failures use the deterministic detector and set
`fallback_used: true`. Sparse history uses the deterministic path without
claiming a failure.

## Telemetry and readback

`mobile_pattern_result_lifecycle` records only:

- `platform`;
- lifecycle `action` and bounded `outcome`;
- `pattern_family`;
- `result_kind`;
- `mutation_state`;
- `deterministic_validation`;
- bounded `source`.

It must never contain pattern titles, descriptions, generated prose, raw
notes, identity, tokens, workout text, readiness/biometric values, recovery
values, pain severity, injury, or medical fields. `/qa/mobile` reads the event
from the existing owner-scoped `mobile_audit` document. No new Firestore
domain or rule grant is introduced.

## Scope boundary

This contract does not add notifications, general chat, autonomous mutation,
hosted AI, Garmin/Oura, coach sharing, Apple Calendar ingestion, onboarding,
full native plan editing, or a new persistence domain.
