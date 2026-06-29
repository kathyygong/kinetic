"""Generate the human-readable deterministic AI safety report.

The report is intentionally derived from the same executable gates used by
local verification. If a gate fails, report generation fails and the existing
report is left untouched.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from evals._gates import (
    check_ai_status,
    check_behavior_insights,
    check_daily_reasoning,
    check_intake_failure_fallbacks,
    check_intake_parsing,
    check_what_if,
    check_what_if_failure_fallbacks,
    check_weekly_reasoning,
)
from evals.eval_cases import BEHAVIOR_INSIGHT_CASES, DAILY_REASONING_CASES


ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "EVAL_REPORT.md"


def main() -> None:
    checks = [
        ("AI runtime fallback", check_ai_status, 1),
        ("Daily reasoning safety", check_daily_reasoning, len(DAILY_REASONING_CASES)),
        ("Weekly reasoning safety", check_weekly_reasoning, 1),
        ("What-if read-only safety", check_what_if, 1),
        ("What-if malformed/timeout fallback", check_what_if_failure_fallbacks, 2),
        ("Intake grounding and no-mutation safety", check_intake_parsing, 2),
        (
            "Intake malformed/timeout/ungrounded fallback",
            check_intake_failure_fallbacks,
            3,
        ),
        (
            "Behavior-learning safety",
            check_behavior_insights,
            len(BEHAVIOR_INSIGHT_CASES),
        ),
    ]

    rows: list[str] = []
    total_cases = 0
    for label, check, case_count in checks:
        check()
        total_cases += case_count
        rows.append(f"| {label} | {case_count} | PASS |")

    report = f"""# Kinetic Deterministic AI Eval Report

Generated: {date.today().isoformat()}

## Result

**PASS — all {total_cases} deterministic fallback cases satisfied the demo safety gates.**

| Gate group | Cases | Result |
| --- | ---: | --- |
{chr(10).join(rows)}

## Enforced guarantees

- AI explanations cannot change the deterministic selected workout.
- Daily explanations cannot contradict the selected action.
- Daily, weekly, behavior, What-if, and intake outputs match their schemas.
- Fallback output contains no medical claims.
- Weekly reasoning cannot mutate the recalibration trace.
- Intake changes require exact source grounding, remain drafts until explicit
  confirmation, and cannot mutate request or persisted state while parsing.
- Sparse, malformed, timed-out, unavailable, and ungrounded intake output
  cannot invent or apply a change.
- Sparse behavior history emits a limited-history warning and cannot claim
  moderate or high confidence.
- The baseline suite runs with `KINETIC_AI_MODE=fallback`; live AI is never
  required for a passing demo.

## Reproduce

From `backend/`:

```powershell
.\\.venv\\Scripts\\python.exe -m evals._gates
.\\.venv\\Scripts\\python.exe -m evals.generate_report
```

Optional local Ollama benchmarking is reported separately and never blocks
the deterministic release gate.
"""

    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")


if __name__ == "__main__":
    main()
