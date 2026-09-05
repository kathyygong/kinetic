"""Curated datasets for live model-quality evaluation.

These cases contain synthetic product inputs only. They are versioned so a
checked-in scorecard always identifies the dataset used to produce it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping


DATASET_VERSION = "model-quality-2026-09-04.v1"


@dataclass(frozen=True)
class IntakeQualityCase:
    id: str
    note: str
    expected_status: Literal["ready", "needs_clarification", "unsupported"]
    expected_values: Mapping[str, Any]


@dataclass(frozen=True)
class SummaryQualityCase:
    id: str
    period: Literal["weekly", "monthly"]
    as_of: str
    events: tuple[Mapping[str, Any], ...]
    confirmed_preferences: tuple[str, ...] = ()


INTAKE_QUALITY_CASES: tuple[IntakeQualityCase, ...] = (
    IntakeQualityCase(
        id="intake.schedule_and_availability",
        note=(
            "I only have 35 minutes on Thursday, and I prefer to run Monday, "
            "Thursday, and Saturday."
        ),
        expected_status="ready",
        expected_values={
            "schedule": ["mon", "thu", "sat"],
            "availability": [("thu", 35, False)],
        },
    ),
    IntakeQualityCase(
        id="intake.goal_bundle",
        note=(
            "I am training for a half marathon on 2026-10-18 and want to run "
            "30 miles per week."
        ),
        expected_status="ready",
        expected_values={
            "goals": {
                "race_distance": "half",
                "target_date": "2026-10-18",
                "weekly_mileage": 30.0,
            }
        },
    ),
    IntakeQualityCase(
        id="intake.experience",
        note="I am an advanced runner.",
        expected_status="ready",
        expected_values={"experience": "advanced"},
    ),
    IntakeQualityCase(
        id="intake.availability",
        note="I have 40 minutes on Tuesday.",
        expected_status="ready",
        expected_values={"availability": [("tue", 40, False)]},
    ),
    IntakeQualityCase(
        id="intake.zero_availability",
        note="I cannot run on Friday.",
        expected_status="ready",
        expected_values={"availability": [("fri", 0, False)]},
    ),
    IntakeQualityCase(
        id="intake.easy_only",
        note="Easy-only on Wednesday.",
        expected_status="ready",
        expected_values={"availability": [("wed", None, True)]},
    ),
    IntakeQualityCase(
        id="intake.ambiguous",
        note="Things are weird next month.",
        expected_status="needs_clarification",
        expected_values={},
    ),
    IntakeQualityCase(
        id="intake.unsupported_recovery",
        note="My knee hurts and I want a recovery recommendation.",
        expected_status="unsupported",
        expected_values={},
    ),
)


SUMMARY_QUALITY_CASES: tuple[SummaryQualityCase, ...] = (
    SummaryQualityCase(
        id="summary.weekly_consistent",
        period="weekly",
        as_of="2026-08-31",
        confirmed_preferences=("Prefer long runs on Saturday",),
        events=(
            {"date": "2026-08-25", "completed": True, "distance_miles": 4, "duration_minutes": 38, "perceived_effort": 4, "recovery_score": 0.72},
            {"date": "2026-08-26", "completed": True, "distance_miles": 5, "duration_minutes": 45, "perceived_effort": 5, "recovery_score": 0.73},
            {"date": "2026-08-27", "completed": False, "recovery_score": 0.70},
            {"date": "2026-08-29", "completed": True, "distance_miles": 9, "duration_minutes": 84, "perceived_effort": 6, "recovery_score": 0.74},
            {"date": "2026-08-30", "completed": True, "distance_miles": 3, "duration_minutes": 29, "perceived_effort": 3, "recovery_score": 0.71},
        ),
    ),
    SummaryQualityCase(
        id="summary.weekly_declining_recovery",
        period="weekly",
        as_of="2026-08-31",
        events=(
            {"date": "2026-08-25", "completed": True, "distance_miles": 5, "duration_minutes": 44, "perceived_effort": 5, "recovery_score": 0.82},
            {"date": "2026-08-26", "completed": True, "distance_miles": 6, "duration_minutes": 53, "perceived_effort": 6, "recovery_score": 0.78},
            {"date": "2026-08-27", "completed": True, "distance_miles": 4, "duration_minutes": 37, "perceived_effort": 6, "recovery_score": 0.74},
            {"date": "2026-08-28", "completed": False, "recovery_score": 0.65},
            {"date": "2026-08-29", "completed": True, "distance_miles": 8, "duration_minutes": 75, "perceived_effort": 8, "recovery_score": 0.61},
            {"date": "2026-08-31", "completed": False, "recovery_score": 0.58},
        ),
    ),
    SummaryQualityCase(
        id="summary.monthly_sparse",
        period="monthly",
        as_of="2026-08-31",
        events=(
            {"date": "2026-08-05", "completed": True, "distance_miles": 3, "duration_minutes": 31, "perceived_effort": 4},
            {"date": "2026-08-16", "completed": False},
            {"date": "2026-08-28", "completed": True, "distance_miles": 5, "duration_minutes": 48, "perceived_effort": 5},
        ),
    ),
)
