"""Contract and adversarial smoke for ``mobile-plan-generation.v1``."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import app
from app.mobile_plan import (
    MobilePlanLifecycleRequest,
    MobilePlanMutation,
    evaluate_mobile_plan_lifecycle,
)
from app.mobile_plan_generation import (
    MobilePlanGenerationRequest,
    generate_mobile_plan,
)


FIXTURE = (
    Path(__file__).parents[2]
    / "ios"
    / "KineticCompanion"
    / "Tests"
    / "Fixtures"
    / "mobile-plan-generation-contract.json"
)


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    request_data = fixture["initial_request"]
    request = MobilePlanGenerationRequest.model_validate(request_data)
    first = generate_mobile_plan(request).model_dump(mode="json")
    second = generate_mobile_plan(request).model_dump(mode="json")
    _expect(first == fixture["initial_response"], "generation fixture drifted")
    _expect(first == second, "identical generation requests were not deterministic")
    _assert_bounds(first)
    _chain_into_lifecycle(first)
    _exercise_generation_matrix(request_data)
    _exercise_regeneration_history(request_data, first)
    _exercise_schema_and_privacy(request_data, first)
    _exercise_http_boundary(request_data)
    print(
        "OK - shared plan generation covers fixture parity, determinism, bounds, "
        "strict auth, privacy, regeneration history, and lifecycle chaining"
    )


def _assert_bounds(response: dict) -> None:
    plan = response["candidate_plan"]
    _expect(4 <= len(response["weeks"]) <= 20, "week count escaped bounds")
    _expect(len(plan["workouts"]) <= 100, "workout count escaped bounds")
    _expect(response["weeks"][-1]["phase"] == "race", "race phase is not authoritative")
    races = [workout for workout in plan["workouts"] if workout["type"] == "race"]
    _expect(len(races) == 1, "generation did not emit exactly one race")
    _expect(
        all(
            0 < workout["distance_miles"] <= 26.2
            and 0 < workout["duration_minutes"] <= 480
            and 180 <= workout["pace_seconds_per_mile"] <= 1800
            for workout in plan["workouts"]
        ),
        "generated workout escaped distance/duration/pace bounds",
    )


def _chain_into_lifecycle(response: dict) -> None:
    lifecycle = MobilePlanLifecycleRequest(
        schema_version="mobile-plan-lifecycle.v1",
        platform="ios",
        mode="preview",
        operation_id="op-generation-chain-0001",
        request_fingerprint="sha256-generation-chain-0001",
        expected_version=0,
        current_plan=None,
        proposed_plan=response["candidate_plan"],
        mutation=MobilePlanMutation(
            action="generate",
            explanation_code="initial_generation",
        ),
        prior_operation=None,
    )
    result = evaluate_mobile_plan_lifecycle(lifecycle)
    _expect(
        result.result == "preview" and result.reason_codes == ["accepted"],
        f"generator output did not pass lifecycle validation: {result.reason_codes}",
    )


def _exercise_generation_matrix(base: dict) -> None:
    for race in ("5k", "10k", "half", "marathon"):
        for experience in ("beginner", "intermediate", "advanced"):
            candidate = copy.deepcopy(base)
            candidate.update(
                {
                    "race_distance": race,
                    "target_date": "2026-12-20",
                    "experience_level": experience,
                    "weekly_mileage": 1,
                    "preferred_days": [],
                    "personal_bests_seconds": {},
                }
            )
            response = generate_mobile_plan(
                MobilePlanGenerationRequest.model_validate(candidate)
            ).model_dump(mode="json")
            _assert_bounds(response)
            lifecycle = MobilePlanLifecycleRequest(
                schema_version="mobile-plan-lifecycle.v1",
                platform="ios",
                mode="preview",
                operation_id=f"op-{race}-{experience}-matrix",
                request_fingerprint=f"sha256-{race}-{experience}-matrix",
                expected_version=0,
                current_plan=None,
                proposed_plan=response["candidate_plan"],
                mutation=MobilePlanMutation(
                    action="generate",
                    explanation_code="initial_generation",
                ),
                prior_operation=None,
            )
            result = evaluate_mobile_plan_lifecycle(lifecycle)
            _expect(
                result.result == "preview",
                f"{race}/{experience} generation failed lifecycle validation: "
                f"{result.reason_codes}",
            )
def _exercise_regeneration_history(request_data: dict, initial: dict) -> None:
    current = copy.deepcopy(initial["candidate_plan"])
    current["version"] = 3
    current["status"] = "active"
    current["workouts"][0]["status"] = "completed"
    request_data = copy.deepcopy(request_data)
    request_data.update(
        {
            "mode": "regenerate_future",
            "goal_revision": 2,
            "current_plan": current,
        }
    )
    regenerated = generate_mobile_plan(
        MobilePlanGenerationRequest.model_validate(request_data)
    )
    _expect(regenerated.candidate_plan.version == 4, "regeneration version did not advance")
    _expect(
        regenerated.candidate_plan.workouts[0].model_dump(mode="json")
        == current["workouts"][0],
        "completed history changed during regeneration",
    )
    _expect(
        regenerated.candidate_plan.workouts[-1].model_dump(mode="json")
        == current["workouts"][-1],
        "race day changed during regeneration",
    )
    lifecycle = MobilePlanLifecycleRequest(
        schema_version="mobile-plan-lifecycle.v1",
        platform="ios",
        mode="commit",
        operation_id="op-regeneration-chain-0001",
        request_fingerprint="sha256-regeneration-chain-0001",
        expected_version=3,
        current_plan=current,
        proposed_plan=regenerated.candidate_plan,
        mutation=MobilePlanMutation(
            action="regenerate_future",
            explanation_code="goal_or_preference_change",
        ),
        prior_operation=None,
    )
    result = evaluate_mobile_plan_lifecycle(lifecycle)
    _expect(
        result.result == "commit_ready",
        f"regenerated output failed lifecycle validation: {result.reason_codes}",
    )


def _exercise_schema_and_privacy(request_data: dict, response: dict) -> None:
    malformed = copy.deepcopy(request_data)
    malformed["unexpected"] = "forbidden"
    try:
        MobilePlanGenerationRequest.model_validate(malformed)
    except ValidationError:
        pass
    else:
        raise AssertionError("generation schema accepted an extra field")
    duplicate_days = copy.deepcopy(request_data)
    duplicate_days["preferred_days"] = ["mon", "mon"]
    try:
        MobilePlanGenerationRequest.model_validate(duplicate_days)
    except ValidationError:
        pass
    else:
        raise AssertionError("generation schema accepted duplicate preferred days")
    serialized = json.dumps(response).lower()
    for forbidden in ("email", "full_name", "token", "medical", "pain", "biometric"):
        _expect(forbidden not in serialized, f"generation response leaked {forbidden}")


def _exercise_http_boundary(request_data: dict) -> None:
    client = TestClient(app)
    original_auth = os.environ.get("KINETIC_AUTH_REQUIRED")
    try:
        os.environ["KINETIC_AUTH_REQUIRED"] = "true"
        anonymous = client.post("/mobile/plan-generation", json=request_data)
        _expect(anonymous.status_code == 401, "generation accepted anonymous strict-auth request")
        os.environ["KINETIC_AUTH_REQUIRED"] = "false"
        accepted = client.post("/mobile/plan-generation", json=request_data)
        _expect(
            accepted.status_code == 200
            and accepted.json()["source"] == "deterministic_shared"
            and accepted.json()["mutation_performed"] is False,
            "generation HTTP response drifted",
        )
        private = copy.deepcopy(request_data)
        private["email"] = "runner@example.com"
        rejected = client.post("/mobile/plan-generation", json=private)
        _expect(rejected.status_code == 422, "generation accepted a private identity field")
    finally:
        if original_auth is None:
            os.environ.pop("KINETIC_AUTH_REQUIRED", None)
        else:
            os.environ["KINETIC_AUTH_REQUIRED"] = original_auth


if __name__ == "__main__":
    main()
