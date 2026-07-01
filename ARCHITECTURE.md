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

## Trust boundary

AI may explain decisions, summarize recalibrations, detect tentative behavior
patterns, parse supported notes into reviewable drafts, and evaluate output
quality. It cannot mutate a workout, plan, mileage cap, recovery threshold, or
persisted training state.

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

Firestore owner-only rules and Auth + Firestore emulator isolation tests pass.
Live signed-in two-session hydration/deletion verification remains the final
remote-persistence gate before this layer is described as beta-ready.

## Verification

- Frontend lint, production build, and deterministic smoke suites.
- Backend deterministic AI safety gates and generated
  [eval report](./EVAL_REPORT.md).
- Signed-in responsive browser QA and strict Firebase token enforcement,
  including authenticated intake review/confirmation and anonymous rejection.
- Firestore owner, cross-user, guest, and unknown-domain emulator checks.
- Optional local-model benchmarks that cannot block the fallback-safe demo.
