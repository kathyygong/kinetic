"""Shared deterministic authority for Mobile Phase 6 plan generation.

The generator is intentionally storage-neutral.  It accepts only bounded
planning inputs, emits an ISO-dated candidate snapshot plus authoritative week
phase metadata, and leaves persistence to the independently validated
``mobile-plan-lifecycle.v1`` flow.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Literal

from pydantic import Field, model_validator

from .mobile_plan import MobilePlanSnapshot, MobilePlanWorkout, StrictModel
from .mobile_plan_v2 import (
    MobilePlanningInputs,
    MobilePlanSnapshotV2,
    build_plan_metadata,
)


RaceDistance = Literal["5k", "10k", "half", "marathon"]
Experience = Literal["beginner", "intermediate", "advanced"]
PlanningDay = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WeekPhase = Literal["build", "recovery", "taper", "race"]
GenerationMode = Literal["initial", "regenerate_future"]
ExplanationCode = Literal[
    "base_volume",
    "preferred_days_applied",
    "recovery_load",
    "taper_load",
    "race_week",
    "completed_history_preserved",
    "future_workouts_regenerated",
]


class MobilePlanGenerationRequest(StrictModel):
    schema_version: Literal["mobile-plan-generation.v1"]
    platform: Literal["web", "ios"]
    mode: GenerationMode
    planning_date: date
    race_distance: RaceDistance
    target_date: date
    experience_level: Experience
    weekly_mileage: float | None = Field(default=None, ge=1, le=150)
    preferred_days: list[PlanningDay] = Field(default_factory=list, max_length=7)
    personal_bests_seconds: dict[RaceDistance, int] = Field(default_factory=dict)
    goal_revision: int = Field(ge=1)
    current_plan: MobilePlanSnapshot | None = None

    @model_validator(mode="after")
    def validate_generation_context(self) -> "MobilePlanGenerationRequest":
        if len(self.preferred_days) != len(set(self.preferred_days)):
            raise ValueError("preferred days must be unique")
        if any(value < 180 or value > 86_400 for value in self.personal_bests_seconds.values()):
            raise ValueError("personal bests must be between 180 and 86400 seconds")
        if self.target_date < self.planning_date + timedelta(days=21):
            raise ValueError("target date must be at least 21 days after planning date")
        if self.mode == "initial" and self.current_plan is not None:
            raise ValueError("initial generation cannot include a current plan")
        if self.mode == "regenerate_future" and self.current_plan is None:
            raise ValueError("future regeneration requires a current plan")
        if self.current_plan:
            races = [workout for workout in self.current_plan.workouts if workout.type == "race"]
            if len(races) != 1 or races[0].date != self.target_date:
                raise ValueError("future regeneration must preserve the current race date")
            if self.goal_revision not in {
                self.current_plan.goal_revision,
                self.current_plan.goal_revision + 1,
            }:
                raise ValueError("future regeneration has an invalid goal revision")
        return self


class MobilePlanWeekMetadata(StrictModel):
    week_number: int = Field(ge=1, le=20)
    phase: WeekPhase
    start_date: date
    end_date: date
    workout_ids: list[str] = Field(min_length=1, max_length=5)
    explanation_codes: list[ExplanationCode] = Field(min_length=1, max_length=4)


class MobilePlanGenerationResponse(StrictModel):
    schema_version: Literal["mobile-plan-generation.v1"] = "mobile-plan-generation.v1"
    mode: GenerationMode
    source: Literal["deterministic_shared"] = "deterministic_shared"
    mutation_performed: Literal[False] = False
    candidate_plan: MobilePlanSnapshot
    weeks: list[MobilePlanWeekMetadata] = Field(min_length=4, max_length=20)
    explanation_codes: list[ExplanationCode] = Field(min_length=1, max_length=7)


class MobilePlanGenerationRequestV2(StrictModel):
    schema_version: Literal["mobile-plan-generation.v2"]
    platform: Literal["web", "ios"]
    mode: GenerationMode
    planning_date: date
    planning_inputs: MobilePlanningInputs
    current_plan: MobilePlanSnapshotV2 | MobilePlanSnapshot | None = None

    @model_validator(mode="after")
    def validate_generation_context(self) -> "MobilePlanGenerationRequestV2":
        inputs = self.planning_inputs
        if inputs.target_date < self.planning_date + timedelta(days=21):
            raise ValueError("target date must be at least 21 days after planning date")
        if self.mode == "initial" and self.current_plan is not None:
            raise ValueError("initial generation cannot include a current plan")
        if self.mode == "regenerate_future" and self.current_plan is None:
            raise ValueError("future regeneration requires a current plan")
        if self.current_plan:
            races = [workout for workout in self.current_plan.workouts if workout.type == "race"]
            if len(races) != 1 or races[0].date != inputs.target_date:
                raise ValueError("future regeneration must preserve the current race date")
            if inputs.revision not in {
                self.current_plan.goal_revision,
                self.current_plan.goal_revision + 1,
            }:
                raise ValueError("future regeneration has an invalid planning revision")
        return self


class MobilePlanGenerationResponseV2(StrictModel):
    schema_version: Literal["mobile-plan-generation.v2"] = "mobile-plan-generation.v2"
    mode: GenerationMode
    source: Literal["deterministic_shared"] = "deterministic_shared"
    mutation_performed: Literal[False] = False
    candidate_plan: MobilePlanSnapshotV2


_DAY_INDEX = {day: index for index, day in enumerate(("mon", "tue", "wed", "thu", "fri", "sat", "sun"))}
_WORKOUTS_PER_WEEK = {"beginner": 3, "intermediate": 4, "advanced": 5}
_ESTIMATED_WEEKLY_MILES = {"beginner": 15.0, "intermediate": 25.0, "advanced": 40.0}
_MAX_GROWTH = {"5k": 1.5, "10k": 1.5, "half": 1.6, "marathon": 1.8}
_MIN_WEEKLY_MILES = {"5k": 0.0, "10k": 0.0, "half": 18.0, "marathon": 25.0}
_LONG_RUN_VOLUME_CAP = {"5k": 0.30, "10k": 0.30, "half": 0.40, "marathon": 0.50}
_LONG_RUN_MAX = {"5k": 8.0, "10k": 10.0, "half": 14.0, "marathon": 22.0}
_LONG_RUN_PEAK_OFFSET = {"5k": 1, "10k": 1, "half": 2, "marathon": 3}
_LONG_RUN_BUMP = {"5k": 0.85, "10k": 1.0, "half": 1.1, "marathon": 1.25}
_RACE_MILES = {"5k": 3.1, "10k": 6.2, "half": 13.1, "marathon": 26.2}
_TAPER = {"5k": [0.7], "10k": [0.7], "half": [0.85, 0.6], "marathon": [0.8, 0.65, 0.5]}
_TEMPLATES = {
    3: [(1, "easy"), (3, None), (6, "long_run")],
    4: [(0, "easy"), (2, None), (4, "easy"), (6, "long_run")],
    5: [(0, "easy"), (1, None), (3, "easy"), (4, "easy"), (6, "long_run")],
}
_RACE_DISTANCE_MILES = {"5k": 3.107, "10k": 6.214, "half": 13.109, "marathon": 26.219}
_IMPROVEMENT = {"beginner": 0.045, "intermediate": 0.035, "advanced": 0.025}


def generate_mobile_plan(request: MobilePlanGenerationRequest) -> MobilePlanGenerationResponse:
    """Generate a deterministic candidate and authoritative phase metadata."""

    day_count = (request.target_date - request.planning_date).days + 1
    total_weeks = min(20, max(4, math.ceil(day_count / 7)))
    template = _remap_template(
        _TEMPLATES[_WORKOUTS_PER_WEEK[request.experience_level]],
        request.preferred_days,
    )
    taper = _TAPER[request.race_distance]
    taper_start = max(0, total_weeks - len(taper))
    race_week_start = request.target_date - timedelta(days=request.target_date.weekday())
    plan_start = race_week_start - timedelta(days=(total_weeks - 1) * 7)
    base = max(
        request.weekly_mileage
        or _ESTIMATED_WEEKLY_MILES[request.experience_level],
        _MIN_WEEKLY_MILES[request.race_distance],
    )
    max_growth = _MAX_GROWTH[request.race_distance]
    long_cap = min(
        _LONG_RUN_MAX[request.race_distance],
        base * max_growth * _LONG_RUN_VOLUME_CAP[request.race_distance],
    )
    long_start = min(base * 0.3 * _LONG_RUN_BUMP[request.race_distance], long_cap)
    peak_week = max(0, total_weeks - 1 - _LONG_RUN_PEAK_OFFSET[request.race_distance])
    easy_count = sum(1 for _, kind in template if kind == "easy")
    workouts: list[MobilePlanWorkout] = []
    weeks: list[MobilePlanWeekMetadata] = []

    for index in range(total_weeks):
        is_race = index == total_weeks - 1
        is_taper = index >= taper_start
        is_recovery = (
            not is_taper
            and total_weeks >= 6
            and total_weeks - len(taper) >= 4
            and index > 0
            and (index + 1) % 4 == 0
        )
        phase: WeekPhase = "race" if is_race else "taper" if is_taper else "recovery" if is_recovery else "build"
        multiplier = taper[index - taper_start] if is_taper else 0.8 if is_recovery else 1.0
        growth = min(1 + 0.1 * index, max_growth)
        week_miles = base * growth * multiplier
        if peak_week <= 0:
            long_miles = long_cap * (multiplier if is_taper else 1)
        elif index <= peak_week:
            long_miles = long_start + (long_cap - long_start) * index / peak_week
            if is_recovery:
                long_miles *= 0.8
        else:
            long_miles = long_cap * multiplier
        long_miles = min(long_miles, long_cap)
        quality_miles = week_miles * 0.2
        easy_miles = max(0.0, week_miles - long_miles - quality_miles) / max(1, easy_count)
        easy_cap = min(long_miles * 0.9, week_miles * 0.4)
        if easy_miles > easy_cap:
            overflow = (easy_miles - easy_cap) * easy_count
            easy_miles = easy_cap
            long_miles = min(long_miles + overflow, long_cap)
        paces = _training_paces(request, index / (total_weeks - 1) if total_weeks > 1 else 1)
        week_start = plan_start + timedelta(days=index * 7)
        week_workouts: list[MobilePlanWorkout] = []

        for slot, (day_index, template_type) in enumerate(template):
            workout_type = template_type or ("tempo" if index % 2 == 0 else "intervals")
            workout_date = week_start + timedelta(days=day_index)
            if is_race and workout_type == "long_run":
                workout_type = "race"
                workout_date = request.target_date
            if is_race and workout_type != "race" and workout_date >= request.target_date:
                continue
            distance = (
                _RACE_MILES[request.race_distance]
                if workout_type == "race"
                else _round_half(long_miles)
                if workout_type == "long_run"
                else _round_half(quality_miles)
                if workout_type in ("tempo", "intervals")
                else _round_half(easy_miles)
            )
            pace_minutes = paces["tempo" if workout_type == "race" else workout_type]
            workout = MobilePlanWorkout(
                id=f"w-{index + 1}-{slot + 1}-{workout_date.isoformat()}",
                date=workout_date,
                type=workout_type,
                status="scheduled",
                distance_miles=distance,
                duration_minutes=min(480, _round_five(distance * pace_minutes)),
                pace_seconds_per_mile=_round_int(pace_minutes * 60),
                reason_code="race_day" if workout_type == "race" else "base_plan",
            )
            workouts.append(workout)
            week_workouts.append(workout)

        explanation: list[ExplanationCode] = ["base_volume"]
        if request.preferred_days:
            explanation.append("preferred_days_applied")
        if phase == "recovery":
            explanation.append("recovery_load")
        elif phase == "taper":
            explanation.append("taper_load")
        elif phase == "race":
            explanation.append("race_week")
        weeks.append(
            MobilePlanWeekMetadata(
                week_number=index + 1,
                phase=phase,
                start_date=week_start,
                end_date=week_start + timedelta(days=6),
                workout_ids=[workout.id for workout in week_workouts],
                explanation_codes=explanation,
            )
        )

    hard_types = {"tempo", "intervals", "long_run"}
    workouts = [
        workout
        for workout in workouts
        if not (
            workout.type in hard_types
            and workout.date < request.target_date
            and (request.target_date - workout.date).days < 2
        )
    ]
    retained_ids = {workout.id for workout in workouts}
    weeks = [
        week.model_copy(update={"workout_ids": [item for item in week.workout_ids if item in retained_ids]})
        for week in weeks
    ]

    explanations: list[ExplanationCode] = ["base_volume"]
    if request.preferred_days:
        explanations.append("preferred_days_applied")
    if any(week.phase == "recovery" for week in weeks):
        explanations.append("recovery_load")
    if any(week.phase == "taper" for week in weeks):
        explanations.append("taper_load")
    explanations.append("race_week")

    if request.current_plan:
        completed = [workout for workout in request.current_plan.workouts if workout.status == "completed"]
        race = [workout for workout in request.current_plan.workouts if workout.type == "race"]
        protected_ids = {workout.id for workout in completed + race}
        protected_dates = {workout.date for workout in completed + race}
        future = [
            workout.model_copy(update={"reason_code": "future_regeneration"})
            for workout in workouts
            if workout.type != "race"
            and workout.id not in protected_ids
            and workout.date not in protected_dates
        ]
        workouts = completed + future + race
        explanations.extend(["completed_history_preserved", "future_workouts_regenerated"])

    current = request.current_plan
    candidate = MobilePlanSnapshot(
        id=current.id if current else f"plan-{request.race_distance}-{request.target_date.isoformat()}",
        version=current.version + 1 if current else 1,
        status=current.status if current else "draft",
        goal_revision=request.goal_revision,
        workouts=sorted(workouts, key=lambda workout: (workout.date, workout.id)),
    )
    weeks = [
        week.model_copy(
            update={
                "workout_ids": [
                    workout.id
                    for workout in candidate.workouts
                    if week.start_date <= workout.date <= week.end_date
                ]
            }
        )
        for week in weeks
    ]
    return MobilePlanGenerationResponse(
        mode=request.mode,
        candidate_plan=candidate,
        weeks=weeks,
        explanation_codes=list(dict.fromkeys(explanations)),
    )


def generate_mobile_plan_v2(
    request: MobilePlanGenerationRequestV2,
) -> MobilePlanGenerationResponseV2:
    """Generate a v2 candidate with persisted metadata and availability."""

    inputs = request.planning_inputs
    constraints = {entry.day: entry for entry in inputs.weekly_availability}
    all_days: list[PlanningDay] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    usable = [day for day in all_days if constraints.get(day) is None or constraints[day].available_minutes > 0]
    workout_count = _WORKOUTS_PER_WEEK[inputs.experience_level]
    if len(usable) < workout_count:
        raise ValueError("weekly availability leaves too few training days")
    preferred = [day for day in inputs.preferred_days if day in usable]
    scheduling_days = preferred if len(preferred) >= workout_count else usable
    current = request.current_plan
    legacy_current = (
        MobilePlanSnapshot.model_validate(current.model_dump(exclude={"metadata"}))
        if current is not None
        else None
    )
    legacy = MobilePlanGenerationRequest(
        schema_version="mobile-plan-generation.v1",
        platform=request.platform,
        mode=request.mode,
        planning_date=request.planning_date,
        race_distance=inputs.race_distance,
        target_date=inputs.target_date,
        experience_level=inputs.experience_level,
        weekly_mileage=inputs.weekly_mileage,
        preferred_days=scheduling_days,
        personal_bests_seconds=inputs.personal_bests_seconds,
        goal_revision=inputs.revision,
        current_plan=legacy_current,
    )
    generated = generate_mobile_plan(legacy)
    day_names = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    adjusted: list[MobilePlanWorkout] = []
    for workout in generated.candidate_plan.workouts:
        constraint = constraints.get(day_names[workout.date.weekday()])
        if workout.type == "race" or constraint is None:
            adjusted.append(workout)
            continue
        workout_type = "easy" if constraint.easy_only else workout.type
        duration = workout.duration_minutes
        distance = workout.distance_miles
        if constraint.available_minutes and duration > constraint.available_minutes:
            duration = max(5, constraint.available_minutes - (constraint.available_minutes % 5))
            pace = workout.pace_seconds_per_mile or 600
            distance = max(0.5, math.floor((duration * 60 / pace) * 2) / 2)
        adjusted.append(
            workout.model_copy(
                update={
                    "type": workout_type,
                    "duration_minutes": duration,
                    "distance_miles": distance,
                    "reason_code": "availability",
                }
            )
        )
    base = generated.candidate_plan.model_copy(update={"workouts": adjusted})
    metadata = build_plan_metadata(
        base,
        inputs,
        regenerated=request.mode == "regenerate_future",
    )
    candidate = MobilePlanSnapshotV2.model_validate(
        {**base.model_dump(), "metadata": metadata.model_dump()}
    )
    return MobilePlanGenerationResponseV2(mode=request.mode, candidate_plan=candidate)


def _remap_template(
    template: list[tuple[int, str | None]],
    preferred_days: list[PlanningDay],
) -> list[tuple[int, str | None]]:
    ranks = sorted({_DAY_INDEX[day] for day in preferred_days})
    if len(ranks) < len(template):
        return list(template)
    remaining = set(ranks)
    mapped = list(template)
    for index in sorted(range(len(mapped)), key=lambda item: mapped[item][0], reverse=True):
        original_day, kind = mapped[index]
        selected = min(remaining, key=lambda day: (abs(day - original_day), day))
        mapped[index] = (selected, kind)
        remaining.remove(selected)
    return mapped


def _training_paces(
    request: MobilePlanGenerationRequest,
    progress: float,
) -> dict[str, float]:
    candidates = [
        seconds * (3.107 / _RACE_DISTANCE_MILES[distance]) ** 1.06
        for distance, seconds in request.personal_bests_seconds.items()
        if seconds > 0
    ]
    current = min(candidates) if candidates else 1500.0
    projected = current * (1 - _IMPROVEMENT[request.experience_level])
    seconds = current + (projected - current) * min(1.0, max(0.0, progress))
    base = seconds / 60 / 3.107
    return {
        "easy": _round_two(base + 1.75),
        "tempo": _round_two(base + 0.5),
        "intervals": _round_two(base - 0.08),
        "long_run": _round_two(base + 1.5),
    }


def _round_int(value: float) -> int:
    return math.floor(value + 0.5)


def _round_two(value: float) -> float:
    return math.floor(value * 100 + 0.5) / 100


def _round_half(value: float) -> float:
    return max(0.5, math.floor(value * 2 + 0.5) / 2)


def _round_five(value: float) -> int:
    return max(5, math.floor(value / 5 + 0.5) * 5)
