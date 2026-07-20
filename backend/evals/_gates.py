"""Deterministic AI safety gates for the first demo wedge."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

os.environ["KINETIC_AI_MODE"] = "fallback"
os.environ.setdefault("KINETIC_DEMO_MODE", "true")
os.environ.setdefault("KINETIC_AUTH_REQUIRED", "false")

from fastapi.testclient import TestClient

from app.ai_safety import contains_medical_claim, contradicts_selected_action
from app.api import app
from app.auth import _validate_project_token_claims
from app.llm_client import LLMUnavailable
from app import intake_parser as intake_parser_module
from app.mobile_intake import MobileIntakeRequest, route_mobile_intake
from app import training_summary as training_summary_module
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


def check_project_token_claim_validation() -> None:
    project_id = "kinetic-test-project"
    valid = _validate_project_token_claims(
        {
            "aud": project_id,
            "iss": f"https://securetoken.google.com/{project_id}",
            "sub": "bounded-test-subject",
        },
        project_id,
    )
    _assert(valid["uid"] == "bounded-test-subject", "Firebase subject was not mapped")

    for invalid in [
        {"iss": "https://securetoken.google.com/other", "sub": "subject"},
        {
            "iss": f"https://securetoken.google.com/{project_id}",
            "sub": "",
        },
    ]:
        try:
            _validate_project_token_claims(invalid, project_id)
        except ValueError:
            continue
        raise AssertionError("invalid Firebase claims were accepted")


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


def check_behavior_prompt_privacy() -> None:
    private_note = "PRIVATE ATHLETE NOTE: knee pain after mile six"
    events = [
        {
            "id": "privacy-note-1",
            "date": "2026-07-01",
            "plannedWorkout": "60 min tempo run",
            "recommendedWorkout": "40 min easy run",
            "selectedAction": "modify",
            "confidence": "moderate",
            "userResponse": "accepted",
            "actualWorkout": {
                "completed": True,
                "perceivedEffort": 6,
                "note": private_note,
            },
            "context": {"calendarLoad": "moderate", "recoveryStatus": "moderate"},
        }
    ]
    from app import behavior_insights

    sanitised = behavior_insights._sanitise_events(events)
    aggregates = behavior_insights._compute_aggregates(sanitised)
    prompt = behavior_insights._build_user_prompt(sanitised, aggregates)
    _assert(private_note not in prompt, "behavior prompt leaked raw workout note")
    _assert('"note"' not in prompt, "behavior prompt includes note field")
    _assert("perceivedEffort" in prompt, "behavior prompt lost bounded effort signal")


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


def check_intake_parsing() -> None:
    note = (
        "I'm training for a half marathon on 2026-10-18 at 32 miles per week. "
        "I prefer to run Monday, Wednesday, and Saturday. "
        "Wednesday I only have 30 minutes, and I'm traveling Thursday-Friday."
    )
    payload = {
        "text": note,
        "context": {
            "today": "2026-06-29",
            "current_goal": {"race_distance": "10k"},
            "current_profile": {"preferred_training_days": ["tue", "thu"]},
        },
    }
    before = copy.deepcopy(payload)
    res = client.post("/ai/parse-intake", json=payload)
    _assert(res.status_code == 200, f"/ai/parse-intake HTTP {res.status_code}")
    body = res.json()
    _assert(body["schema_version"] == "intake.v1", "bad intake schema")
    _assert(body["fallback_used"] is True, "fallback mode must be explicit")
    _assert(
        body["grounding"]["deterministic_authority"] is True,
        "intake deterministic authority missing",
    )
    _assert(
        body["grounding"]["apply_requires_confirmation"] is True,
        "intake confirmation boundary missing",
    )
    draft = body["draft"]
    _assert(draft["status"] == "ready", "explicit intake should be reviewable")
    _assert(
        any(c["field"] == "race_distance" and c["value"] == "half"
            for c in draft["goal_changes"]),
        "race goal not parsed",
    )
    _assert(
        any(c["field"] == "weekly_mileage" and c["value"] == 32
            for c in draft["goal_changes"]),
        "weekly mileage not parsed",
    )
    _assert(
        any(c["day"] == "wed" and c["available_minutes"] == 30
            for c in draft["availability_changes"]),
        "availability not parsed",
    )
    _assert(
        all(
            item["evidence"].lower() in note.lower()
            for item in draft["grounding"]
        ),
        "intake change lacks source grounding",
    )
    _assert(payload == before, "intake request mutated")

    sparse = client.post(
        "/ai/parse-intake",
        json={
            "text": "Things are weird next month.",
            "context": {"today": "2026-06-29"},
        },
    )
    _assert(sparse.status_code == 200, "sparse intake must degrade safely")
    sparse_draft = sparse.json()["draft"]
    _assert(
        sparse_draft["status"] in {"needs_clarification", "unsupported"},
        "sparse intake guessed a change",
    )
    _assert(
        not any(
            sparse_draft[key]
            for key in (
                "goal_changes",
                "schedule_changes",
                "availability_changes",
                "preference_changes",
            )
        ),
        "sparse intake invented a change",
    )


def check_intake_failure_fallbacks() -> None:
    original_mode = os.environ.get("KINETIC_AI_MODE")
    original_provider = os.environ.get("LLM_PROVIDER")
    original_model = os.environ.get("OLLAMA_MODEL")
    original_call = intake_parser_module.call_llm
    os.environ["KINETIC_AI_MODE"] = "local_ollama"
    os.environ["LLM_PROVIDER"] = "ollama"
    os.environ["OLLAMA_MODEL"] = "test-model"
    payload = intake_parser_module.IntakeParseRequest.model_validate(
        {
            "text": "I have 25 minutes on Tuesday.",
            "context": {"today": "2026-06-29"},
        }
    )
    try:
        captured_timeout: dict[str, object] = {}

        def _malformed(*args, **kwargs):
            captured_timeout["seconds"] = kwargs.get("timeout_override_seconds")
            captured_timeout["model_override"] = kwargs.get("model_override")
            captured_timeout["format_schema"] = kwargs.get("format_schema")
            captured_timeout["keep_alive_override"] = kwargs.get(
                "keep_alive_override"
            )
            return "not json"

        intake_parser_module.call_llm = _malformed
        malformed = intake_parser_module.parse_intake(payload)
        _assert(malformed.fallback_used, "malformed AI output did not fall back")
        _assert(
            captured_timeout.get("seconds")
            == intake_parser_module.intake_timeout_seconds(),
            "intake did not pass its dedicated model timeout",
        )
        _assert(
            captured_timeout.get("model_override")
            == intake_parser_module.intake_model(),
            "intake did not pass its dedicated model",
        )
        _assert(
            captured_timeout.get("format_schema")
            == intake_parser_module.intake_format_schema(
                intake_parser_module.deterministic_parse(
                    payload.text, payload.context.today
                )
            ),
            "intake did not request native structured output",
        )
        format_schema = captured_timeout["format_schema"]
        _assert(
            isinstance(format_schema, dict)
            and set(format_schema["properties"])
            == {"status", "availability_changes"}
            and format_schema["additionalProperties"] is False,
            "intake schema did not exclude unrelated fields",
        )
        _assert(
            captured_timeout.get("keep_alive_override") == -1,
            "intake model must stay resident after startup warmup",
        )
        _assert(
            0 < float(captured_timeout["seconds"] or 0) < 30,
            "intake model timeout must expire before the frontend timeout",
        )
        _assert(
            malformed.draft.availability_changes[0].available_minutes == 25,
            "malformed fallback lost deterministic parse",
        )

        def _timeout(*args, **kwargs):
            raise LLMUnavailable("simulated timeout")

        intake_parser_module.call_llm = _timeout
        timed_out = intake_parser_module.parse_intake(payload)
        _assert(timed_out.fallback_used, "timeout did not fall back")
        _assert(
            any("timed out" in warning.lower() or "unavailable" in warning.lower()
                for warning in timed_out.warnings),
            "timeout fallback was not surfaced",
        )

        intake_parser_module.call_llm = lambda *args, **kwargs: json.dumps(
            {
                "status": "ready",
                "availability_changes": [
                    {
                        "day": "tue",
                        "available_minutes": 25,
                        "easy_only": False,
                    }
                ],
                "experience_level": "beginner",
            }
        )
        ungrounded = intake_parser_module.parse_intake(payload)
        _assert(ungrounded.fallback_used, "ungrounded AI output was accepted")
    finally:
        intake_parser_module.call_llm = original_call
        if original_mode is None:
            os.environ.pop("KINETIC_AI_MODE", None)
        else:
            os.environ["KINETIC_AI_MODE"] = original_mode
        if original_provider is None:
            os.environ.pop("LLM_PROVIDER", None)
        else:
            os.environ["LLM_PROVIDER"] = original_provider
        if original_model is None:
            os.environ.pop("OLLAMA_MODEL", None)
        else:
            os.environ["OLLAMA_MODEL"] = original_model


def check_mobile_intake_contract() -> None:
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "ios"
        / "KineticCompanion"
        / "Tests"
        / "Fixtures"
        / "mobile-intake-contract.json"
    )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    _assert(
        fixture["contract_schema"] == "mobile-intake.v1",
        "mobile intake fixture schema drifted",
    )
    for case in fixture["route_cases"]:
        payload = {
            "schema_version": "mobile-intake.v1",
            "platform": "ios",
            "text": case["text"],
            "context": fixture["context"],
        }
        before = copy.deepcopy(payload)
        response = client.post("/ai/parse-intake", json=payload)
        _assert(
            response.status_code == 200,
            f"mobile intake {case['id']} HTTP {response.status_code}",
        )
        body = response.json()
        _assert(
            body["schema_version"] == "mobile-intake.v1",
            f"mobile intake {case['id']} schema drifted",
        )
        _assert(
            body["mutation_performed"] is False,
            f"mobile intake {case['id']} reported a mutation",
        )
        outcome = body["outcome"]
        _assert(
            outcome["route"] == case["expected_route"],
            f"mobile intake {case['id']} routed to {outcome['route']}",
        )
        _assert(
            outcome["mutable"] is case["mutable"],
            f"mobile intake {case['id']} mutable flag drifted",
        )
        if "expected_draft_kind" in case:
            _assert(
                case["expected_draft_kind"] in outcome["draft_kinds"],
                f"mobile intake {case['id']} draft kind missing",
            )
            _assert(
                outcome["review_required"]
                and outcome["confirmation_required"]
                and outcome["deterministic_validation_required"],
                f"mobile intake {case['id']} bypassed review/validation",
            )
        if "expected_reason" in case:
            _assert(
                outcome["reason"] == case["expected_reason"],
                f"mobile intake {case['id']} refusal reason drifted",
            )
        serialized = json.dumps(body).lower()
        for forbidden in (
            '"uid"',
            '"email"',
            '"token"',
            '"sleep_hours"',
            '"hrv"',
            '"resting_hr"',
            '"medical_data"',
        ):
            _assert(
                forbidden not in serialized,
                f"mobile intake {case['id']} leaked {forbidden}",
            )
        _assert(payload == before, f"mobile intake {case['id']} mutated request")

    unbounded_context = client.post(
        "/ai/parse-intake",
        json={
            "schema_version": "mobile-intake.v1",
            "platform": "ios",
            "text": "Tuesday I only have 30 minutes.",
            "context": {
                "today": "2026-07-20",
                "current_profile": {
                    "experience_level": "intermediate",
                    "preferred_training_days": ["tue"],
                    "email": "must-not-cross-boundary@example.com",
                },
                "raw_readiness": {"hrv": 55},
            },
        },
    )
    _assert(
        unbounded_context.status_code == 422,
        "mobile intake accepted identity or raw readiness context",
    )


def check_mobile_intake_failure_contract() -> None:
    original_mode = os.environ.get("KINETIC_AI_MODE")
    original_provider = os.environ.get("LLM_PROVIDER")
    original_model = os.environ.get("OLLAMA_MODEL")
    original_call = intake_parser_module.call_llm
    os.environ["KINETIC_AI_MODE"] = "local_ollama"
    os.environ["LLM_PROVIDER"] = "ollama"
    os.environ["OLLAMA_MODEL"] = "test-model"
    request = MobileIntakeRequest.model_validate(
        {
            "schema_version": "mobile-intake.v1",
            "platform": "ios",
            "text": "Tuesday I only have 30 minutes.",
            "context": {"today": "2026-07-20"},
        }
    )
    try:
        simulations = [
            (
                "ai_timeout",
                lambda *args, **kwargs: (_ for _ in ()).throw(
                    LLMUnavailable("simulated timeout")
                ),
            ),
            (
                "ai_unavailable",
                lambda *args, **kwargs: (_ for _ in ()).throw(
                    LLMUnavailable("simulated offline provider")
                ),
            ),
            ("malformed_ai", lambda *args, **kwargs: "not json"),
        ]
        for expected, replacement in simulations:
            intake_parser_module.call_llm = replacement
            result = route_mobile_intake(request)
            _assert(
                result.outcome.route == "review_draft",
                f"{expected} did not preserve deterministic review draft",
            )
            _assert(
                result.parser.failure == expected,
                f"{expected} failure mapping drifted to {result.parser.failure}",
            )
            _assert(result.parser.fallback_used, f"{expected} did not mark fallback")
    finally:
        intake_parser_module.call_llm = original_call
        if original_mode is None:
            os.environ.pop("KINETIC_AI_MODE", None)
        else:
            os.environ["KINETIC_AI_MODE"] = original_mode
        if original_provider is None:
            os.environ.pop("LLM_PROVIDER", None)
        else:
            os.environ["LLM_PROVIDER"] = original_provider
        if original_model is None:
            os.environ.pop("OLLAMA_MODEL", None)
        else:
            os.environ["OLLAMA_MODEL"] = original_model

    original_auth = os.environ.get("KINETIC_AUTH_REQUIRED")
    os.environ["KINETIC_AUTH_REQUIRED"] = "true"
    try:
        anonymous = client.post(
            "/ai/parse-intake",
            json={
                "schema_version": "mobile-intake.v1",
                "platform": "ios",
                "text": "Tuesday I only have 30 minutes.",
                "context": {"today": "2026-07-20"},
            },
        )
        _assert(
            anonymous.status_code == 401,
            f"strict-auth mobile intake returned {anonymous.status_code}",
        )
    finally:
        if original_auth is None:
            os.environ.pop("KINETIC_AUTH_REQUIRED", None)
        else:
            os.environ["KINETIC_AUTH_REQUIRED"] = original_auth


def check_mobile_checkin_compatibility() -> None:
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "ios"
        / "KineticCompanion"
        / "Tests"
        / "Fixtures"
        / "mobile-checkin-contract.json"
    )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    _assert(
        fixture["contract_schema"] == "mobile-checkin.v1",
        "mobile check-in fixture schema drifted",
    )
    workout_cases = [
        case
        for case in fixture["success_cases"]
        if case["request"]["kind"] == "workout_outcome"
    ]
    events = [
        {
            "date": case["request"]["local_day"],
            "completed": case["request"]["workout"]["status"] == "completed",
            "perceived_effort": case["request"]["workout"]["perceived_effort"],
        }
        for case in workout_cases
    ]
    payload = {
        "period": "weekly",
        "as_of": fixture["state"]["plan_slots"][0]["scheduled_date"],
        "events": events,
        "confirmed_preferences": [],
    }
    before = copy.deepcopy(payload)
    response = client.post("/ai/training-summary", json=payload)
    _assert(
        response.status_code == 200,
        f"mobile check-in training summary HTTP {response.status_code}",
    )
    body = response.json()
    _assert(body["grounding"]["read_only"], "mobile check-in review is not read-only")
    _assert(
        body["grounding"]["raw_notes_excluded"],
        "mobile check-in review does not exclude raw notes",
    )
    _assert(body["metrics"]["logged_sessions"] == 2, "check-in history count drifted")
    _assert(body["metrics"]["completed_sessions"] == 1, "completion count drifted")
    _assert(body["metrics"]["missed_sessions"] == 1, "skip count drifted")
    _assert(body["metrics"]["average_effort"] == 7, "bounded effort was lost")
    _assert(payload == before, "training review mutated mobile check-in input")

    original_auth = os.environ.get("KINETIC_AUTH_REQUIRED")
    os.environ["KINETIC_AUTH_REQUIRED"] = "true"
    try:
        anonymous = client.post("/ai/training-summary", json=payload)
        _assert(
            anonymous.status_code == 401,
            f"strict-auth mobile check-in review returned {anonymous.status_code}",
        )
    finally:
        if original_auth is None:
            os.environ.pop("KINETIC_AUTH_REQUIRED", None)
        else:
            os.environ["KINETIC_AUTH_REQUIRED"] = original_auth


def check_training_summary() -> None:
    payload = {
        "period": "weekly",
        "as_of": "2026-07-01",
        "events": [
            {
                "date": "2026-06-25",
                "completed": True,
                "distance_miles": 4,
                "duration_minutes": 38,
                "perceived_effort": 5,
                "recovery_score": 0.5,
            },
            {
                "date": "2026-06-27",
                "completed": True,
                "distance_miles": 6,
                "duration_minutes": 55,
                "perceived_effort": 6,
                "recovery_score": 0.55,
            },
            {
                "date": "2026-06-29",
                "completed": False,
                "recovery_score": 0.65,
            },
            {
                "date": "2026-07-01",
                "completed": True,
                "distance_miles": 5,
                "duration_minutes": 45,
                "perceived_effort": 5,
                "recovery_score": 0.7,
            },
            {
                "date": "2026-06-02",
                "completed": True,
                "distance_miles": 3,
            },
        ],
        "confirmed_preferences": ["Prefers long runs on Saturday"],
    }
    before = copy.deepcopy(payload)
    res = client.post("/ai/training-summary", json=payload)
    _assert(res.status_code == 200, f"training summary HTTP {res.status_code}")
    body = res.json()
    metrics = body["metrics"]
    _assert(body["schema_version"] == "training-summary.v1", "bad summary schema")
    _assert(body["fallback_used"], "fallback eval unexpectedly used live AI")
    _assert(body["grounding"]["read_only"], "summary is not marked read-only")
    _assert(
        body["grounding"]["raw_notes_excluded"],
        "summary does not declare note exclusion",
    )
    _assert(metrics["logged_sessions"] == 4, "weekly window filtering failed")
    _assert(metrics["completed_sessions"] == 3, "completion count drifted")
    _assert(metrics["missed_sessions"] == 1, "missed count drifted")
    _assert(metrics["consistency_pct"] == 75, "consistency math drifted")
    _assert(metrics["total_miles"] == 15, "completed mileage drifted")
    _assert(metrics["total_minutes"] == 138, "duration sum drifted")
    _assert(metrics["average_effort"] == 5.3, "effort average drifted")
    _assert(metrics["recovery_trend"] == "improving", "trend classification drifted")
    _assert(payload == before, "training summary request mutated")

    monthly = client.post(
        "/ai/training-summary", json={**payload, "period": "monthly"}
    ).json()
    _assert(
        monthly["metrics"]["logged_sessions"] == 5,
        "monthly window did not include older session",
    )

    sparse = client.post(
        "/ai/training-summary",
        json={
            "period": "weekly",
            "as_of": "2026-07-01",
            "events": [],
            "confirmed_preferences": [],
        },
    ).json()
    _assert(sparse["metrics"]["logged_sessions"] == 0, "sparse summary invented history")
    _assert(sparse["warnings"], "sparse summary omitted its warning")


def check_training_summary_failure_fallbacks() -> None:
    original_mode = os.environ.get("KINETIC_AI_MODE")
    original_provider = os.environ.get("LLM_PROVIDER")
    original_model = os.environ.get("OLLAMA_MODEL")
    original_call = training_summary_module.call_llm
    os.environ["KINETIC_AI_MODE"] = "local_ollama"
    os.environ["LLM_PROVIDER"] = "ollama"
    os.environ["OLLAMA_MODEL"] = "test-model"
    payload = training_summary_module.TrainingSummaryRequest.model_validate(
        {
            "period": "weekly",
            "as_of": "2026-07-01",
            "events": [
                {
                    "date": "2026-07-01",
                    "completed": True,
                    "distance_miles": 5,
                }
            ],
        }
    )
    try:
        training_summary_module.call_llm = lambda *args, **kwargs: json.dumps(
            {
                "headline": "You ran 999 miles",
                "overview": "Invented 999 mile total.",
                "highlight": "Stable.",
                "next_focus": "Keep going.",
            }
        )
        ungrounded = training_summary_module.generate_training_summary(payload)
        _assert(ungrounded.fallback_used, "invented summary number was accepted")
        _assert(
            ungrounded.metrics.total_miles == 5,
            "fallback changed deterministic metrics",
        )

        def _timeout(*args, **kwargs):
            raise LLMUnavailable("simulated timeout")

        training_summary_module.call_llm = _timeout
        timed_out = training_summary_module.generate_training_summary(payload)
        _assert(timed_out.fallback_used, "summary timeout did not fall back")
        _assert(timed_out.warnings, "summary timeout warning missing")
    finally:
        training_summary_module.call_llm = original_call
        if original_mode is None:
            os.environ.pop("KINETIC_AI_MODE", None)
        else:
            os.environ["KINETIC_AI_MODE"] = original_mode
        if original_provider is None:
            os.environ.pop("LLM_PROVIDER", None)
        else:
            os.environ["LLM_PROVIDER"] = original_provider
        if original_model is None:
            os.environ.pop("OLLAMA_MODEL", None)
        else:
            os.environ["OLLAMA_MODEL"] = original_model


def check_mobile_today_contract() -> None:
    base = {
        "biometrics": {
            "hrv": 54,
            "hrv_baseline": 52,
            "sleep_hours": 7.5,
            "resting_hr": 49,
            "fatigue_level": 2,
            "soreness_level": 1,
        },
        "training_context": {
            "planned_workout": "43 min tempo run",
            "recent_workouts": ["interval run", "easy run"],
        },
        "constraints": {
            "available_minutes": 0,
            "calendar_authoritative": True,
        },
        "bias_toward_original": 0.67,
        # Privacy-minimized clients omit preference descriptions. The scorer
        # uses only these bounded fields.
        "learned_preferences": [
            {
                "id": "pref-busy",
                "type": "busy_day_preference",
                "confidence": "high",
                "userConfirmed": True,
                "createdAt": "2026-07-01T10:00:00.000Z",
            }
        ],
    }
    fresh = client.post(
        "/decision",
        json={
            **base,
            "data_freshness": {
                "recovery_age_hours": 2,
                "calendar_age_hours": 2,
            },
        },
    )
    missing = client.post(
        "/decision",
        json={
            **base,
            "data_freshness": {
                "recovery_age_hours": 2,
                "calendar_age_hours": None,
            },
        },
    )
    _assert(fresh.status_code == 200, f"mobile fresh HTTP {fresh.status_code}")
    _assert(missing.status_code == 200, f"mobile missing HTTP {missing.status_code}")

    fresh_decision = fresh.json()["decision"]
    missing_decision = missing.json()["decision"]
    _assert(
        fresh_decision["available_minutes"] == 0
        and missing_decision["available_minutes"] == 0,
        "caller-authoritative zero-minute window was replaced",
    )
    _assert(
        any("caller-authoritative 0 min" in line for line in fresh_decision["decision_trace"]),
        "mobile calendar-authoritative trace is missing",
    )
    _assert(
        "Missing updated calendar data" in missing_decision["staleness_warnings"],
        "missing calendar did not surface a warning",
    )
    _assert(
        missing_decision["confidence"] < fresh_decision["confidence"],
        "missing calendar did not lower confidence",
    )


def main() -> None:
    checks = [
        ("ai status", check_ai_status),
        ("project token claim validation", check_project_token_claim_validation),
        ("daily reasoning", check_daily_reasoning),
        ("mobile Today contract", check_mobile_today_contract),
        ("weekly reasoning", check_weekly_reasoning),
        ("what-if reasoning", check_what_if),
        ("what-if failure fallbacks", check_what_if_failure_fallbacks),
        ("intake parsing", check_intake_parsing),
        ("intake failure fallbacks", check_intake_failure_fallbacks),
        ("mobile intake contract", check_mobile_intake_contract),
        ("mobile intake failures and strict auth", check_mobile_intake_failure_contract),
        ("mobile check-in compatibility and strict auth", check_mobile_checkin_compatibility),
        ("behavior insights", check_behavior_insights),
        ("behavior prompt privacy", check_behavior_prompt_privacy),
        ("training summary", check_training_summary),
        (
            "training summary failure fallbacks",
            check_training_summary_failure_fallbacks,
        ),
    ]
    for label, fn in checks:
        fn()
        print(f"PASS {label}")
    print("OK deterministic AI gates passed")


if __name__ == "__main__":
    main()
