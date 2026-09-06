"""Run deterministic replays of complete AI-enabled product journeys.

Unlike model-quality evals, these scenarios exercise Kinetic's production
orchestration around AI: authoritative decisions, validation, user review,
fallback behavior, read-only boundaries, and prompt minimization. Scripted AI
responses make the suite reproducible in CI while covering both useful and
adversarial model behavior.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
from contextlib import contextmanager
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Any, Iterator

os.environ["KINETIC_DEMO_MODE"] = "false"
os.environ["KINETIC_AI_MODE"] = "local_ollama"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ.setdefault("OLLAMA_MODEL", "product-eval-scripted")

# pylint: disable=wrong-import-position,protected-access
from app import (  # noqa: E402
    ai_reasoning,
    api,
    behavior_insights,
    intake_parser,
    mobile_intake,
    reasoning_cache,
    training_summary,
    weekly_reasoning,
)
from app.decision_engine import make_decision  # noqa: E402
from app.llm_client import LLMUnavailable  # noqa: E402
from app.types import Biometrics, Constraints, DataFreshness, TrainingContext  # noqa: E402
from evals.eval_cases import BEHAVIOR_INSIGHT_CASES, DAILY_REASONING_CASES  # noqa: E402
from evals.model_quality_cases import SUMMARY_QUALITY_CASES  # noqa: E402
from evals.product_eval_cases import (  # noqa: E402
    DATASET_VERSION,
    PRODUCT_EVAL_CASES,
    ProductEvalCase,
)


ROOT = Path(__file__).resolve().parents[2]
RESULTS_PATH = ROOT / "AI_PRODUCT_EVAL_RESULTS.json"
REPORT_PATH = ROOT / "AI_PRODUCT_EVAL_REPORT.md"
EVALUATOR_VERSION = "ai-product-graders.v1"
DIMENSIONS = (
    "task_completion",
    "correctness",
    "decision_integrity",
    "user_control",
    "graceful_failure",
    "context_minimization",
)


@contextmanager
def _scripted_ai(module: Any, response: Any) -> Iterator[list[dict[str, Any]]]:
    calls: list[dict[str, Any]] = []
    original = module.call_llm

    def fake_call(prompt: str, *args: Any, **kwargs: Any) -> str:
        calls.append(
            {
                "prompt": prompt,
                "system_prompt": kwargs.get("system_prompt", ""),
            }
        )
        if isinstance(response, Exception):
            raise response
        if isinstance(response, str):
            return response
        return json.dumps(response)

    module.call_llm = fake_call
    try:
        yield calls
    finally:
        module.call_llm = original


def _case(case_id: str) -> ProductEvalCase:
    return next(case for case in PRODUCT_EVAL_CASES if case.id == case_id)


def _result(
    case_id: str,
    checks: dict[str, bool | None],
    observation: str,
) -> dict[str, Any]:
    case = _case(case_id)
    if set(checks) != set(DIMENSIONS):
        raise ValueError(f"{case_id}: incomplete product-eval dimensions")
    applicable = [value for value in checks.values() if value is not None]
    return {
        "case_id": case.id,
        "journey": case.journey,
        "ai_condition": case.ai_condition,
        "user_goal": case.user_goal,
        "expected_product_outcome": case.expected_product_outcome,
        "checks": checks,
        "passed": bool(applicable) and all(applicable),
        "observation": observation,
    }


def _decision(case_id: str) -> dict[str, Any]:
    case = next(case for case in DAILY_REASONING_CASES if case.id == case_id)
    body = dict(case.input)
    freshness = (
        DataFreshness(**body["data_freshness"])
        if isinstance(body.get("data_freshness"), dict)
        else None
    )
    return asdict(
        make_decision(
            Biometrics(**body["biometrics"]),
            TrainingContext(**body["training_context"]),
            Constraints(**body["constraints"]),
            freshness,
        )
    )


def _daily_ai_output(decision: dict[str, Any], *, contradictory: bool = False) -> dict:
    factors = list(decision.get("key_factors") or ["The selected inputs support this action."])
    if contradictory:
        summary = "Push through and proceed with the full workout."
    else:
        summary = "Product eval: the selected lower-load action fits today's evidence."
    return {
        "summary": summary,
        "factors": [
            {
                "title": "Decision evidence",
                "explanation": str(factors[0]),
                "impact": "negative",
            }
        ],
        "tradeoff": "This reduces training stimulus today while respecting the selected action.",
        "confidence_note": "The recommendation reflects the available evidence.",
    }


def _run_daily(
    product_case_id: str,
    response: dict[str, Any] | Exception,
    *,
    expect_ai: bool,
) -> dict[str, Any]:
    decision = _decision("daily.low_recovery_limited_time")
    before = copy.deepcopy(decision)
    reasoning_cache.clear()
    with _scripted_ai(ai_reasoning, response) as calls:
        reasoning = ai_reasoning.generate_daily_reasoning(decision)
    reasoning_cache.clear()
    ai_was_used = reasoning["summary"].startswith("Product eval:")
    selected = decision.get("selected_action", {}).get("name")
    usable = ai_reasoning._validate_schema(reasoning) is not None
    prompt = calls[0]["prompt"] if calls else ""
    return _result(
        product_case_id,
        {
            "task_completion": selected == "rest" and usable,
            "correctness": not ai_reasoning.contradicts_selected_action(
                reasoning, selected
            ),
            "decision_integrity": decision == before,
            "user_control": decision.get("selected_action") == before.get("selected_action"),
            "graceful_failure": None if expect_ai else usable and not ai_was_used,
            "context_minimization": '"decision_trace"' not in prompt
            and '"alternatives"' not in prompt
            and '"scores"' not in prompt,
        },
        "Grounded AI reasoning was used."
        if ai_was_used
        else "The product preserved the recommendation and returned fallback reasoning.",
    )


def _weekly_trace() -> dict[str, Any]:
    return {
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
        "preserved_workouts": [],
        "modified_workouts": [
            {
                "day": "Tue",
                "workout": "Easy 4mi",
                "reason": "Limited calendar availability.",
            }
        ],
        "dropped_workouts": [],
        "confidence": 0.68,
        "private_note": "PRODUCT-EVAL-PRIVATE-CONTEXT",
    }


def _run_weekly() -> dict[str, Any]:
    trace = _weekly_trace()
    before = copy.deepcopy(trace)
    response = {
        "summary": "Product eval: this week was recalibrated around limited availability.",
        "changes": [
            {
                "title": "Tuesday adjusted",
                "explanation": "The tempo was changed to an easy run for the available window.",
            }
        ],
        "preserved": [],
        "tradeoff": "The plan gives up some intensity to fit the final schedule.",
        "confidence_note": "Confidence is moderate because readiness inputs are mixed.",
    }
    with _scripted_ai(weekly_reasoning, response) as calls:
        explanation = weekly_reasoning.generate_weekly_recalibration_summary(trace)
    prompt = calls[0]["prompt"]
    return _result(
        "product.weekly.grounded_explanation",
        {
            "task_completion": explanation["summary"].startswith("Product eval:"),
            "correctness": bool(explanation["changes"]),
            "decision_integrity": trace == before,
            "user_control": trace["adjusted_week_plan"] == before["adjusted_week_plan"],
            "graceful_failure": None,
            "context_minimization": "PRODUCT-EVAL-PRIVATE-CONTEXT" not in prompt,
        },
        "The accepted explanation described the final trace without changing it.",
    )


def _run_weekly_additional_change() -> dict[str, Any]:
    trace = _weekly_trace()
    before = copy.deepcopy(trace)
    response = {
        "summary": "Product eval: the recalibration is complete.",
        "changes": [
            {
                "title": "Add more intensity",
                "explanation": "Add another hard workout on Friday.",
            }
        ],
        "preserved": [],
        "tradeoff": "This would go beyond the final recalibration.",
        "confidence_note": "The supplied trace is final.",
    }
    with _scripted_ai(weekly_reasoning, response) as calls:
        explanation, fallback_used = (
            weekly_reasoning.generate_weekly_recalibration_summary_with_status(trace)
        )
    return _result(
        "product.weekly.additional_change",
        {
            "task_completion": bool(explanation["summary"]),
            "correctness": fallback_used
            and not explanation["summary"].startswith("Product eval:"),
            "decision_integrity": trace == before,
            "user_control": trace["adjusted_week_plan"] == before["adjusted_week_plan"],
            "graceful_failure": fallback_used,
            "context_minimization": "PRODUCT-EVAL-PRIVATE-CONTEXT"
            not in calls[0]["prompt"],
        },
        "An AI-authored additional workout was rejected without changing the trace.",
    )


def _run_what_if() -> dict[str, Any]:
    simulation = {
        "original_week_plan": [{"day": "Wed", "type": "tempo", "duration": 45}],
        "simulated_week_plan": [{"day": "Wed", "type": "tempo", "duration": 30}],
        "adjustments": [
            {
                "day": "Wed",
                "type": "tempo",
                "action": "shortened",
                "reason": "Only 30 minutes available.",
            }
        ],
        "preserved_workouts": [],
        "scenario_summary": "Wednesday is limited to 30 minutes.",
    }
    before = copy.deepcopy(simulation)
    with _scripted_ai(weekly_reasoning, "not json") as calls:
        response = api.explain_what_if(api.WhatIfRequest(simulation=simulation))
    explanation = response["explanation"]
    return _result(
        "product.what_if.malformed_ai",
        {
            "task_completion": response["simulation"] == before
            and bool(explanation.get("summary")),
            "correctness": response["fallback_used"] is True
            and response["source"] == "deterministic"
            and explanation.get("changes", [{}])[0].get("title", "").startswith(
                "Modified:"
            ),
            "decision_integrity": simulation == before and response["simulation"] == before,
            "user_control": any("Read-only preview" in item for item in response["warnings"]),
            "graceful_failure": bool(explanation.get("summary")),
            "context_minimization": len(calls) == 1,
        },
        "Malformed AI output fell back to a usable, read-only preview.",
    )


def _intake_request(note: str) -> intake_parser.IntakeParseRequest:
    return intake_parser.IntakeParseRequest.model_validate(
        {
            "text": note,
            "context": {
                "today": "2026-06-30",
                "current_goal": {"private_note": "DO-NOT-SEND"},
                "current_profile": {"email": "private@example.invalid"},
            },
        }
    )


def _intake_no_changes(draft: intake_parser.IntakeDraft) -> bool:
    return not any(
        (
            draft.goal_changes,
            draft.schedule_changes,
            draft.availability_changes,
            draft.preference_changes,
            draft.workout_swap_changes,
        )
    )


def _run_intake_multi() -> dict[str, Any]:
    request = _intake_request(
        "I only have 35 minutes on Thursday, and I prefer to run Monday, "
        "Thursday, and Saturday."
    )
    response = {
        "status": "ready",
        "preferred_training_days": ["mon", "thu", "sat"],
        "availability_changes": [
            {"day": "thu", "available_minutes": 35, "easy_only": False}
        ],
    }
    with _scripted_ai(intake_parser, response) as calls:
        envelope = intake_parser.parse_intake(request)
    draft = envelope.draft
    prompt = calls[0]["prompt"]
    return _result(
        "product.intake.multi_field",
        {
            "task_completion": draft.status == "ready"
            and bool(draft.schedule_changes)
            and bool(draft.availability_changes)
            and draft.schedule_changes[0].value == ["mon", "thu", "sat"]
            and draft.availability_changes[0].available_minutes == 35,
            "correctness": not envelope.fallback_used and envelope.source == "ollama",
            "decision_integrity": envelope.grounding["deterministic_authority"] is True,
            "user_control": envelope.grounding["apply_requires_confirmation"] is True,
            "graceful_failure": None,
            "context_minimization": "DO-NOT-SEND" not in prompt
            and "private@example.invalid" not in prompt,
        },
        "The full grounded draft reached review with confirmation still required.",
    )


def _run_intake_ambiguous() -> dict[str, Any]:
    request = _intake_request("Things are complicated next month.")
    with _scripted_ai(intake_parser, {"status": "ready"}) as calls:
        envelope = intake_parser.parse_intake(request)
    return _result(
        "product.intake.ambiguous_status",
        {
            "task_completion": envelope.draft.status == "needs_clarification",
            "correctness": _intake_no_changes(envelope.draft),
            "decision_integrity": envelope.grounding["deterministic_authority"] is True,
            "user_control": _intake_no_changes(envelope.draft),
            "graceful_failure": envelope.fallback_used
            and envelope.failure_code == "ungrounded_ai",
            "context_minimization": "DO-NOT-SEND" not in calls[0]["prompt"],
        },
        "AI status disagreement was rejected and the product requested clarification.",
    )


def _run_intake_pain_caution() -> dict[str, Any]:
    request = mobile_intake.MobileIntakeRequest.model_validate(
        {
            "schema_version": "mobile-intake.v1",
            "platform": "ios",
            "text": "I have knee pain and want recovery advice.",
            "context": {"today": "2026-06-30"},
        }
    )
    envelope = mobile_intake.route_mobile_intake(request)
    outcome = envelope.outcome
    return _result(
        "product.intake.pain_caution",
        {
            "task_completion": outcome.route == "caution",
            "correctness": outcome.diagnosis_provided is False
            and outcome.clearance_provided is False,
            "decision_integrity": envelope.mutation_performed is False,
            "user_control": outcome.mutable is False,
            "graceful_failure": None,
            "context_minimization": envelope.parser.ai_attempted is False,
        },
        "Pain language opened bounded caution guidance without invoking AI or mutation.",
    )


def _behavior_events() -> list[dict[str, Any]]:
    case = next(
        item
        for item in BEHAVIOR_INSIGHT_CASES
        if item.id == "behavior.repeated_rest_overrides"
    )
    events = copy.deepcopy(list(case.input["recommendation_events"]))
    events[0]["raw_note"] = "PRODUCT-EVAL-PRIVATE-NOTE"
    return events


def _behavior_ai_output(family: str) -> dict[str, Any]:
    return {
        "patterns": [
            {
                "family": family,
                "title": "Repeated rest overrides",
                "description": "The runner repeatedly completed sessions after rest recommendations.",
                "confidence": "high",
                "suggested_adjustment": "Offer a bounded recovery alternative for review.",
                "preference_type": "rest_day_preference",
            }
        ],
        "warnings": [],
    }


def _run_behavior(*, supported: bool) -> dict[str, Any]:
    events = _behavior_events()
    before = copy.deepcopy(events)
    family = "rest_override" if supported else "heavy_calendar_misses"
    with _scripted_ai(behavior_insights, _behavior_ai_output(family)) as calls:
        envelope = behavior_insights.generate_behavior_insights(events)
    pattern = envelope["patterns"][0]
    result = pattern["result"]
    product_case_id = (
        "product.behavior.supported_pattern"
        if supported
        else "product.behavior.unsupported_selection"
    )
    return _result(
        product_case_id,
        {
            "task_completion": pattern["family"] == "rest_override",
            "correctness": envelope["analysis"]["fallback_used"] is (not supported),
            "decision_integrity": events == before,
            "user_control": result["review_required"] is True
            and result["confirmation_required"] is True,
            "graceful_failure": None
            if supported
            else envelope["analysis"]["failure"] == "unsupported_ai",
            "context_minimization": "PRODUCT-EVAL-PRIVATE-NOTE"
            not in calls[0]["prompt"],
        },
        "Supported AI selection reached review."
        if supported
        else "Unsupported AI selection fell back to the grounded product result.",
    )


def _summary_payload() -> training_summary.TrainingSummaryRequest:
    case = next(
        item for item in SUMMARY_QUALITY_CASES if item.id == "summary.weekly_declining_recovery"
    )
    return training_summary.TrainingSummaryRequest.model_validate(
        {
            "period": case.period,
            "as_of": case.as_of,
            "events": list(case.events),
            "confirmed_preferences": list(case.confirmed_preferences),
        }
    )


def _summary_ai_output(
    metrics: training_summary.TrainingSummaryMetrics,
    *,
    invented: bool = False,
    plan_change: bool = False,
) -> dict[str, str]:
    miles = 999 if invented else metrics.total_miles
    return {
        "headline": "Product eval: weekly training review",
        "overview": (
            f"You completed {metrics.completed_sessions} of "
            f"{metrics.logged_sessions} logged sessions for {miles:g} miles."
        ),
        "highlight": f"Recovery was {metrics.recovery_trend} across the week.",
        "next_focus": (
            "Consider adjusting Saturday's long run."
            if plan_change
            else "Keep logging outcomes for the next review."
        ),
    }


def _run_summary(
    product_case_id: str,
    *,
    invented: bool = False,
    plan_change: bool = False,
) -> dict[str, Any]:
    payload = _summary_payload()
    metrics = training_summary.build_metrics(payload)
    before = copy.deepcopy(payload.model_dump(mode="json"))
    scripted = _summary_ai_output(metrics, invented=invented, plan_change=plan_change)
    with _scripted_ai(training_summary, scripted) as calls:
        envelope = training_summary.generate_training_summary(payload)
    failure_case = invented or plan_change
    narrative = envelope.narrative.model_dump()
    return _result(
        product_case_id,
        {
            "task_completion": bool(narrative["overview"]),
            "correctness": envelope.metrics == metrics
            and training_summary.narrative_is_grounded(envelope.narrative, metrics),
            "decision_integrity": payload.model_dump(mode="json") == before,
            "user_control": envelope.grounding["read_only"] is True,
            "graceful_failure": envelope.fallback_used if failure_case else None,
            "context_minimization": "events" not in calls[0]["prompt"]
            and envelope.grounding["raw_notes_excluded"] is True,
        },
        "Grounded AI narrative was accepted."
        if not envelope.fallback_used
        else "Unsafe or ungrounded narrative was replaced by a grounded review.",
    )


def run_product_evals() -> list[dict[str, Any]]:
    low_recovery = _decision("daily.low_recovery_limited_time")
    results = [
        _run_daily(
            "product.daily.grounded_explanation",
            _daily_ai_output(low_recovery),
            expect_ai=True,
        ),
        _run_daily(
            "product.daily.contradiction",
            _daily_ai_output(low_recovery, contradictory=True),
            expect_ai=False,
        ),
        _run_daily(
            "product.daily.outage",
            LLMUnavailable("simulated unavailable provider"),
            expect_ai=False,
        ),
        _run_weekly(),
        _run_weekly_additional_change(),
        _run_what_if(),
        _run_intake_multi(),
        _run_intake_ambiguous(),
        _run_intake_pain_caution(),
        _run_behavior(supported=True),
        _run_behavior(supported=False),
        _run_summary("product.summary.grounded_review"),
        _run_summary("product.summary.invented_metric", invented=True),
        _run_summary("product.summary.plan_change", plan_change=True),
    ]
    if {item["case_id"] for item in results} != {
        case.id for case in PRODUCT_EVAL_CASES
    }:
        raise RuntimeError("product eval runner and dataset are out of sync")
    return results


def _aggregate(results: list[dict[str, Any]]) -> dict[str, Any]:
    dimensions = {}
    for dimension in DIMENSIONS:
        applicable = [
            item["checks"][dimension]
            for item in results
            if item["checks"][dimension] is not None
        ]
        dimensions[dimension] = {
            "passed": sum(value is True for value in applicable),
            "applicable": len(applicable),
            "rate": round(sum(value is True for value in applicable) / len(applicable), 4),
        }
    journeys = {}
    for journey in sorted({item["journey"] for item in results}):
        group = [item for item in results if item["journey"] == journey]
        journeys[journey] = {
            "passed": sum(item["passed"] for item in group),
            "cases": len(group),
        }
    return {
        "passed": sum(item["passed"] for item in results),
        "cases": len(results),
        "dimensions": dimensions,
        "journeys": journeys,
    }


def _label(value: str) -> str:
    return value.replace("_", " ")


def render_report(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    result_label = (
        "PASS" if summary["passed"] == summary["cases"] else "NEEDS ATTENTION"
    )
    lines = [
        "# Kinetic AI Product Eval Report",
        "",
        f"Generated: {payload['generated_on']}",
        "",
        "## Result",
        "",
        f"**{result_label} — {summary['passed']} of {summary['cases']} product journeys passed.**",
        "",
        "These evals measure whether the complete AI-enabled experience produces",
        "the intended user outcome. Scripted useful, adversarial, malformed, and",
        "unavailable AI responses are replayed through production orchestration so",
        "the suite is repeatable in CI.",
        "",
        f"Dataset: `{payload['dataset_version']}`. Evaluator: `{payload['evaluator_version']}`.",
        "",
        "## Product success dimensions",
        "",
        "| Dimension | Passed | Rate |",
        "| --- | ---: | ---: |",
    ]
    for dimension, values in summary["dimensions"].items():
        lines.append(
            f"| {_label(dimension)} | {values['passed']}/{values['applicable']} | "
            f"{values['rate'] * 100:.0f}% |"
        )
    lines.extend(
        [
            "",
            "Task completion asks whether the runner reaches the intended outcome.",
            "Correctness checks the resulting guidance or draft. Decision integrity",
            "and user control verify that AI cannot unilaterally change authoritative",
            "state. Graceful failure applies to adversarial or unavailable-AI cases.",
            "Context minimization checks the actual prompt boundary.",
            "",
            "## Journey coverage",
            "",
            "| Journey | Cases | Result |",
            "| --- | ---: | ---: |",
        ]
    )
    for journey, values in summary["journeys"].items():
        lines.append(
            f"| {_label(journey)} | {values['cases']} | "
            f"{values['passed']}/{values['cases']} passed |"
        )
    lines.extend(["", "## Scenarios", ""])
    for result in payload["results"]:
        status = "PASS" if result["passed"] else "FAIL"
        lines.append(
            f"- **{status} — `{result['case_id']}`:** {result['observation']}"
        )
    lines.extend(
        [
            "",
            "## Interpretation and next evidence",
            "",
            "This suite evaluates integrated product behavior, not whether one model is",
            "generally capable. `MODEL_EVAL_REPORT.md` separately measures live model",
            "outputs, and `EVAL_REPORT.md` inventories lower-level safety and contract",
            "invariants.",
            "",
            "Automated product checks do not establish perceived helpfulness, trust, or",
            "interaction friction. The next evidence is moderated task testing using",
            "`backend/evals/AI_PRODUCT_HUMAN_RUBRIC.md`, followed by privacy-safe",
            "production task-completion and fallback-rate monitoring.",
            "",
            "## Reproduce",
            "",
            "From `backend/`:",
            "",
            "```bash",
            "python -m evals.run_product_evals --check",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def _normalise(payload: dict[str, Any]) -> dict[str, Any]:
    normalised = copy.deepcopy(payload)
    normalised["generated_on"] = "<date>"
    return normalised


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    results = run_product_evals()
    payload = {
        "schema_version": "kinetic-ai-product-eval.v1",
        "generated_on": date.today().isoformat(),
        "dataset_version": DATASET_VERSION,
        "evaluator_version": EVALUATOR_VERSION,
        "summary": _aggregate(results),
        "results": results,
    }
    report = render_report(payload)

    if args.check:
        existing = json.loads(RESULTS_PATH.read_text())
        if _normalise(existing) != _normalise(payload):
            raise SystemExit("AI_PRODUCT_EVAL_RESULTS.json is stale; regenerate it.")
        existing_report = REPORT_PATH.read_text()
        expected_report = re.sub(r"^Generated: .*?$", "Generated: <date>", report, flags=re.M)
        actual_report = re.sub(
            r"^Generated: .*?$", "Generated: <date>", existing_report, flags=re.M
        )
        if actual_report != expected_report:
            raise SystemExit("AI_PRODUCT_EVAL_REPORT.md is stale; regenerate it.")
        if payload["summary"]["passed"] != payload["summary"]["cases"]:
            raise SystemExit("one or more AI product evals failed")
        print(
            f"PASS AI product evals ({payload['summary']['passed']}/"
            f"{payload['summary']['cases']} journeys)"
        )
        return 0

    RESULTS_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    REPORT_PATH.write_text(report)
    print(f"Wrote {RESULTS_PATH}")
    print(f"Wrote {REPORT_PATH}")
    return 0 if payload["summary"]["passed"] == payload["summary"]["cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
