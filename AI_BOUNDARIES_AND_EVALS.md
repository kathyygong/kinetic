# AI Boundaries and Evals

Kinetic separates AI-driven reasoning from deterministic decision-making. AI
understands athlete intent, identifies meaningful patterns, and turns training
evidence into contextual, personalized reasoning. Deterministic logic enforces
training constraints, validates model outputs, and controls authoritative state
changes.

This is not AI versus code; both are implemented in software. It is a boundary
between probabilistic interpretation and deterministic authority. **AI handles
context, ambiguity, and synthesis. Deterministic logic handles exact,
repeatable decisions and confirmed execution.**

## Division of responsibility

| Capability | AI | Deterministic |
| --- | --- | --- |
| Daily, weekly, and What-if reasoning | Interprets the decision context and produces personalized explanations | Selects the workout and calculates every training change; rejects explanations that are invalid or contradict the selected action |
| Natural-language intake | Interprets explicit athlete intent and structures it as a reviewable draft | Defines allowed values, verifies source grounding, validates the draft, and requires user confirmation before persistence |
| Behavior insights | Identifies and explains meaningful patterns in bounded evidence | Defines admissible evidence, confidence limits, available actions, and permitted writes; tentative patterns cannot affect training |
| Training summaries | Synthesizes training evidence into a concise narrative | Calculates the underlying metrics, limits the available context, and keeps the result read-only |
| Workout and plan decisions | Contextualizes recommendations and supports bounded exploration | Owns plan generation, recovery classification, candidate scoring, mileage limits, workout spacing, calendar adjustments, and final validation |
| Identity, privacy, and persistence | Operates only on the minimum approved context for each feature | Enforces authentication, owner isolation, telemetry filtering, confirmation, storage, and deletion |

AI is Kinetic's intelligence layer; deterministic logic forms its control
layer. Local models provide capabilities that deterministic logic alone cannot
match. When a model is unavailable or outside its latency budget, bounded
fallbacks preserve safe continuity, but with reduced intelligence and
personalization.

## What the evals cover

The release baseline is an offline, deterministic suite: **18 gate groups and
498 assertions**. It does not require a live model, so contract and safety
regressions are reproducible in development and CI.

- **Decision integrity:** AI cannot change the selected workout, plan, recovery
  classification, or decision trace, and its explanation cannot contradict the
  selected action.
- **Schema and grounding:** daily and weekly reasoning, intake, behavior results,
  What-if explanations, and training summaries must satisfy typed contracts and
  remain grounded in deterministic inputs.
- **Failure behavior:** malformed, sparse, timed-out, unavailable, ambiguous, or
  ungrounded outputs must fail safely to bounded fallback behavior without a
  mutation.
- **Confirmation and access:** intake and behavior changes remain draft-only
  until explicit confirmation; authentication, ownership, and cross-user
  isolation are enforced independently of AI.
- **Privacy and claims:** restricted raw data is excluded from model and
  telemetry paths, uncertainty is preserved, and unsupported medical or factual
  claims are rejected.

An optional live-model intake benchmark complements the release gates. It runs
eight representative cases twice and checks exact extraction, request
immutability, absence of fallback, repeatability, and latency. This measures a
specific model configuration without making core safety depend on that model or
machine.

Frontend smoke tests, Firestore emulator isolation tests, Swift contract tests,
and iOS accessibility checks provide the surrounding end-to-end evidence. They
are not model-quality evals, but they verify that the evaluated boundaries hold
in the shipped product paths.

See [Architecture](./ARCHITECTURE.md) for the full system design and the
[generated eval report](./EVAL_REPORT.md) for the current gate inventory and
reproduction commands.
