"""Deterministic Mobile Phase 6 plan-lifecycle validation.

The endpoint built on this module is deliberately storage-neutral.  It returns
an authoritative commit package; the authenticated client must persist that
package in one owner-scoped Firestore transaction.  This keeps Firebase Auth
and Firestore as the ownership boundary while preventing SwiftUI (or AI
output) from bypassing plan invariants.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


WorkoutType = Literal["easy", "tempo", "intervals", "long_run", "race"]
WorkoutStatus = Literal["scheduled", "completed", "skipped"]
PlanStatus = Literal["draft", "active", "paused", "completed"]
PlanAction = Literal[
    "generate",
    "save",
    "move",
    "shorten",
    "replace",
    "skip",
    "availability",
    "preferred_day",
    "regenerate_future",
    "pause",
    "resume",
]


class MobilePlanWorkout(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    date: date
    type: WorkoutType
    status: WorkoutStatus
    distance_miles: float = Field(ge=0, le=40)
    duration_minutes: int = Field(ge=0, le=480)
    pace_seconds_per_mile: int | None = Field(default=None, ge=180, le=1800)
    reason_code: Literal[
        "base_plan",
        "availability",
        "preferred_day",
        "runner_edit",
        "future_regeneration",
        "race_day",
    ]


class MobilePlanSnapshot(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    version: int = Field(ge=0)
    status: PlanStatus
    goal_revision: int = Field(ge=1)
    workouts: list[MobilePlanWorkout] = Field(min_length=1, max_length=200)


class MobilePlanMutation(StrictModel):
    action: PlanAction
    target_workout_id: str | None = Field(default=None, max_length=80)
    explanation_code: Literal[
        "initial_generation",
        "runner_confirmed",
        "schedule_change",
        "duration_change",
        "workout_replacement",
        "runner_skip",
        "availability_change",
        "preferred_day_confirmation",
        "goal_or_preference_change",
        "runner_pause",
        "runner_resume",
    ]


class PriorOperation(StrictModel):
    operation_id: str = Field(min_length=8, max_length=100)
    request_fingerprint: str = Field(min_length=8, max_length=128)
    committed_version: int = Field(ge=1)


class MobilePlanLifecycleRequest(StrictModel):
    schema_version: Literal["mobile-plan-lifecycle.v1"]
    platform: Literal["ios"]
    mode: Literal["preview", "commit"]
    operation_id: str = Field(min_length=8, max_length=100)
    request_fingerprint: str = Field(min_length=8, max_length=128)
    expected_version: int = Field(ge=0)
    current_plan: MobilePlanSnapshot | None
    proposed_plan: MobilePlanSnapshot
    mutation: MobilePlanMutation
    prior_operation: PriorOperation | None = None


class MobilePlanImpact(StrictModel):
    affected_workout_ids: list[str]
    completed_workouts_preserved: int
    total_workouts_before: int
    total_workouts_after: int
    warnings: list[
        Literal[
            "completed_history_locked",
            "race_day_locked",
            "spacing_requires_review",
            "weekly_growth_requires_review",
        ]
    ]


class MobilePlanPersistence(StrictModel):
    required: bool
    owner_scoped_domains: list[
        Literal["plan", "plan_history", "plan_operations"]
    ]
    transaction_preconditions: list[
        Literal[
            "authenticated_owner",
            "current_version_matches",
            "operation_id_absent_or_matching",
        ]
    ]


class MobilePlanLifecycleResponse(StrictModel):
    schema_version: Literal["mobile-plan-lifecycle.v1"] = (
        "mobile-plan-lifecycle.v1"
    )
    result: Literal["preview", "commit_ready", "replayed", "conflict", "rejected"]
    mutation_performed: Literal[False] = False
    base_version: int
    proposed_version: int | None
    reason_codes: list[
        Literal[
            "accepted",
            "version_conflict",
            "idempotency_conflict",
            "completed_history_changed",
            "race_day_changed",
            "invalid_version_increment",
            "duplicate_workout_id",
            "invalid_action_transition",
            "plan_identity_changed",
            "goal_revision_changed",
            "invalid_action_delta",
            "duplicate_workout_date",
            "spacing_violation",
            "race_day_missing_or_invalid",
        ]
    ]
    impact: MobilePlanImpact
    commit_plan: MobilePlanSnapshot | None
    persistence: MobilePlanPersistence


def evaluate_mobile_plan_lifecycle(
    request: MobilePlanLifecycleRequest,
) -> MobilePlanLifecycleResponse:
    """Validate a proposed lifecycle change and return a transaction package."""

    current = request.current_plan
    proposed = request.proposed_plan
    base_version = current.version if current else 0
    empty_impact = MobilePlanImpact(
        affected_workout_ids=[],
        completed_workouts_preserved=0,
        total_workouts_before=len(current.workouts) if current else 0,
        total_workouts_after=len(proposed.workouts),
        warnings=[],
    )

    if request.prior_operation:
        prior = request.prior_operation
        if prior.operation_id == request.operation_id:
            if prior.request_fingerprint != request.request_fingerprint:
                return _response(
                    "conflict",
                    base_version,
                    None,
                    ["idempotency_conflict"],
                    empty_impact,
                )
            return _response(
                "replayed",
                base_version,
                prior.committed_version,
                ["accepted"],
                empty_impact,
            )

    if request.expected_version != base_version:
        return _response(
            "conflict",
            base_version,
            None,
            ["version_conflict"],
            empty_impact,
        )
    if proposed.version != base_version + 1:
        return _response(
            "rejected",
            base_version,
            None,
            ["invalid_version_increment"],
            empty_impact,
        )
    if len({workout.id for workout in proposed.workouts}) != len(
        proposed.workouts
    ):
        return _response(
            "rejected",
            base_version,
            None,
            ["duplicate_workout_id"],
            empty_impact,
        )
    if current and proposed.id != current.id:
        return _response(
            "rejected",
            base_version,
            None,
            ["plan_identity_changed"],
            empty_impact,
        )
    if current:
        allowed_goal_revisions = (
            {current.goal_revision, current.goal_revision + 1}
            if request.mutation.action == "regenerate_future"
            else {current.goal_revision}
        )
        if proposed.goal_revision not in allowed_goal_revisions:
            return _response(
                "rejected",
                base_version,
                None,
                ["goal_revision_changed"],
                empty_impact,
            )
    scheduled_dates = [
        workout.date
        for workout in proposed.workouts
        if workout.status != "skipped"
    ]
    if len(scheduled_dates) != len(set(scheduled_dates)):
        return _response(
            "rejected",
            base_version,
            None,
            ["duplicate_workout_date"],
            empty_impact,
        )

    transition_error = _invalid_transition(request)
    if transition_error:
        return _response(
            "rejected",
            base_version,
            None,
            [transition_error],
            empty_impact,
        )

    current_by_id = {workout.id: workout for workout in (current.workouts if current else [])}
    proposed_by_id = {workout.id: workout for workout in proposed.workouts}
    completed = {
        workout_id: workout
        for workout_id, workout in current_by_id.items()
        if workout.status == "completed"
    }
    completed_changed = any(
        proposed_by_id.get(workout_id) != workout
        for workout_id, workout in completed.items()
    )
    if completed_changed:
        completed_impact = empty_impact.model_copy(
            update={"warnings": ["completed_history_locked"]}
        )
        return _response(
            "rejected",
            base_version,
            None,
            ["completed_history_changed"],
            completed_impact,
        )

    current_races = Counter(
        (workout.id, workout.date, workout.distance_miles)
        for workout in (current.workouts if current else [])
        if workout.type == "race"
    )
    proposed_races = Counter(
        (workout.id, workout.date, workout.distance_miles)
        for workout in proposed.workouts
        if workout.type == "race"
    )
    if current and current_races != proposed_races:
        race_impact = empty_impact.model_copy(
            update={"warnings": ["race_day_locked"]}
        )
        return _response(
            "rejected",
            base_version,
            None,
            ["race_day_changed"],
            race_impact,
        )
    if not _action_delta_is_valid(request, current_by_id, proposed_by_id):
        return _response(
            "rejected",
            base_version,
            None,
            ["invalid_action_delta"],
            empty_impact,
        )
    proposed_race_workouts = [
        workout for workout in proposed.workouts if workout.type == "race"
    ]
    if (
        len(proposed_race_workouts) != 1
        or proposed_race_workouts[0].reason_code != "race_day"
        or proposed_race_workouts[0].date
        != max(workout.date for workout in proposed.workouts)
    ):
        return _response(
            "rejected",
            base_version,
            None,
            ["race_day_missing_or_invalid"],
            MobilePlanImpact(
                affected_workout_ids=[],
                completed_workouts_preserved=len(completed),
                total_workouts_before=len(current_by_id),
                total_workouts_after=len(proposed_by_id),
                warnings=["race_day_locked"],
            ),
        )

    affected = sorted(
        workout_id
        for workout_id in set(current_by_id) | set(proposed_by_id)
        if current_by_id.get(workout_id) != proposed_by_id.get(workout_id)
    )
    warnings = _advisory_warnings(proposed)
    impact = MobilePlanImpact(
        affected_workout_ids=affected,
        completed_workouts_preserved=len(completed),
        total_workouts_before=len(current_by_id),
        total_workouts_after=len(proposed_by_id),
        warnings=warnings,
    )
    if "spacing_requires_review" in warnings:
        return _response(
            "rejected",
            base_version,
            None,
            ["spacing_violation"],
            impact,
        )
    if "weekly_growth_requires_review" in warnings:
        return _response(
            "rejected",
            base_version,
            None,
            ["invalid_action_delta"],
            impact,
        )
    result = "preview" if request.mode == "preview" else "commit_ready"
    return _response(
        result,
        base_version,
        proposed.version,
        ["accepted"],
        impact,
        commit_plan=proposed,
        persist=request.mode == "commit",
    )


def _invalid_transition(
    request: MobilePlanLifecycleRequest,
) -> Literal["invalid_action_transition"] | None:
    current = request.current_plan
    action = request.mutation.action
    if current is None:
        return (
            None
            if action == "generate"
            and request.expected_version == 0
            and request.proposed_plan.status == "draft"
            else "invalid_action_transition"
        )
    if action == "generate":
        return "invalid_action_transition"
    if action == "pause" and not (
        current.status == "active" and request.proposed_plan.status == "paused"
    ):
        return "invalid_action_transition"
    if action == "resume" and not (
        current.status == "paused" and request.proposed_plan.status == "active"
    ):
        return "invalid_action_transition"
    if action == "save" and not (
        current.status == "draft" and request.proposed_plan.status == "active"
    ):
        return "invalid_action_transition"
    if action not in ("pause", "resume", "save") and (
        current.status != request.proposed_plan.status
    ):
        return "invalid_action_transition"
    target = request.mutation.target_workout_id
    if target:
        current_workout = next(
            (workout for workout in current.workouts if workout.id == target),
            None,
        )
        if current_workout is None or current_workout.status == "completed":
            return "invalid_action_transition"
    return None


def _action_delta_is_valid(
    request: MobilePlanLifecycleRequest,
    current: dict[str, MobilePlanWorkout],
    proposed: dict[str, MobilePlanWorkout],
) -> bool:
    action = request.mutation.action
    if action == "generate":
        return (
            not current
            and all(
                workout.status == "scheduled"
                for workout in request.proposed_plan.workouts
            )
        )
    changed = {
        workout_id
        for workout_id in set(current) | set(proposed)
        if current.get(workout_id) != proposed.get(workout_id)
    }
    if action in ("pause", "resume", "save"):
        return not changed
    if action == "regenerate_future":
        if not changed:
            return False
        for workout_id in changed:
            before = current.get(workout_id)
            after = proposed.get(workout_id)
            if before and (before.status == "completed" or before.type == "race"):
                return False
            if after and (
                after.type == "race"
                or after.status != "scheduled"
                or after.reason_code != "future_regeneration"
            ):
                return False
        return True
    target_id = request.mutation.target_workout_id
    if target_id is None or changed != {target_id}:
        return False
    before = current.get(target_id)
    after = proposed.get(target_id)
    if before is None or after is None:
        return False
    before_data = before.model_dump()
    after_data = after.model_dump()
    changed_fields = {
        key for key in before_data if before_data[key] != after_data[key]
    }
    if action in ("move", "availability", "preferred_day"):
        expected_reason = (
            "availability"
            if action == "availability"
            else "preferred_day"
            if action == "preferred_day"
            else "runner_edit"
        )
        return (
            changed_fields <= {"date", "reason_code"}
            and "date" in changed_fields
            and before.type != "race"
            and before.status == "scheduled"
            and after.status == "scheduled"
            and after.reason_code == expected_reason
        )
    if action == "shorten":
        return (
            changed_fields <= {
                "distance_miles",
                "duration_minutes",
                "reason_code",
            }
            and after.distance_miles <= before.distance_miles
            and after.duration_minutes < before.duration_minutes
            and before.status == "scheduled"
            and after.status == "scheduled"
            and before.type != "race"
            and after.reason_code == "runner_edit"
        )
    if action == "replace":
        return (
            changed_fields
            <= {
                "type",
                "distance_miles",
                "duration_minutes",
                "pace_seconds_per_mile",
                "reason_code",
            }
            and "type" in changed_fields
            and before.type != "race"
            and after.type != "race"
            and before.status == "scheduled"
            and after.status == "scheduled"
            and after.reason_code == "runner_edit"
        )
    if action == "skip":
        return (
            changed_fields <= {"status", "reason_code"}
            and before.status == "scheduled"
            and after.status == "skipped"
            and before.type != "race"
            and after.reason_code == "runner_edit"
        )
    return False


def _plan_invariants_are_valid(plan: MobilePlanSnapshot) -> bool:
    """Apply load, coherence, weekly-growth, and taper gates to every plan."""

    active = [workout for workout in plan.workouts if workout.status != "skipped"]
    if any(
        workout.distance_miles <= 0
        or workout.duration_minutes <= 0
        or (workout.type != "race" and workout.distance_miles > 22)
        or (workout.type != "race" and workout.duration_minutes > 240)
        for workout in active
    ):
        return False
    race_distances = {3.1, 6.2, 13.1, 26.2}
    if any(
        workout.type == "race"
        and not any(abs(workout.distance_miles - expected) < 0.01 for expected in race_distances)
        for workout in active
    ):
        return False
    for workout in active:
        if workout.pace_seconds_per_mile is None:
            return False
        expected_minutes = (
            workout.distance_miles * workout.pace_seconds_per_mile / 60
        )
        if not (expected_minutes * 0.55 <= workout.duration_minutes <= expected_minutes * 1.45):
            return False

    weekly: dict[date, list[MobilePlanWorkout]] = defaultdict(list)
    for workout in active:
        monday = workout.date - timedelta(days=workout.date.weekday())
        weekly[monday].append(workout)
    ordered_weeks = sorted(weekly)
    totals = [sum(item.distance_miles for item in weekly[start]) for start in ordered_weeks]
    training_totals = [
        sum(item.distance_miles for item in weekly[start] if item.type != "race")
        for start in ordered_weeks
    ]
    if any(total > 80 for total in totals):
        return False
    for workouts in weekly.values():
        if sum(item.type == "long_run" for item in workouts) > 1:
            return False
        if sum(item.type in ("tempo", "intervals") for item in workouts) > 2:
            return False
    for index in range(1, len(training_totals)):
        previous = training_totals[index - 1]
        current = training_totals[index]
        if previous == 0 or current == 0:
            continue
        if current <= max(previous * 1.25, previous + 5):
            continue
        recovery_rebound = (
            index >= 2
            and previous <= training_totals[index - 2] * 0.85 + 1.0
            and current <= max(
                training_totals[index - 2] * 1.15,
                training_totals[index - 2] + 5,
            )
        )
        if not recovery_rebound:
            return False

    race = next((workout for workout in active if workout.type == "race"), None)
    if race:
        taper_length = 1 if race.distance_miles < 10 else 2 if race.distance_miles < 20 else 3
        pre_race_totals = [
            sum(item.distance_miles for item in weekly[start] if item.type != "race")
            for start in ordered_weeks
            if start <= race.date
        ]
        taper = pre_race_totals[-taper_length:]
        if any(right > left + 0.5 for left, right in zip(taper, taper[1:])):
            return False
    return True


def _advisory_warnings(
    plan: MobilePlanSnapshot,
) -> list[
    Literal["spacing_requires_review", "weekly_growth_requires_review"]
]:
    warnings: list[
        Literal["spacing_requires_review", "weekly_growth_requires_review"]
    ] = []
    scheduled = sorted(
        workout.date
        for workout in plan.workouts
        if workout.status == "scheduled" and workout.type != "easy"
    )
    if any((right - left).days < 2 for left, right in zip(scheduled, scheduled[1:])):
        warnings.append("spacing_requires_review")
    if not _plan_invariants_are_valid(plan):
        warnings.append("weekly_growth_requires_review")
    return warnings


def _response(
    result: Literal["preview", "commit_ready", "replayed", "conflict", "rejected"],
    base_version: int,
    proposed_version: int | None,
    reason_codes: list,
    impact: MobilePlanImpact,
    commit_plan: MobilePlanSnapshot | None = None,
    persist: bool = False,
) -> MobilePlanLifecycleResponse:
    return MobilePlanLifecycleResponse(
        result=result,
        base_version=base_version,
        proposed_version=proposed_version,
        reason_codes=reason_codes,
        impact=impact,
        commit_plan=commit_plan,
        persistence=MobilePlanPersistence(
            required=persist,
            owner_scoped_domains=["plan", "plan_history", "plan_operations"],
            transaction_preconditions=[
                "authenticated_owner",
                "current_version_matches",
                "operation_id_absent_or_matching",
            ],
        ),
    )
