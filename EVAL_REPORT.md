# Kinetic Deterministic AI Eval Report

Generated: 2026-07-01

## Result

**PASS — all 23 deterministic fallback cases satisfied the demo safety gates.**

| Gate group | Cases | Result |
| --- | ---: | --- |
| AI runtime fallback | 1 | PASS |
| Daily reasoning safety | 4 | PASS |
| Weekly reasoning safety | 1 | PASS |
| What-if read-only safety | 1 | PASS |
| What-if malformed/timeout fallback | 2 | PASS |
| Intake grounding and no-mutation safety | 2 | PASS |
| Intake malformed/timeout/ungrounded fallback | 3 | PASS |
| Behavior-learning safety | 4 | PASS |
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

Updated frontend smoke coverage now includes typed privacy-conscious
instrumentation and returning-user sign-in hydration ordering. The live
Firebase two-session persistence gate is unblocked: Cloud Firestore is enabled
for `kinetic-aca73`, rules are deployed, and live QA verifies cross-session
hydration, account isolation, and local-cache ownership. Frontend persistence
smoke coverage now also asserts signed-in delete failures do not silently wipe
local cache before Firebase tombstones are confirmed. A final captured deletion
tombstone reload/second-session proof remains before the remote persistence
gate is closed completely.
