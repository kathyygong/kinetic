# Kinetic Architecture

Kinetic is a hybrid adaptive-training system: deterministic code owns every
safety-critical decision, while an optional bounded AI layer explains and
summarizes those decisions.

## Request flow

1. The Next.js frontend loads the runner's goal, plan, readiness, schedule
   availability, workout history, and confirmed preferences.
2. The FastAPI decision endpoint classifies readiness and scores only
   deterministic workout candidates.
3. Safety constraints select the final workout and return a decision trace.
4. The reasoning layer receives that immutable trace and produces typed prose.
5. Invalid, slow, unavailable, or contradictory AI output is discarded and
   replaced by deterministic fallback copy.
6. The user accepts, rejects, completes, or skips the recommendation; that
   response becomes advisory history for future preference detection.

Natural-language intake follows a separate review boundary:

1. `POST /ai/parse-intake` receives the note plus current goal/profile context.
2. Local AI uses a dedicated, startup-warmed `llama3.2:3b` model. Kinetic
   derives the allowed field set first, then Ollama's native JSON Schema
   requires the model to normalize every explicit value without introducing a
   new category.
3. The backend accepts the model result only when it exactly agrees with the
   deterministic authority, then attaches Kinetic-owned IDs, source-text
   evidence, warnings, and review copy. Malformed, slow, unavailable, or
   disagreeing output falls back to conservative deterministic parsing.
4. The frontend treats the response as untrusted and validates the complete
   draft again. Parsing cannot write storage.
5. Only **Confirm changes** reaches the existing deterministic plan generator
   and availability adjuster; sparse or ambiguous drafts cannot be confirmed.

Training reviews use a read-only aggregate boundary:

1. The Plan page maps logged outcomes into a bounded 7/30-day request. Workout
   names, notes, rejection reasons, and calendar context never enter this path.
2. `POST /ai/training-summary` calculates consistency, completed volume,
   effort, and recovery trends deterministically.
3. Optional local AI receives only those final metrics and may produce typed
   narrative copy. Invented numbers, medical claims, malformed output, and
   timeouts are rejected for deterministic fallback copy.
4. The response is display-only and has no state-mutation action.

## Trust boundary

AI may explain decisions, summarize recalibrations and bounded training
aggregates, detect tentative behavior patterns, parse supported notes into
reviewable drafts, and evaluate output quality. It cannot mutate a workout,
plan, mileage cap, recovery threshold, or persisted training state.

Confirmed preferences are bounded scoring inputs. Tentative patterns never
affect decisions, and no preference can override a safety constraint.

## Runtime modes

- `fallback`: deterministic explanation templates; deployed demo default.
- `local_ollama`: optional no-cost local model with schema validation,
  grounding checks, timeouts, caching, and fallback.
- `disabled`: deterministic decision flow without AI reasoning calls.

## Storage direction

The current implementation is local-first: synchronous localStorage reads keep
the training flow available, while authenticated Firebase repositories mirror
profile/goal, plan/readiness/workout history, recommendation history,
preferences, completion, and calendar-freshness domains in the background.
Migration is idempotent, deletion uses tombstones, and the cache records its
owning Firebase UID so one account cannot hydrate another account's data.
Returning sign-in hydrates the authenticated cache before merging Firebase
identity into the local profile, preventing a fresh auth shell from overwriting
an existing remote profile. Remote mirrors are ordered and coalesced per
storage domain so seed/reset bursts cannot race late tombstones over newer
payloads. Signed-in deletion requires confirmed Firebase tombstones before
local deletion is finalized; if tombstones cannot be confirmed, Profile shows a
retryable error instead of pretending remote data was deleted. The destructive
delete action uses an in-page confirmation panel, avoiding native dialog hangs
and keeping browser QA repeatable.

Firestore owner-only rules and Auth + Firestore emulator isolation tests pass.
Cloud Firestore is enabled for `kinetic-aca73`, owner-only rules are deployed,
and live signed-in QA verifies cross-session hydration, account isolation, and
local-cache ownership. The 2026-07-09 live gate also verifies deletion
tombstones remain deleted after reload and after signing into the same account
from the second local origin, closing the remote persistence gate.

## Observability direction

Product observability is local/demo-safe by default. `frontend/lib/instrumentation.ts`
stores a capped v2 event log with typed envelopes, event-specific whitelists,
bounded numeric fields, bucketed enum values, and sensitive-key rejection.
Telemetry failures are caught and isolated so training, persistence, auth, and
AI fallback cannot be blocked by instrumentation.

Tracked surfaces include recommendation responses/completions, AI status and
reasoning source/fallback/latency/timeout, intake reviewed/confirmed/discarded,
training-review window/source, persistence hydrate/mirror/delete outcomes, and
stale-data warnings. The log intentionally excludes raw notes, biometrics,
workout/calendar text, tokens, email, UID, and unnecessary identity data.

## Verification

- Frontend lint, production build, and deterministic smoke suites.
- Backend deterministic AI safety gates and generated
  [eval report](./EVAL_REPORT.md).
- Signed-in responsive browser QA and strict Firebase token enforcement,
  including authenticated intake review/confirmation, anonymous rejection,
  and live grounded 30-day training-review narration. Sparse ungrounded
  narration is rejected for deterministic review copy.
- Firestore owner, cross-user, guest, and unknown-domain emulator checks.
- Optional local-model benchmarks that cannot block the fallback-safe demo.
