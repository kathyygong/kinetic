# Kinetic Deterministic AI Eval Report

Generated: 2026-06-27

## Result

**PASS — all 13 deterministic fallback cases satisfied the demo safety gates.**

| Gate group | Cases | Result |
| --- | ---: | --- |
| AI runtime fallback | 1 | PASS |
| Daily reasoning safety | 4 | PASS |
| Weekly reasoning safety | 1 | PASS |
| What-if read-only safety | 1 | PASS |
| What-if malformed/timeout fallback | 2 | PASS |
| Behavior-learning safety | 4 | PASS |

## Enforced guarantees

- AI explanations cannot change the deterministic selected workout.
- Daily explanations cannot contradict the selected action.
- Daily, weekly, and behavior outputs match their required schemas.
- Fallback output contains no medical claims.
- Weekly reasoning cannot mutate the recalibration trace.
- Sparse behavior history emits a limited-history warning and cannot claim
  moderate or high confidence.
- The baseline suite runs with `KINETIC_AI_MODE=fallback`; live AI is never
  required for a passing demo.

## Reproduce

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m evals._gates
.\.venv\Scripts\python.exe -m evals.generate_report
```

Optional local Ollama benchmarking is reported separately and never blocks
the deterministic release gate.
