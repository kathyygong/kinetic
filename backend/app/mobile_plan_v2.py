"""Versioned Mobile Phase 5-6 planning and lifecycle authority.

Version 2 keeps authoritative week metadata inside the plan snapshot, carries
bounded weekly availability as a planning input, and returns profile/goal/plan
as one transaction package when planning inputs change.  The v1 contracts stay
available for already-shipped clients and workout-only stored plans.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Literal

from pydantic import Field, model_validator

from .mobile_plan import (
    MobilePlanImpact,
    MobilePlanLifecycleRequest,
    MobilePlanMutation,
    MobilePlanPersistence,
    MobilePlanSnapshot,
    MobilePlanWorkout,
    PriorOperation,
    StrictModel,
    evaluate_mobile_plan_lifecycle,
)


PlanningDay = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
RaceDistance = Literal["5k", "10k", "half", "marathon"]
Experience = Literal["beginner", "intermediate", "advanced"]
WeekPhase = Literal["build", "recovery", "taper", "race"]
ExplanationCode = Literal[
    "base_volume",
    "preferred_days_applied",
    "weekly_availability_applied",
    "recovery_load",
    "taper_load",
    "race_week",
    "completed_history_preserved",
    "future_workouts_regenerated",
]


class MobileWeeklyAvailability(StrictModel):
    day: PlanningDay
    available_minutes: int = Field(ge=0, le=240)
    easy_only: bool

    @model_validator(mode="after")
    def validate_minutes(self) -> "MobileWeeklyAvailability":
        if 0 < self.available_minutes < 15:
            raise ValueError("positive weekly availability must be at least 15 minutes")
        return self


class MobilePlanningInputs(StrictModel):
    revision: int = Field(ge=1)
    race_distance: RaceDistance
    target_date: date
    experience_level: Experience
    weekly_mileage: float | None = Field(default=None, ge=1, le=150)
    preferred_days: list[PlanningDay] = Field(default_factory=list, max_length=7)
    personal_bests_seconds: dict[RaceDistance, int] = Field(default_factory=dict)
    weekly_availability: list[MobileWeeklyAvailability] = Field(
        default_factory=list, max_length=7
    )

    @model_validator(mode="after")
    def validate_inputs(self) -> "MobilePlanningInputs":
        if len(self.preferred_days) != len(set(self.preferred_days)):
            raise ValueError("preferred days must be unique")
        availability_days = [entry.day for entry in self.weekly_availability]
        if len(availability_days) != len(set(availability_days)):
            raise ValueError("weekly availability days must be unique")
        if any(value < 180 or value > 86_400 for value in self.personal_bests_seconds.values()):
            raise ValueError("personal bests must be between 180 and 86400 seconds")
        return self


class MobilePlanWeekMetadataV2(StrictModel):
    week_number: int = Field(ge=1, le=20)
    phase: WeekPhase
    start_date: date
    end_date: date
    workout_ids: list[str] = Field(min_length=1, max_length=7)
    explanation_codes: list[ExplanationCode] = Field(min_length=1, max_length=5)


class MobilePlanMetadataV2(StrictModel):
    plan_version: int = Field(ge=1)
    weeks: list[MobilePlanWeekMetadataV2] = Field(min_length=1, max_length=20)
    explanation_codes: list[ExplanationCode] = Field(min_length=1, max_length=8)


class MobilePlanSnapshotV2(MobilePlanSnapshot):
    metadata: MobilePlanMetadataV2

    @model_validator(mode="after")
    def validate_metadata_version(self) -> "MobilePlanSnapshotV2":
        if self.metadata.plan_version != self.version:
            raise ValueError("plan metadata must be bound to the plan version")
        workout_ids = {workout.id for workout in self.workouts}
        metadata_ids = [item for week in self.metadata.weeks for item in week.workout_ids]
        if len(metadata_ids) != len(set(metadata_ids)) or set(metadata_ids) != workout_ids:
            raise ValueError("plan metadata must cover every workout exactly once")
        return self


class MobilePlanLifecycleRequestV2(StrictModel):
    schema_version: Literal["mobile-plan-lifecycle.v2"]
    platform: Literal["web", "ios"]
    mode: Literal["preview", "commit"]
    operation_id: str = Field(min_length=8, max_length=100)
    request_fingerprint: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=0)
    current_plan: MobilePlanSnapshotV2 | MobilePlanSnapshot | None
    proposed_plan: MobilePlanSnapshotV2
    current_planning_inputs: MobilePlanningInputs | None
    proposed_planning_inputs: MobilePlanningInputs
    mutation: MobilePlanMutation
    prior_operation: PriorOperation | None = None


class MobilePlanPersistenceV2(StrictModel):
    required: bool
    owner_scoped_domains: list[
        Literal["profile", "goal", "plan", "plan_history", "plan_operations"]
    ]
    transaction_preconditions: list[
        Literal[
            "authenticated_owner",
            "current_version_matches",
            "planning_revision_matches",
            "operation_id_absent_or_matching",
        ]
    ]


class MobilePlanLifecycleResponseV2(StrictModel):
    schema_version: Literal["mobile-plan-lifecycle.v2"] = "mobile-plan-lifecycle.v2"
    result: Literal["preview", "commit_ready", "replayed", "conflict", "rejected"]
    mutation_performed: Literal[False] = False
    base_version: int
    proposed_version: int | None
    reason_codes: list[str]
    impact: MobilePlanImpact
    commit_plan: MobilePlanSnapshotV2 | None
    commit_planning_inputs: MobilePlanningInputs | None
    persistence: MobilePlanPersistenceV2


def build_plan_metadata(
    plan: MobilePlanSnapshot,
    inputs: MobilePlanningInputs,
    *,
    regenerated: bool = False,
) -> MobilePlanMetadataV2:
    """Recompute version-bound display metadata from the authoritative plan."""

    by_week: dict[date, list[MobilePlanWorkout]] = defaultdict(list)
    for workout in plan.workouts:
        monday = workout.date - timedelta(days=workout.date.weekday())
        by_week[monday].append(workout)
    ordered = sorted(by_week)
    race = next(workout for workout in plan.workouts if workout.type == "race")
    taper_length = 1 if race.distance_miles < 10 else 2 if race.distance_miles < 20 else 3
    race_week = race.date - timedelta(days=race.date.weekday())
    explanations: list[ExplanationCode] = ["base_volume"]
    if inputs.preferred_days:
        explanations.append("preferred_days_applied")
    if inputs.weekly_availability:
        explanations.append("weekly_availability_applied")
    if regenerated:
        explanations.extend(["completed_history_preserved", "future_workouts_regenerated"])
    weeks: list[MobilePlanWeekMetadataV2] = []
    for index, start in enumerate(ordered):
        weeks_before_race = (race_week - start).days // 7
        if start == race_week:
            phase: WeekPhase = "race"
        elif 0 < weeks_before_race < taper_length:
            phase = "taper"
        elif len(ordered) >= 6 and index > 0 and (index + 1) % 4 == 0:
            phase = "recovery"
        else:
            phase = "build"
        codes: list[ExplanationCode] = ["base_volume"]
        if inputs.preferred_days:
            codes.append("preferred_days_applied")
        if inputs.weekly_availability:
            codes.append("weekly_availability_applied")
        if phase == "race":
            codes.append("race_week")
            if "race_week" not in explanations:
                explanations.append("race_week")
        elif phase == "taper":
            codes.append("taper_load")
            if "taper_load" not in explanations:
                explanations.append("taper_load")
        elif phase == "recovery":
            codes.append("recovery_load")
            if "recovery_load" not in explanations:
                explanations.append("recovery_load")
        weeks.append(
            MobilePlanWeekMetadataV2(
                week_number=index + 1,
                phase=phase,
                start_date=start,
                end_date=start + timedelta(days=6),
                workout_ids=[item.id for item in sorted(by_week[start], key=lambda item: (item.date, item.id))],
                explanation_codes=codes,
            )
        )
    return MobilePlanMetadataV2(
        plan_version=plan.version,
        weeks=weeks,
        explanation_codes=list(dict.fromkeys(explanations)),
    )


def availability_allows(plan: MobilePlanSnapshot, inputs: MobilePlanningInputs) -> bool:
    availability = {entry.day: entry for entry in inputs.weekly_availability}
    day_names = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    for workout in plan.workouts:
        if workout.type == "race" or workout.status == "skipped":
            continue
        constraint = availability.get(day_names[workout.date.weekday()])
        if constraint is None:
            continue
        if constraint.available_minutes == 0 or workout.duration_minutes > constraint.available_minutes:
            return False
        if constraint.easy_only and workout.type != "easy":
            return False
    return True


def _strip_snapshot(plan: MobilePlanSnapshotV2 | MobilePlanSnapshot | None) -> MobilePlanSnapshot | None:
    if plan is None:
        return None
    return MobilePlanSnapshot.model_validate(plan.model_dump(exclude={"metadata"}))


def evaluate_mobile_plan_lifecycle_v2(
    request: MobilePlanLifecycleRequestV2,
) -> MobilePlanLifecycleResponseV2:
    current_inputs = request.current_planning_inputs
    proposed_inputs = request.proposed_planning_inputs
    current_plan = _strip_snapshot(request.current_plan)
    proposed_plan = _strip_snapshot(request.proposed_plan)
    assert proposed_plan is not None

    planning_valid = True
    if current_plan is None:
        planning_valid = current_inputs is None and proposed_inputs.revision == 1
    elif current_inputs is None:
        planning_valid = False
    else:
        planning_valid = current_plan.goal_revision == current_inputs.revision
        if request.mutation.action == "regenerate_future":
            changed = proposed_inputs != current_inputs
            expected = current_inputs.revision + (1 if changed else 0)
            planning_valid = planning_valid and proposed_inputs.revision == expected
        else:
            planning_valid = planning_valid and proposed_inputs == current_inputs
    planning_valid = planning_valid and proposed_plan.goal_revision == proposed_inputs.revision

    legacy = MobilePlanLifecycleRequest(
        schema_version="mobile-plan-lifecycle.v1",
        platform="ios",
        mode=request.mode,
        operation_id=request.operation_id,
        request_fingerprint=request.request_fingerprint,
        expected_version=request.expected_version,
        current_plan=current_plan,
        proposed_plan=proposed_plan,
        mutation=request.mutation,
        prior_operation=request.prior_operation,
    )
    result = evaluate_mobile_plan_lifecycle(legacy)
    if not planning_valid or not availability_allows(proposed_plan, proposed_inputs):
        result = result.model_copy(
            update={
                "result": "rejected",
                "proposed_version": None,
                "reason_codes": ["planning_inputs_conflict" if not planning_valid else "weekly_availability_violation"],
                "commit_plan": None,
                "persistence": MobilePlanPersistence(
                    required=False,
                    owner_scoped_domains=["plan", "plan_history", "plan_operations"],
                    transaction_preconditions=[
                        "authenticated_owner",
                        "current_version_matches",
                        "operation_id_absent_or_matching",
                    ],
                ),
            }
        )
    accepted = result.result in ("preview", "commit_ready")
    commit_plan = None
    commit_inputs = None
    if accepted:
        metadata = build_plan_metadata(
            proposed_plan,
            proposed_inputs,
            regenerated=request.mutation.action == "regenerate_future",
        )
        commit_plan = MobilePlanSnapshotV2.model_validate(
            {**proposed_plan.model_dump(), "metadata": metadata.model_dump()}
        )
        commit_inputs = proposed_inputs
    return MobilePlanLifecycleResponseV2(
        result=result.result,
        base_version=result.base_version,
        proposed_version=result.proposed_version,
        reason_codes=result.reason_codes,
        impact=result.impact,
        commit_plan=commit_plan,
        commit_planning_inputs=commit_inputs,
        persistence=MobilePlanPersistenceV2(
            required=result.result == "commit_ready",
            owner_scoped_domains=["profile", "goal", "plan", "plan_history", "plan_operations"],
            transaction_preconditions=[
                "authenticated_owner",
                "current_version_matches",
                "planning_revision_matches",
                "operation_id_absent_or_matching",
            ],
        ),
    )
