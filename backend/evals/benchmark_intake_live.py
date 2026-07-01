"""Optional live-Ollama release probe for bounded intake.

Run from ``backend`` with:
    python -m evals.benchmark_intake_live

Unlike deterministic gates, this requires the configured intake model.
"""

from __future__ import annotations

import os
import time
from copy import deepcopy
from datetime import date
from math import ceil

from app.intake_parser import (
    IntakeContext,
    IntakeDraft,
    IntakeParseRequest,
    intake_model,
    parse_intake,
    warm_intake_model,
)

CASES = [
    (
        "schedule + availability",
        "I only have 35 minutes on Thursday, and I prefer to run Monday, "
        "Thursday, and Saturday.",
        "ready",
        {
            "schedule": ["mon", "thu", "sat"],
            "availability": [("thu", 35, False)],
        },
    ),
    (
        "goal bundle",
        "I am training for a half marathon on 2026-10-18 and want to run "
        "30 miles per week.",
        "ready",
        {
            "goals": {
                "race_distance": "half",
                "target_date": "2026-10-18",
                "weekly_mileage": 30.0,
            }
        },
    ),
    (
        "experience",
        "I am an advanced runner.",
        "ready",
        {"experience": "advanced"},
    ),
    (
        "availability",
        "I have 40 minutes on Tuesday.",
        "ready",
        {"availability": [("tue", 40, False)]},
    ),
    (
        "zero availability",
        "I cannot run on Friday.",
        "ready",
        {"availability": [("fri", 0, False)]},
    ),
    (
        "easy only",
        "Easy-only on Wednesday.",
        "ready",
        {"availability": [("wed", None, True)]},
    ),
    (
        "sparse ambiguity",
        "Things are weird next month.",
        "needs_clarification",
        {},
    ),
    (
        "unsupported recovery",
        "My knee hurts and I want a recovery recommendation.",
        "unsupported",
        {},
    ),
]


def main() -> None:
    os.environ["KINETIC_AI_MODE"] = "local_ollama"
    model = intake_model()
    if not model:
        raise SystemExit("INTAKE_OLLAMA_MODEL is not configured")

    print(f"Warming {model}...")
    warm_intake_model()
    repeats = max(1, int(os.environ.get("INTAKE_LIVE_REPEATS", "2")))
    latencies: list[float] = []
    context = IntakeContext(today=date(2026, 6, 30))
    stable_drafts: dict[str, dict] = {}
    for run in range(1, repeats + 1):
        for name, note, expected_status, expected in CASES:
            payload = IntakeParseRequest(text=note, context=context)
            before = deepcopy(payload.model_dump())
            started = time.monotonic()
            result = parse_intake(payload)
            elapsed = time.monotonic() - started
            latencies.append(elapsed)
            if payload.model_dump() != before:
                raise AssertionError(f"{name}: parser mutated its request")
            if result.fallback_used or result.source != "ollama":
                raise AssertionError(f"{name}: model path fell back")
            if result.draft.status != expected_status:
                raise AssertionError(
                    f"{name}: expected {expected_status}, "
                    f"got {result.draft.status}"
                )
            actual = _draft_values(result.draft)
            if actual != expected:
                raise AssertionError(
                    f"{name}: expected values {expected}, got {actual}"
                )
            draft = result.draft.model_dump()
            if name in stable_drafts and stable_drafts[name] != draft:
                raise AssertionError(f"{name}: draft changed across repeats")
            stable_drafts[name] = draft
            print(f"PASS run={run} {name:24s} {elapsed:5.2f}s")

    if max(latencies) >= 24:
        raise AssertionError(
            f"live intake exceeded 24s server budget: {max(latencies):.2f}s"
        )
    p95 = sorted(latencies)[ceil(len(latencies) * 0.95) - 1]
    print(
        f"OK live intake model={model} cases={len(CASES)} repeats={repeats} "
        f"p95={p95:.2f}s max={max(latencies):.2f}s"
    )


def _draft_values(draft: IntakeDraft) -> dict:
    values: dict = {}
    if draft.goal_changes:
        values["goals"] = {
            change.field: change.value for change in draft.goal_changes
        }
    if draft.schedule_changes:
        values["schedule"] = draft.schedule_changes[0].value
    if draft.availability_changes:
        values["availability"] = [
            (change.day, change.available_minutes, change.easy_only)
            for change in draft.availability_changes
        ]
    if draft.preference_changes:
        values["experience"] = draft.preference_changes[0].value
    return values


if __name__ == "__main__":
    main()
