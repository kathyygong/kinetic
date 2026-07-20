# Kinetic Deterministic AI Eval Report

Generated: 2026-07-20

## Result

**PASS — all 43 deterministic fallback and Mobile Phase 2.5 contract cases
satisfied the demo safety gates.**

| Gate group | Cases | Result |
| --- | ---: | --- |
| AI runtime fallback | 1 | PASS |
| Daily reasoning safety | 4 | PASS |
| Weekly reasoning safety | 1 | PASS |
| What-if read-only safety | 1 | PASS |
| What-if malformed/timeout fallback | 2 | PASS |
| Intake grounding and no-mutation safety | 2 | PASS |
| Intake malformed/timeout/ungrounded fallback | 3 | PASS |
| Mobile intake tagged route contract | 14 | PASS |
| Mobile intake context/auth/AI failure safety | 5 | PASS |
| Behavior-learning safety | 4 | PASS |
| Behavior prompt privacy | 1 | PASS |
| Training-summary grounding and privacy | 3 | PASS |
| Training-summary invalid/timeout fallback | 2 | PASS |

## Enforced guarantees

- AI explanations cannot change the deterministic selected workout.
- Daily explanations cannot contradict the selected action.
- Daily, weekly, behavior, What-if, intake, and training-summary outputs match
  their schemas.
- Fallback output contains no medical claims.
- Weekly reasoning cannot mutate the recalibration trace.
- Intake changes require exact source grounding, remain drafts until explicit
  confirmation, and cannot mutate request or persisted state while parsing.
- Sparse, malformed, timed-out, unavailable, and ungrounded intake output
  cannot invent or apply a change.
- Mobile intake routes schedule, availability, travel, workout-swap, goal,
  preferred-day, recovery, caution, missed-workout, reflection, explanation,
  ambiguous, unsupported, and unsafe notes without mutation. Strict context,
  strict-auth rejection, and AI failure fallbacks pass.
- Sparse behavior history emits a limited-history warning and cannot claim
  moderate or high confidence.
- Weekly/monthly reviews derive metrics deterministically from bounded outcome
  fields, exclude raw notes, remain read-only, and reject invented AI facts.
- The baseline suite runs with `KINETIC_AI_MODE=fallback`; live AI is never
  required for a passing demo.

## Reproduce

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals.generate_report
```

Optional local Ollama benchmarking is reported separately and never blocks
the deterministic release gate. Run
`.\.venv\Scripts\python.exe -m evals.benchmark_intake_live` to require two
identical model-backed passes across eight intake cases, exact expected values,
request immutability, no fallback, and the 24-second server budget.

## Additional product gates

Frontend smoke coverage includes typed privacy-conscious instrumentation,
returning-user sign-in hydration ordering, Apple Health CSV import bounding and
note-dropping, and plan-safety invariants across race distance, experience
level, and very low starting mileage.

The live Firebase two-session persistence gate is closed: Cloud Firestore is
enabled for `kinetic-aca73`, rules are deployed, and live QA verifies
cross-session hydration, account isolation, local-cache ownership, and deletion
tombstones after reload and second-origin sign-in. Frontend persistence smoke
coverage also asserts signed-in delete failures do not silently wipe local
cache before Firebase tombstones are confirmed.

Beta hardening includes a repeatable local readiness check and handoff matrix.
`npm run beta:readiness` verifies lockfile presence, direct dependency pinning,
protected QA artifact hygiene, and runbook/matrix presence. The connected
`npm run beta:audit` advisory gate passes with no moderate/high/critical npm
advisories. Re-run both gates after package changes.

Telemetry QA exercises every typed product event family with safe values and
intentionally unsafe extra fields, then proves capped local storage and
write/remove failure isolation. Final beta hardening adds hosted preflight,
rollback, and triage guidance without weakening authentication, Firestore
owner-only rules, UID scoping, deletion tombstones, deterministic fallback, or
bounded AI validation.
