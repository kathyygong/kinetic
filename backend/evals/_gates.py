"""Deterministic AI safety gates for the first demo wedge."""

from __future__ import annotations

import copy
import os
from typing import Any

os.environ["KINETIC_AI_MODE"] = "fallback"
os.environ.setdefault("KINETIC_DEMO_MODE", "true")
os.environ.setdefault("KINETIC_AUTH_REQUIRED", "false")

from fastapi.testclient import TestClient

from app.ai_safety import contains_medical_claim, contradicts_selected_action
from app.api import app
from app.llm_client import LLMUnavailable
from app import weekly_reasoning as weekly_reasoning_module
from evals.eval_cases import BEHAVIOR_INSIGHT_CASES, DAILY_REASONING_CASES


client = TestClient(app)


def _assert(cond: bool, message: str) -> None:
    if not cond:
        raise AssertionError(message)


def _daily_schema(value: dict[str, Any]) -> None:
    _assert(isinstance(value.get("summary"), str) and value["summary"], "missing summary")
    _assert(isinstance(value.get("tradeoff"), str), "missing tradeoff")
    _assert(
        isinstance(value.get("confidence_note"), str),
        "missing confidence_note",
    )
    factors = value.get("factors")
    _assert(isinstance(factors, list) and factors, "missing factors")
    for factor in factors:
        _assert(isinstance(factor, dict), "factor is not object")
        _assert(isinstance(factor.get("title"), str) and factor["title"], "bad factor title")
        _assert(
            isinstance(factor.get("explanation"), str) and factor["explanation"],
            "bad factor explanation",
        )
        _assert(
            factor.get("impact") in {"positive", "negative", "neutral"},
            "bad factor impact",
        )


def _weekly_schema(value: dict[str, Any]) -> None:
    _assert(isinstance(value.get("summary"), str) and value["summary"], "missing summary")
    _assert(isinstance(value.get("changes"), list) and value["changes"], "missing changes")
    _assert(isinstance(value.get("preserved"), list), "missing preserved")
    _assert(isinstance(value.get("tradeoff"), str), "missing tradeoff")
    _assert(
        isinstance(value.get("confidence_note"), str),
        "missing confidence_note",
    )


def _behavior_schema(value: dict[str, Any]) -> None:
    _assert(isinstance(value.get("patterns"), list), "missing patterns")
    _assert(isinstance(value.get("warnings"), list), "missing warnings")
    for pattern in value["patterns"]:
        _assert(isinstance(pattern.get("title"), str) and pattern["title"], "bad title")
        _assert(
            isinstance(pattern.get("description"), str) and pattern["description"],
            "bad description",
        )
        _assert(
            pattern.get("confidence") in {"low", "moderate", "high"},
            "bad confidence",
        )
        _assert(
            isinstance(pattern.get("suggested_adjustment"), str)
            and pattern["suggested_adjustment"],
            "bad suggested_adjustment",
        )


def _selected_action(decision: dict[str, Any]) -> str | None:
    selected = decision.get("selected_action")
    return selected.get("name") if isinstance(selected, dict) else None


def check_ai_status() -> None:
    res = client.get("/ai/status")
    _assert(res.status_code == 200, f"/ai/status HTTP {res.status_code}")
    status = res.json()
    _assert(status["mode"] == "fallback", "evals must run in fallback mode")
    _assert(status["fallback_used"] is True, "fallback status not reported")


def check_daily_reasoning() -> None:
    for case in DAILY_REASONING_CASES:
        res = client.post("/decision", json=dict(case.input))
        _assert(res.status_code == 200, f"{case.id}: /decision HTTP {res.status_code}")
        decision = res.json()["decision"]
        before = copy.deepcopy(decision)
        action = _selected_action(decision)

        rr = client.post("/decision/reasoning", json={"decision": decision})
        _assert(
            rr.status_code == 200,
            f"{case.id}: /decision/reasoning HTTP {rr.status_code}",
        )
        reasoning = rr.json()["ai_reasoning"]

        _daily_schema(reasoning)
        _assert(not contains_medical_claim(reasoning), f"{case.id}: medical claim")
        _assert(
            not contradicts_selected_action(reasoning, action),
            f"{case.id}: recommendation drift",
        )
        _assert(decision == before, f"{case.id}: decision mutated by reasoning")

        embedded = client.post("/decision", json=dict(case.input)).json()
        _assert(
            embedded["decision"]["final_workout"] == decision["final_workout"],
            f"{case.id}: selected workout drifted after reasoning",
        )


