# AI Boundaries and Evals

Kinetic uses AI where flexible language improves the experience, while keeping
training decisions, writes, and safety constraints deterministic. The practical
rule is simple: **an AI response must be discardable without making the product
unsafe or changing authoritative state.**

## Where AI is used

| Capability | AI's role | Deterministic boundary and rationale |
| --- | --- | --- |
| Daily, weekly, and What-if explanations | Turn an immutable decision trace into natural-language reasoning | Code selects the workout and computes every training change. Explanations that are slow, invalid, or contradictory are replaced with deterministic copy. |
| Natural-language intake | Extract supported, explicit intent into a typed draft | Schemas, source grounding, allowed values, validation, and persistence remain deterministic. The user must review and confirm every change. This provides a flexible interface without treating model output as authority. |
| Behavior insights | Select or describe a supported pattern from bounded evidence | Code owns evidence, confidence limits, available actions, and all writes. Tentative patterns never affect training, and confirmed preferences remain soft inputs below safety constraints. |
| Training summaries | Narrate deterministic 7- and 30-day aggregates | Code calculates the metrics and keeps the result read-only. Raw notes and unrelated context are excluded, and invented facts are rejected. |
| Workout and plan decisions | None | Plan generation, recovery classification, candidate scoring, mileage limits, workout spacing, calendar adjustments, and validation are deterministic for reproducibility, auditability, and safety. |
| Identity, privacy, and persistence | None | Authentication, owner isolation, telemetry filtering, confirmation, storage, and deletion are deterministic because probabilistic behavior is inappropriate at a trust boundary. |

AI is optional at runtime. Local models can provide richer language, while the
same product flows remain available through deterministic fallbacks when a model
is disabled, unavailable, or outside its latency budget.

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
