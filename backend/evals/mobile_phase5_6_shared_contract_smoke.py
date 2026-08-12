"""Focused gates for the Phase 5-6 Windows/shared blocker-resolution pass."""

from __future__ import annotations

import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import app
from app.mobile_account_cleanup import (
    MobileAccountCleanupReceipt,
    MobileAccountCleanupRequest,
    OWNER_DOMAINS,
    coordinate_account_cleanup,
)
from app.mobile_plan import MobilePlanMutation
from app.mobile_plan_generation import (
    MobilePlanGenerationRequestV2,
    generate_mobile_plan_v2,
)
from app.mobile_plan_v2 import (
    MobilePlanLifecycleRequestV2,
    MobilePlanSnapshotV2,
    MobilePlanningInputs,
    evaluate_mobile_plan_lifecycle_v2,
)


FIXTURE = Path(__file__).parents[2] / "ios" / "KineticCompanion" / "Tests" / "Fixtures" / "mobile-plan-shared-v2-contract.json"


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    inputs = MobilePlanningInputs.model_validate(fixture["planning_inputs"])
    request = MobilePlanGenerationRequestV2(
        schema_version="mobile-plan-generation.v2",
        platform="ios",
        mode="initial",
        planning_date="2026-08-10",
        planning_inputs=inputs.model_copy(update={"revision": 1}),
        current_plan=None,
    )
    first = generate_mobile_plan_v2(request)
    second = generate_mobile_plan_v2(request)
    expect(first == second, "v2 generation is not deterministic")
    expect(first.candidate_plan.metadata.plan_version == 1, "metadata is not version-bound")
    expect(
        "weekly_availability_applied" in first.candidate_plan.metadata.explanation_codes,
        "availability explanation is missing",
    )
    constraints = {item.day: item for item in request.planning_inputs.weekly_availability}
    for workout in first.candidate_plan.workouts:
        if workout.type == "race":
            continue
        day = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[workout.date.weekday()]
        constraint = constraints.get(day)
        if constraint:
            expect(workout.duration_minutes <= constraint.available_minutes, "duration escaped availability")
            expect(not constraint.easy_only or workout.type == "easy", "easy-only availability was ignored")

    preview_request = MobilePlanLifecycleRequestV2(
        schema_version="mobile-plan-lifecycle.v2",
        platform="ios",
        mode="preview",
        operation_id="op-v2-generation-0001",
        request_fingerprint="sha256-v2-generation-0001",
        expected_version=0,
        current_plan=None,
        proposed_plan=first.candidate_plan,
        current_planning_inputs=None,
        proposed_planning_inputs=request.planning_inputs,
        mutation=MobilePlanMutation(action="generate", explanation_code="initial_generation"),
        prior_operation=None,
    )
    preview = evaluate_mobile_plan_lifecycle_v2(preview_request)
    expect(preview.result == "preview", f"v2 generator/lifecycle chain failed: {preview.reason_codes}")
    expect(preview.commit_plan is not None and preview.commit_plan.metadata.plan_version == 1, "preview dropped metadata")
    expect(preview.commit_planning_inputs == request.planning_inputs, "preview dropped planning inputs")

    unavailable = copy.deepcopy(preview_request.model_dump(mode="json"))
    target = next(item for item in unavailable["proposed_plan"]["workouts"] if item["type"] != "race")
    original = datetime.fromisoformat(target["date"])
    target["date"] = (original - timedelta(days=original.weekday())).date().isoformat()
    result = evaluate_mobile_plan_lifecycle_v2(MobilePlanLifecycleRequestV2.model_validate(unavailable))
    expect(result.result == "rejected", "zero-minute weekday accepted a workout")

    legacy_current = first.candidate_plan.model_dump(exclude={"metadata"})
    legacy_current["version"] = 1
    legacy_current["status"] = "active"
    legacy_current["goal_revision"] = 1
    regenerated_request = MobilePlanGenerationRequestV2(
        schema_version="mobile-plan-generation.v2",
        platform="ios",
        mode="regenerate_future",
        planning_date="2026-08-10",
        planning_inputs=request.planning_inputs.model_copy(update={"revision": 2}),
        current_plan=legacy_current,
    )
    regenerated = generate_mobile_plan_v2(regenerated_request)
    expect(regenerated.candidate_plan.version == 2, "legacy plan migration did not advance version")
    expect(regenerated.candidate_plan.metadata.plan_version == 2, "legacy migration did not bind metadata")

    exercise_cleanup(fixture)
    anonymous = TestClient(app).post("/mobile/account-cleanup", json=fixture["account_cleanup_request"])
    expect(anonymous.status_code == 401, "account cleanup accepted an anonymous caller")
    print("OK - v2 metadata, availability, coordinated lifecycle, legacy migration, and retry-safe account cleanup")


class FakeStore:
    def __init__(self) -> None:
        self.receipt: MobileAccountCleanupReceipt | None = None
        self.domains = set(OWNER_DOMAINS)
        self.fail_once = {"plan_history"}
        self.auth_deleted = False

    def read_receipt(self, uid: str): return self.receipt
    def write_receipt(self, uid: str, receipt: MobileAccountCleanupReceipt): self.receipt = receipt
    def delete_owner_domain(self, uid: str, domain: str):
        if domain in self.fail_once:
            self.fail_once.remove(domain)
            raise RuntimeError("transient")
        self.domains.discard(domain)
    def owner_domain_exists(self, uid: str, domain: str): return domain in self.domains
    def delete_auth_user(self, uid: str): self.auth_deleted = True


def exercise_cleanup(fixture: dict) -> None:
    store = FakeStore()
    first_request = MobileAccountCleanupRequest.model_validate(fixture["account_cleanup_request"])
    first = coordinate_account_cleanup(first_request, uid="owner-a", auth_time=None, store=store, now=datetime(2026, 8, 12, 16, tzinfo=timezone.utc))
    expect(first.receipt.pending_domains == ["plan_history"], "partial cleanup lost retry state")
    resumed = coordinate_account_cleanup(first_request, uid="owner-a", auth_time=None, store=store, now=datetime(2026, 8, 12, 16, 1, tzinfo=timezone.utc))
    expect(not resumed.receipt.pending_domains and resumed.receipt.status == "ready_for_auth_deletion", "cleanup did not resume")
    stale = first_request.model_copy(update={"mode": "finalize_auth", "operation_id": "op-account-finalize-0001", "request_fingerprint": "sha256-account-finalize-0001"})
    reauth = coordinate_account_cleanup(stale, uid="owner-a", auth_time=0, store=store, now=datetime(2026, 8, 12, 16, 2, tzinfo=timezone.utc))
    expect(reauth.result == "reauthentication_required" and not store.auth_deleted, "stale auth deleted identity")
    completed = coordinate_account_cleanup(stale, uid="owner-a", auth_time=int(datetime(2026, 8, 12, 16, 2, tzinfo=timezone.utc).timestamp()), store=store, now=datetime(2026, 8, 12, 16, 3, tzinfo=timezone.utc))
    expect(completed.result == "completed" and store.auth_deleted, "recent auth did not finalize deletion")
    expect(store.receipt is not None and store.receipt.status == "completed", "durable completion receipt missing")


if __name__ == "__main__":
    main()