def check_behavior_insights() -> None:
    for case in BEHAVIOR_INSIGHT_CASES:
        res = client.post("/behavior-insights", json=dict(case.input))
        _assert(
            res.status_code == 200,
            f"{case.id}: /behavior-insights HTTP {res.status_code}",
        )
        body = res.json()
        _behavior_schema(body)
        _assert(not contains_medical_claim(body), f"{case.id}: medical claim")
        if case.id == "behavior.sparse_history":
            warning_text = " ".join(body["warnings"]).lower()
            _assert("limited history" in warning_text, "sparse case missing warning")
            for pattern in body["patterns"]:
                _assert(pattern["confidence"] == "low", "sparse pattern not low")


def check_weekly_reasoning() -> None:
    trace = {
        "original_week_plan": [
            {"day": "Tue", "workout": "Tempo 6mi"},
            {"day": "Sat", "workout": "Long 10mi"},
        ],
        "adjusted_week_plan": [
            {"day": "Tue", "workout": "Easy 4mi"},
            {"day": "Sat", "workout": "Long 8mi"},
        ],
        "calendar_changes": ["Tuesday had a 30 minute training window."],
        "recovery_trends": ["Recent readiness entries are mixed."],
        "preserved_workouts": [{"day": "Thu", "workout": "Easy 5mi"}],
        "modified_workouts": [
            {
                "day": "Tue",
                "workout": "Easy 4mi",
                "reason": "Limited calendar availability.",
            },
            {
                "day": "Sat",
                "workout": "Long 8mi",
                "reason": "Reduced weekly load.",
            },
        ],
        "dropped_workouts": [],
        "confidence": 0.68,
    }
    before = copy.deepcopy(trace)
    res = client.post("/weekly-reasoning", json={"recalibration_trace": trace})
    _assert(res.status_code == 200, f"/weekly-reasoning HTTP {res.status_code}")
    body = res.json()
    _weekly_schema(body)
    _assert(not contains_medical_claim(body), "weekly medical claim")
    _assert(trace == before, "weekly trace mutated by reasoning")


def check_what_if() -> None:
    simulation = {
        "original_week_plan": [
            {"day": "Wed", "type": "tempo", "duration": 45},
            {"day": "Sun", "type": "long run", "duration": 90},
        ],
        "simulated_week_plan": [
            {"day": "Wed", "type": "tempo", "duration": 30},
            {"day": "Sun", "type": "long run", "duration": 90},
        ],
        "adjustments": [
            {
                "day": "Wed",
                "type": "tempo",
                "action": "shortened",
                "reason": "Only 30 minutes available.",
            }
        ],
        "preserved_workouts": [
            {"day": "Sun", "type": "long run", "duration": 90}
        ],
        "scenario_summary": "Wednesday is limited to 30 minutes.",
    }
    before = copy.deepcopy(simulation)
    res = client.post("/ai/what-if", json={"simulation": simulation})
    _assert(res.status_code == 200, f"/ai/what-if HTTP {res.status_code}")
    body = res.json()
    _assert(body["schema_version"] == "what-if.v1", "bad what-if schema")
    _assert(
        body["grounding"]["deterministic_authority"] is True,
        "what-if deterministic authority missing",
    )
    _weekly_schema(body["explanation"])
    _assert(not contains_medical_claim(body), "what-if medical claim")
    _assert(body["simulation"] == before, "what-if simulation mutated")
    _assert(simulation == before, "what-if request mutated")


def check_what_if_failure_fallbacks() -> None:
    trace = {
        "original_week_plan": [{"day": "Wed", "workout": "Tempo 45 min"}],
        "adjusted_week_plan": [{"day": "Wed", "workout": "Tempo 30 min"}],
        "modified_workouts": [
            {
                "day": "Wed",
                "workout": "Tempo 30 min",
                "reason": "Only 30 minutes available.",
            }
        ],
        "preserved_workouts": [],
        "dropped_workouts": [],
    }
    original_call = weekly_reasoning_module.call_llm
    try:
        weekly_reasoning_module.call_llm = lambda *args, **kwargs: "not json"
        malformed = weekly_reasoning_module.generate_weekly_recalibration_summary(
            trace
        )
        _weekly_schema(malformed)

        def _timeout(*args, **kwargs):
            raise LLMUnavailable("simulated timeout")

        weekly_reasoning_module.call_llm = _timeout
        timed_out = weekly_reasoning_module.generate_weekly_recalibration_summary(
            trace
        )
        _weekly_schema(timed_out)
    finally:
        weekly_reasoning_module.call_llm = original_call


def main() -> None:
    checks = [
        ("ai status", check_ai_status),
        ("daily reasoning", check_daily_reasoning),
        ("weekly reasoning", check_weekly_reasoning),
        ("what-if reasoning", check_what_if),
        ("what-if failure fallbacks", check_what_if_failure_fallbacks),
        ("behavior insights", check_behavior_insights),
    ]
    for label, fn in checks:
        fn()
        print(f"PASS {label}")
    print("OK deterministic AI gates passed")


if __name__ == "__main__":
    main()
