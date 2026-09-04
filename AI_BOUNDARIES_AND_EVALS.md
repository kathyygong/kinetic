# AI Boundaries and Evals

Kinetic uses AI as a core product capability for understanding athlete intent,
identifying meaningful patterns, and turning training evidence into contextual,
personalized reasoning. Deterministic systems provide the execution boundary:
they enforce training constraints, validate model outputs, and control
authoritative state changes.

The division is based on strengths, not importance. **AI provides
interpretation, synthesis, and communication where context and judgment matter;
Kinetic's deterministic systems enforce invariants and execute confirmed
changes.**

## Division of responsibility

| Capability | AI's role | Deterministic responsibility and rationale |
| --- | --- | --- |
| Daily, weekly, and What-if explanations | Turn an immutable decision trace into natural-language reasoning | The training engine selects the workout and calculates every training change. Explanations that are slow, invalid, or contradictory are replaced with deterministic copy. |
| Natural-language intake | Extract supported, explicit intent into a typed draft | Schemas, source grounding, allowed values, validation, and persistence remain deterministic. The user must review and confirm every change. This provides a flexible interface without treating model output as authority. |
| Behavior insights | Select or describe a supported pattern from bounded evidence | The behavior-insight contract defines admissible evidence, confidence limits, available actions, and permitted writes. Tentative patterns never affect training, and confirmed preferences remain soft inputs below safety constraints. |
| Training summaries | Narrate deterministic 7- and 30-day aggregates | The metrics pipeline calculates the aggregates and keeps the result read-only. Raw notes and unrelated context are excluded, and invented facts are rejected. |
| Workout and plan decisions | Explain the selected recommendation, connect it to the athlete's context, and support bounded exploration | Plan generation, recovery classification, candidate scoring, mileage limits, workout spacing, calendar adjustments, and validation are deterministic for reproducibility, auditability, and safety. |
| Identity, privacy, and persistence | Operate on the minimum approved context needed for each AI feature | Authentication, owner isolation, telemetry filtering, confirmation, storage, and deletion are deterministic because access control and data integrity require exact enforcement. |

AI is Kinetic's intelligence layer; its deterministic systems form the control
layer. Local models provide capabilities that rule-based systems alone cannot
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
