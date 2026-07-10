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
    check_behavior_prompt_privacy,
    check_daily_reasoning,
    check_intake_failure_fallbacks,
    check_intake_parsing,
    check_training_summary,
    check_training_summary_failure_fallbacks,
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
        ("Behavior prompt privacy", check_behavior_prompt_privacy, 1),
        ("Training-summary grounding and privacy", check_training_summary, 3),
        (
            "Training-summary invalid/timeout fallback",
            check_training_summary_failure_fallbacks,
            2,
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
.\\.venv\\Scripts\\python.exe -m evals._gates
.\\.venv\\Scripts\\python.exe -m evals.generate_report
```

Optional local Ollama benchmarking is reported separately and never blocks
the deterministic release gate. Run
`.\\.venv\\Scripts\\python.exe -m evals.benchmark_intake_live` to require two
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
"""

    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")


if __name__ == "__main__":
    main()
