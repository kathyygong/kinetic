"""Focused cross-language smoke for ``mobile-plan-lifecycle.v1``."""

from __future__ import annotations

import copy
import json
from pathlib import Path

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
    print(
        "OK - backend mobile plan authority preserves versions, history, "
        "race day, idempotency, and commit preconditions"
    )


if __name__ == "__main__":
    main()
