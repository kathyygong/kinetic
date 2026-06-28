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

## Trust boundary

AI may explain decisions, summarize recalibrations, detect tentative behavior
patterns, and evaluate output quality. It cannot mutate a workout, plan,
mileage cap, recovery threshold, or persisted training state.

Confirmed preferences are bounded scoring inputs. Tentative patterns never
affect decisions, and no preference can override a safety constraint.

## Runtime modes

- `fallback`: deterministic explanation templates; deployed demo default.
- `local_ollama`: optional no-cost local model with schema validation,
  grounding checks, timeouts, caching, and fallback.
- `disabled`: deterministic decision flow without AI reasoning calls.

## Storage direction

The current demo remains local-first. The beta foundation adds user-scoped
Firebase repositories with idempotent migration and localStorage fallback.
Remote persistence must have Firestore rules and cross-user isolation tests
before it is described as beta-ready.

## Verification

- Frontend lint, production build, and deterministic smoke suites.
- Backend deterministic AI safety gates and generated
  [eval report](./EVAL_REPORT.md).
- Optional local-model benchmarks that cannot block the fallback-safe demo.
