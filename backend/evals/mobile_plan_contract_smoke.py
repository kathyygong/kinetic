"""Focused cross-language smoke for ``mobile-plan-lifecycle.v1``."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import app
from app.mobile_plan import (
    MobilePlanLifecycleRequest,
    evaluate_mobile_plan_lifecycle,
)


FIXTURE = (
    Path(__file__).parents[2]
    / "ios"
    / "KineticCompanion"
    / "Tests"
    / "Fixtures"
    / "mobile-plan-lifecycle-contract.json"
)


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    request_data = fixture["commit_move_request"]
    expected = fixture["commit_move_response"]
    request = MobilePlanLifecycleRequest.model_validate(request_data)
    actual = evaluate_mobile_plan_lifecycle(request).model_dump(mode="json")
    _expect(actual == expected, "Python authority drifted from canonical response")
    _exercise_action_matrix(request_data)
    _exercise_http_boundary(request_data)

    version_conflict = copy.deepcopy(request_data)
    version_conflict["expected_version"] = 2
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(version_conflict)
    )
    _expect(
        result.result == "conflict"
        and result.reason_codes == ["version_conflict"]
        and result.persistence.required is False,
        "stale base version did not fail closed",
    )

    completed_edit = copy.deepcopy(request_data)
    completed_edit["proposed_plan"]["workouts"][0]["distance_miles"] = 5
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(completed_edit)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["completed_history_changed"],
        "completed history could be rewritten",
    )

    race_edit = copy.deepcopy(request_data)
    race_edit["proposed_plan"]["workouts"][2]["date"] = "2026-09-21"
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(race_edit)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["race_day_changed"],
        "race-day invariant could be bypassed",
    )

    invalid_delta = copy.deepcopy(request_data)
    invalid_delta["proposed_plan"]["workouts"][1]["duration_minutes"] = 30
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(invalid_delta)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "move action changed a non-move field",
    )

    spacing_violation = copy.deepcopy(request_data)
    spacing_violation["proposed_plan"]["workouts"][1]["date"] = "2026-09-19"
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(spacing_violation)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["spacing_violation"],
        "adjacent hard efforts bypassed spacing validation",
    )

    replay = copy.deepcopy(request_data)
    replay["prior_operation"] = {
        "operation_id": replay["operation_id"],
        "request_fingerprint": replay["request_fingerprint"],
        "committed_version": 4,
    }
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(replay)
    )
    _expect(
        result.result == "replayed" and result.proposed_version == 4,
        "matching idempotent replay was not recognized",
    )

    idempotency_conflict = copy.deepcopy(replay)
    idempotency_conflict["prior_operation"]["request_fingerprint"] = (
        "sha256-different-request"
    )
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(idempotency_conflict)
    )
    _expect(
        result.result == "conflict"
        and result.reason_codes == ["idempotency_conflict"],
        "operation-id reuse with different content was accepted",
    )

    goal_revision_change = copy.deepcopy(request_data)
    goal_revision_change["proposed_plan"]["goal_revision"] = 99
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(goal_revision_change)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["goal_revision_changed"],
        "unrelated action changed the goal revision",
    )

    duplicate_date = copy.deepcopy(request_data)
    duplicate_date["proposed_plan"]["workouts"][1]["date"] = "2026-08-03"
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(duplicate_date)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["duplicate_workout_date"],
        "two live workouts occupied the same date",
    )

    no_op_availability = _request_for_action(request_data, "availability")
    no_op_availability["proposed_plan"]["workouts"] = copy.deepcopy(
        no_op_availability["current_plan"]["workouts"]
    )
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(no_op_availability)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "no-op availability commit advanced the plan version",
    )
    _exercise_adversarial_deltas(request_data)
    print(
        "OK - backend mobile plan authority covers all lifecycle actions, "
        "strict auth, versions, history, race day, spacing, idempotency, "
        "load invariants, action deltas, and commit preconditions"
    )


def _exercise_adversarial_deltas(base: dict) -> None:
    oversized = _request_for_action(base, "availability")
    oversized["proposed_plan"]["workouts"][1].update(
        {"distance_miles": 29, "duration_minutes": 300}
    )
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(oversized)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "availability accepted the 29-mile/300-minute regression",
    )

    unrelated = _request_for_action(base, "preferred_day")
    unrelated["proposed_plan"]["workouts"][1]["type"] = "easy"
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(unrelated)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "preferred-day mutation changed an unrelated workout field",
    )

    multi = _request_for_action(base, "availability")
    extra = copy.deepcopy(multi["proposed_plan"]["workouts"][1])
    extra.update(
        {
            "id": "workout-future-extra-004",
            "date": "2026-08-14",
            "type": "easy",
            "reason_code": "availability",
        }
    )
    multi["proposed_plan"]["workouts"].append(extra)
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(multi)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "single-workout availability changed multiple workouts",
    )

    replace_load = _request_for_action(base, "replace")
    replace_load["proposed_plan"]["workouts"][1].update(
        {"distance_miles": 29, "duration_minutes": 300}
    )
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(replace_load)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"]
        and result.impact.warnings == ["weekly_growth_requires_review"],
        "replace bypassed the full-plan load validator",
    )

    regenerated_status = _request_for_action(base, "regenerate_future")
    regenerated_status["proposed_plan"]["workouts"][1]["status"] = "completed"
    result = evaluate_mobile_plan_lifecycle(
        MobilePlanLifecycleRequest.model_validate(regenerated_status)
    )
    _expect(
        result.result == "rejected"
        and result.reason_codes == ["invalid_action_delta"],
        "future regeneration fabricated completed history",
    )


def _exercise_action_matrix(base: dict) -> None:
    for action in [
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
    ]:
        candidate = _request_for_action(base, action)
        result = evaluate_mobile_plan_lifecycle(
            MobilePlanLifecycleRequest.model_validate(candidate)
        )
        _expect(
            result.result == "commit_ready",
            f"{action} did not produce a valid commit package: "
            f"{result.reason_codes}",
        )
        _expect(
            result.persistence.required
            and result.proposed_version == candidate["proposed_plan"]["version"],
            f"{action} omitted persistence/version proof",
        )


def _request_for_action(base: dict, action: str) -> dict:
    candidate = copy.deepcopy(base)
    candidate["operation_id"] = f"op-mobile-{action}-0001"
    candidate["request_fingerprint"] = f"sha256-mobile-{action}-0001"
    candidate["mutation"]["action"] = action
    candidate["mutation"]["target_workout_id"] = None
    candidate["prior_operation"] = None
    explanations = {
        "generate": "initial_generation",
        "save": "runner_confirmed",
        "move": "schedule_change",
        "shorten": "duration_change",
        "replace": "workout_replacement",
        "skip": "runner_skip",
        "availability": "availability_change",
        "preferred_day": "preferred_day_confirmation",
        "regenerate_future": "goal_or_preference_change",
        "pause": "runner_pause",
        "resume": "runner_resume",
    }
    candidate["mutation"]["explanation_code"] = explanations[action]

    current = candidate["current_plan"]
    proposed = candidate["proposed_plan"]
    proposed["workouts"] = copy.deepcopy(current["workouts"])

    if action == "generate":
        candidate["expected_version"] = 0
        candidate["current_plan"] = None
        proposed["version"] = 1
        proposed["status"] = "draft"
        for workout in proposed["workouts"]:
            workout["status"] = "scheduled"
        return candidate
    if action == "save":
        current["status"] = "draft"
        proposed["status"] = "active"
        return candidate
    if action == "pause":
        proposed["status"] = "paused"
        return candidate
    if action == "resume":
        current["status"] = "paused"
        proposed["status"] = "active"
        return candidate

    target = proposed["workouts"][1]
    candidate["mutation"]["target_workout_id"] = target["id"]
    if action in ("move", "availability", "preferred_day"):
        target["date"] = "2026-08-12"
        target["reason_code"] = (
            "availability"
            if action == "availability"
            else "preferred_day"
            if action == "preferred_day"
            else "runner_edit"
        )
    elif action == "shorten":
        target["distance_miles"] = 4
        target["duration_minutes"] = 35
        target["reason_code"] = "runner_edit"
    elif action == "replace":
        target["type"] = "easy"
        target["distance_miles"] = 4
        target["duration_minutes"] = 40
        target["pace_seconds_per_mile"] = 600
        target["reason_code"] = "runner_edit"
    elif action == "skip":
        target["status"] = "skipped"
        target["reason_code"] = "runner_edit"
    elif action == "regenerate_future":
        target["type"] = "intervals"
        target["distance_miles"] = 4.5
        target["duration_minutes"] = 40
        target["pace_seconds_per_mile"] = 510
        target["reason_code"] = "future_regeneration"
        proposed["goal_revision"] = current["goal_revision"] + 1
    return candidate


def _exercise_http_boundary(request_data: dict) -> None:
    client = TestClient(app)
    original_auth = os.environ.get("KINETIC_AUTH_REQUIRED")
    try:
        os.environ["KINETIC_AUTH_REQUIRED"] = "true"
        anonymous = client.post("/mobile/plan-lifecycle", json=request_data)
        _expect(
            anonymous.status_code == 401,
            "strict-auth lifecycle endpoint accepted an anonymous request",
        )
        os.environ["KINETIC_AUTH_REQUIRED"] = "false"
        accepted = client.post("/mobile/plan-lifecycle", json=request_data)
        _expect(
            accepted.status_code == 200
            and accepted.json()["result"] == "commit_ready"
            and accepted.json()["mutation_performed"] is False,
            "authenticated/permissive lifecycle HTTP contract drifted",
        )
        malformed = copy.deepcopy(request_data)
        malformed["unexpected"] = "forbidden"
        rejected = client.post("/mobile/plan-lifecycle", json=malformed)
        _expect(
            rejected.status_code == 422,
            "strict request schema accepted an extra field",
        )
    finally:
        if original_auth is None:
            os.environ.pop("KINETIC_AUTH_REQUIRED", None)
        else:
            os.environ["KINETIC_AUTH_REQUIRED"] = original_auth


if __name__ == "__main__":
    main()
