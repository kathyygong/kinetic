"""Generate or verify the human-readable system safety and contract report.

The report is rendered from the same canonical gate registry used by
``python -m evals._gates``. If a gate fails, generation fails and the existing
report is left untouched. ``--check`` runs the gates and verifies that the
checked-in report matches without rewriting it.
"""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path

from evals._gates import GateResult, run_gates


ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "EVAL_REPORT.md"
_GENERATED_LINE = re.compile(r"^Generated: \d{4}-\d{2}-\d{2}$", re.MULTILINE)


def render_report(results: tuple[GateResult, ...], generated_on: date) -> str:
    """Render a report from observed executable gate results."""

    assertion_total = sum(result.assertions for result in results)
    rows = "\n".join(
        f"| `{result.id}` | {result.label} | {result.assertions} | PASS |"
        for result in results
    )
    return f"""# Kinetic AI System Safety and Contract Report

Generated: {generated_on.isoformat()}

## Result

**PASS — all {len(results)} deterministic gate groups and {assertion_total}
explicit safety assertions passed.**

| Gate ID | Gate group | Assertions | Result |
| --- | --- | ---: | --- |
{rows}

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
.\\.venv\\Scripts\\python.exe -m evals._gates

# Run the same registry and verify this checked-in report is current.
.\\.venv\\Scripts\\python.exe -m evals.generate_report --check

# Regenerate the report after an intentional gate change.
.\\.venv\\Scripts\\python.exe -m evals.generate_report
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
"""


def _normalise_generated_date(report: str) -> str:
    """Ignore expected date-only churn when checking report freshness."""

    return _GENERATED_LINE.sub("Generated: <date>", report)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the checked-in report matches the executable gates",
    )
    args = parser.parse_args()

    results = run_gates(emit_progress=True)
    report = render_report(results, date.today())

    if args.check:
        if not REPORT_PATH.exists():
            raise SystemExit(f"Eval report is missing: {REPORT_PATH}")
        existing = REPORT_PATH.read_text(encoding="utf-8")
        if _normalise_generated_date(existing) != _normalise_generated_date(report):
            raise SystemExit(
                "EVAL_REPORT.md is stale. Run "
                "`python -m evals.generate_report` and commit the result."
            )
        print(
            f"PASS eval report is current "
            f"({len(results)} groups, "
            f"{sum(result.assertions for result in results)} assertions)"
        )
        return

    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")


if __name__ == "__main__":
    main()
