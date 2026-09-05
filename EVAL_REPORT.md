# Kinetic AI System Safety and Contract Report

Generated: 2026-09-05

## Result

**PASS — all 18 deterministic gate groups and 502
explicit safety assertions passed.**

| Gate ID | Gate group | Assertions | Result |
| --- | --- | ---: | --- |
| `ai-status` | AI runtime fallback | 3 | PASS |
| `project-token-claims` | Project token claim validation | 3 | PASS |
| `daily-reasoning` | Daily reasoning safety | 72 | PASS |
| `mobile-today` | Mobile Today contract | 6 | PASS |
| `weekly-reasoning` | Weekly reasoning safety | 8 | PASS |
| `what-if` | What-if read-only safety | 11 | PASS |
| `what-if-failures` | What-if malformed/timeout fallback | 10 | PASS |
| `intake` | Intake grounding and no-mutation safety | 14 | PASS |
| `intake-failures` | Intake malformed/timeout/ungrounded fallback | 13 | PASS |
| `mobile-intake` | Mobile intake tagged route contract | 198 | PASS |
| `mobile-intake-failures` | Mobile intake failures and strict auth | 10 | PASS |
| `mobile-checkin` | Mobile check-in compatibility and strict auth | 10 | PASS |
| `behavior` | Behavior-learning safety | 47 | PASS |
| `behavior-results` | Behavior pattern result contract | 45 | PASS |
| `behavior-result-failures` | Behavior result failures and strict auth | 26 | PASS |
| `behavior-privacy` | Behavior prompt privacy | 3 | PASS |
| `training-summary` | Training-summary grounding and privacy | 17 | PASS |
| `training-summary-failures` | Training-summary invalid/timeout fallback | 6 | PASS |

## Enforced guarantees

- AI cannot unilaterally change the deterministic selected workout.
- Daily explanations cannot contradict the selected action.
- Daily, weekly, behavior, What-if, intake, and training-summary outputs match
  their schemas.
- Fallback output contains no medical claims.
- Weekly reasoning cannot mutate the recalibration trace.
- Intake changes require exact source grounding, remain drafts until explicit
  confirmation, and cannot mutate request or persisted state while parsing.
- Sparse, malformed, timed-out, unavailable, and ungrounded intake output
  cannot invent or apply a change.
- Mobile Today preserves caller-authoritative availability and lowers
  confidence when required freshness context is missing.
- Mobile intake routes every supported, ambiguous, unsupported, and unsafe note
  without mutation; strict context, strict auth, and AI failure fallbacks pass.
- Mobile check-in outcomes remain compatible with read-only training reviews
  and strict-auth boundaries.
- Every supported behavior pattern maps to a bounded product result; unsupported
  model selections, malformed output, provider failures, and anonymous access
  fail safely.
- Sparse behavior history emits a limited-history warning and cannot claim
  moderate or high confidence.
- Weekly/monthly reviews derive metrics deterministically from bounded outcome
  fields, exclude raw notes, remain read-only, and reject invented AI facts.
- The baseline suite runs with `KINETIC_AI_MODE=fallback`; live AI is never
  required to verify the product's deterministic safety boundary.
- Calendar availability is stubbed inside the deterministic harness, so local
  credentials and external network state cannot change gate outcomes.

## Reproduce

From `backend/`:

```powershell
# Run the canonical registry with progress output.
.\.venv\Scripts\python.exe -m evals._gates

# Run the same registry and verify this checked-in report is current.
.\.venv\Scripts\python.exe -m evals.generate_report --check

# Regenerate the report after an intentional gate change.
.\.venv\Scripts\python.exe -m evals.generate_report
```

Live model quality is evaluated separately and never weakens this release gate.
See `MODEL_EVAL_REPORT.md` for the current candidate comparison, metrics, error
analysis, limitations, and reproduction command.

## Additional product gates

Frontend smoke coverage includes typed privacy-conscious instrumentation,
returning-user sign-in hydration ordering, Apple Health CSV import bounding and
note-dropping, plan-safety invariants, shared mobile contracts, persistence,
intake confirmation, and training-review request privacy.

The Auth + Firestore emulator gate verifies owner access, cross-user and guest
denial, unknown-domain denial, bounded mobile lifecycle readback, and deletion
tombstones.

Beta hardening includes a repeatable local readiness check and handoff matrix.
`npm run beta:readiness` verifies lockfile presence, direct dependency pinning,
protected QA artifact hygiene, and runbook/matrix presence. The connected
`npm run beta:audit` is the advisory gate.

Telemetry QA exercises every typed product event family with safe values and
intentionally unsafe extra fields, then proves capped local storage and
write/remove failure isolation.
