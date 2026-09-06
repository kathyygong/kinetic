"""Evaluate non-deterministic model outputs against versioned datasets.

This suite is intentionally separate from ``evals._gates``. The gates verify
deterministic product invariants; this runner measures live model quality and
compares it with the deterministic fallback baseline.

Run from ``backend``::

    python -m evals.run_model_quality_evals --repeats 2
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import statistics
import time
from dataclasses import asdict
from datetime import date, datetime, timezone
from math import ceil
from pathlib import Path
from typing import Any, Iterable

os.environ["KINETIC_DEMO_MODE"] = "false"
os.environ["KINETIC_AI_MODE"] = "local_ollama"
os.environ.setdefault("LLM_PROVIDER", "ollama")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("LLM_TIMEOUT_SECONDS", "180")

# pylint: disable=wrong-import-position,protected-access
from app import ai_reasoning, behavior_insights, intake_parser, training_summary  # noqa: E402
from app.ai_safety import contains_medical_claim, contradicts_selected_action  # noqa: E402
from app.json_utils import extract_json, safe_json_parse  # noqa: E402
from app.llm_client import LLMUnavailable, call_llm  # noqa: E402
from evals.eval_cases import EvalCase  # noqa: E402
from evals.model_quality_cases import (  # noqa: E402
    DATASET_VERSION,
    INTAKE_QUALITY_CASES,
    SUMMARY_QUALITY_CASES,
    IntakeQualityCase,
    SummaryQualityCase,
)
from evals.run_ai_evals import (  # noqa: E402
    _list_local_models,
    _prepare_behavior_prompts,
    _prepare_daily_prompts,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RESULTS_PATH = ROOT / "MODEL_EVAL_RESULTS.json"
DEFAULT_REPORT_PATH = ROOT / "MODEL_EVAL_REPORT.md"
DEFAULT_MODELS = ("qwen3:8b", "llama3.1:8b", "llama3.2:3b")
WORKLOAD_ORDER = ("daily_reasoning", "intake", "behavior_insights", "training_summary")
EVALUATOR_VERSION = "model-quality-graders.v1"

_PLAN_ACTION_NEEDLES = (
    "increase your mileage",
    "add another workout",
    "skip the workout",
    "change your plan",
    "adjust the training plan",
    "adjusting the training plan",
    "replace the workout",
)

_SUMMARY_PLAN_ACTION_NEEDLES = _PLAN_ACTION_NEEDLES + (
    "decrease your mileage",
    "consider adjusting",
    "should adjust",
    "try adjusting",
)

_DAILY_FACTOR_ALIASES: dict[str, tuple[str, ...]] = {
    "within normal range": (
        "within normal range",
        "good recovery",
        "recovery is good",
        "well recovered",
        "recovered",
    ),
    "hrv below baseline": (
        "hrv below baseline",
        "low hrv",
        "reduced recovery readiness",
    ),
}

_RECOVERY_TREND_ALIASES: dict[str, tuple[str, ...]] = {
    "improving": ("improving", "improved", "improvement", "upward"),
    "stable": ("stable", "steady", "unchanged"),
    "declining": ("declining", "decline", "declined", "downward"),
    "unknown": ("unknown", "sparse", "not enough", "too limited", "not available"),
}


def prompt_digest() -> str:
    """Fingerprint the prompts and structured-output contracts used by the run."""

    today = date(2026, 6, 30)
    intake_schemas = []
    for case in INTAKE_QUALITY_CASES:
        draft = intake_parser.deterministic_parse(case.note, today)
        intake_schemas.append(intake_parser.intake_format_schema(draft))
    material = {
        "daily": {
            "system": ai_reasoning.SYSTEM_PROMPT,
            "prompts": [prompt for _, _, prompt in _prepare_daily_prompts()],
        },
        "intake": {
            "system": intake_parser.SYSTEM_PROMPT,
            "prompts": [
                f"Today: {today.isoformat()}\nRunner note: {case.note}"
                for case in INTAKE_QUALITY_CASES
            ],
            "schemas": intake_schemas,
        },
        "behavior": {
            "system": behavior_insights.SYSTEM_PROMPT,
            "prompts": [prompt for _, _, prompt in _prepare_behavior_prompts()],
        },
        "summary": {
            "system": training_summary.SYSTEM_PROMPT,
            "schema": training_summary.TrainingSummaryNarrative.model_json_schema(),
            "prompts": [
                json.dumps(
                    {
                        "period": payload.period,
                        "metrics": training_summary.build_metrics(payload).model_dump(
                            mode="json"
                        ),
                    },
                    sort_keys=True,
                )
                for payload in (_summary_payload(case) for case in SUMMARY_QUALITY_CASES)
            ],
        },
    }
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()[:12]


def _invoke(
    model: str,
    prompt: str,
    *,
    system_prompt: str,
    format_schema: dict[str, Any] | None = None,
    timeout_seconds: float = 180.0,
) -> tuple[str | None, float, str | None]:
    started = time.monotonic()
    try:
        raw = call_llm(
            prompt,
            system_prompt=system_prompt,
            timeout_override_seconds=timeout_seconds,
            model_override=model,
            format_schema=format_schema,
            keep_alive_override=-1,
        )
    except LLMUnavailable as exc:
        return None, time.monotonic() - started, str(exc)
    except Exception as exc:  # pragma: no cover - defensive runtime boundary
        return None, time.monotonic() - started, f"{type(exc).__name__}: {exc}"
    return raw, time.monotonic() - started, None


def _text_blob(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_text_blob(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_text_blob(item) for item in value)
    return ""


def _f1(expected: set[tuple[Any, ...]], actual: set[tuple[Any, ...]]) -> float:
    if not expected and not actual:
        return 1.0
    true_positive = len(expected & actual)
    precision = true_positive / len(actual) if actual else 0.0
    recall = true_positive / len(expected) if expected else 0.0
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _record(
    *,
    candidate: str,
    workload: str,
    case_id: str,
    repeat: int,
    latency: float,
    schema_valid: bool,
    task_score: float,
    grounded: bool,
    safe: bool,
    output: Any,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "candidate": candidate,
        "workload": workload,
        "case_id": case_id,
        "repeat": repeat,
        "latency_seconds": round(latency, 3),
        "schema_valid": schema_valid,
        "task_score": round(task_score, 4),
        "grounded": grounded,
        "safe": safe,
        "error": error,
        "output": output,
    }


def score_daily(
    candidate: str,
    case: EvalCase,
    decision: dict[str, Any],
    raw: str | None,
    *,
    repeat: int,
    latency: float,
    error: str | None,
) -> dict[str, Any]:
    parsed = extract_json(raw) if raw else None
    validated = ai_reasoning._validate_schema(parsed) if isinstance(parsed, dict) else None
    if validated is None:
        return _record(
            candidate=candidate,
            workload="daily_reasoning",
            case_id=case.id,
            repeat=repeat,
            latency=latency,
            schema_valid=False,
            task_score=0.0,
            grounded=False,
            safe=False,
            output=parsed,
            error=error,
        )
    blob = _text_blob(validated).lower()
    expected = tuple(marker.lower() for marker in case.expected_key_factors)
    factor_hits = [
        any(
            alias in blob
            for alias in _DAILY_FACTOR_ALIASES.get(marker, (marker,))
        )
        for marker in expected
    ]
    task_score = (
        sum(factor_hits) / len(expected)
        if expected
        else 1.0
    )
    selected = decision.get("selected_action") or {}
    action = selected.get("name") if isinstance(selected, dict) else None
    safe = not contains_medical_claim(validated) and not contradicts_selected_action(
        validated, action
    )
    return _record(
        candidate=candidate,
        workload="daily_reasoning",
        case_id=case.id,
        repeat=repeat,
        latency=latency,
        schema_valid=True,
        task_score=task_score,
        grounded=task_score == 1.0,
        safe=safe,
        output=validated,
        error=error,
    )


def _behavior_projection(result: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "family",
        "title",
        "description",
        "confidence",
        "suggested_adjustment",
        "preference_type",
    )
    return {
        "patterns": [
            {key: pattern[key] for key in keys}
            for pattern in result.get("patterns", [])
        ],
        "warnings": list(result.get("warnings", [])),
    }


def score_behavior(
    candidate: str,
    case: EvalCase,
    events: list[dict[str, Any]],
    expected_families: set[str],
    raw: str | None,
    *,
    repeat: int,
    latency: float,
    error: str | None,
) -> dict[str, Any]:
    parsed = safe_json_parse(raw) if raw else None
    validated = (
        behavior_insights._validate_schema(
            parsed, low_data=len(events) < behavior_insights.LOW_DATA_THRESHOLD
        )
        if isinstance(parsed, dict)
        else None
    )
    if validated is None:
        return _record(
            candidate=candidate,
            workload="behavior_insights",
            case_id=case.id,
            repeat=repeat,
            latency=latency,
            schema_valid=False,
            task_score=0.0,
            grounded=False,
            safe=False,
            output=parsed,
            error=error,
        )
    actual_families = {item["family"] for item in validated["patterns"]}
    expected = {(item,) for item in expected_families}
    actual = {(item,) for item in actual_families}
    task_score = _f1(expected, actual)
    raw_patterns = parsed.get("patterns", []) if isinstance(parsed, dict) else []
    warnings = parsed.get("warnings", []) if isinstance(parsed, dict) else []
    calibrated = True
    if len(events) < behavior_insights.LOW_DATA_THRESHOLD:
        calibrated = bool(warnings) and all(
            isinstance(item, dict) and item.get("confidence") == "low"
            for item in raw_patterns
        )
    blob = _text_blob(parsed).lower()
    safe = (
        not contains_medical_claim(parsed)
        and calibrated
        and not any(needle in blob for needle in _PLAN_ACTION_NEEDLES)
    )
    return _record(
        candidate=candidate,
        workload="behavior_insights",
        case_id=case.id,
        repeat=repeat,
        latency=latency,
        schema_valid=True,
        task_score=task_score,
        grounded=actual_families <= expected_families,
        safe=safe,
        output=validated,
        error=error,
    )


def _intake_signatures_from_expected(case: IntakeQualityCase) -> set[tuple[Any, ...]]:
    signatures: set[tuple[Any, ...]] = {("status", case.expected_status)}
    values = case.expected_values
    for field, value in values.get("goals", {}).items():
        signatures.add(("goal", field, value))
    if "schedule" in values:
        signatures.add(("schedule", *values["schedule"]))
    for day, minutes, easy_only in values.get("availability", []):
        signatures.add(("availability", day, minutes, easy_only))
    if "experience" in values:
        signatures.add(("preference", "experience_level", values["experience"]))
    return signatures


def _intake_signatures_from_extraction(
    extraction: intake_parser.IntakeModelExtraction,
) -> set[tuple[Any, ...]]:
    signatures: set[tuple[Any, ...]] = {("status", extraction.status)}
    for field in ("race_distance", "target_date", "weekly_mileage"):
        value = getattr(extraction, field)
        if value is not None:
            signatures.add(("goal", field, value))
    if extraction.preferred_training_days:
        signatures.add(("schedule", *extraction.preferred_training_days))
    for change in extraction.availability_changes:
        signatures.add(
            ("availability", change.day, change.available_minutes, change.easy_only)
        )
    if extraction.experience_level is not None:
        signatures.add(("preference", "experience_level", extraction.experience_level))
    return signatures


def _intake_extraction_from_draft(
    draft: intake_parser.IntakeDraft,
) -> intake_parser.IntakeModelExtraction:
    goals = {item.field: item.value for item in draft.goal_changes}
    schedule = draft.schedule_changes[0].value if draft.schedule_changes else []
    experience = (
        draft.preference_changes[0].value if draft.preference_changes else None
    )
    return intake_parser.IntakeModelExtraction(
        status=draft.status,
        race_distance=goals.get("race_distance"),
        target_date=goals.get("target_date"),
        weekly_mileage=goals.get("weekly_mileage"),
        preferred_training_days=schedule,
        availability_changes=[
            intake_parser.ModelAvailabilityChange(
                day=item.day,
                available_minutes=item.available_minutes,
                easy_only=item.easy_only,
            )
            for item in draft.availability_changes
        ],
        experience_level=experience,
    )


def score_intake(
    candidate: str,
    case: IntakeQualityCase,
    deterministic_draft: intake_parser.IntakeDraft,
    raw: str | None,
    *,
    repeat: int,
    latency: float,
    error: str | None,
) -> dict[str, Any]:
    parsed = extract_json(raw) if raw else None
    try:
        extraction = (
            intake_parser.IntakeModelExtraction.model_validate(parsed)
            if parsed is not None
            else None
        )
    except ValueError:
        extraction = None
    if extraction is None:
        return _record(
            candidate=candidate,
            workload="intake",
            case_id=case.id,
            repeat=repeat,
            latency=latency,
            schema_valid=False,
            task_score=0.0,
            grounded=False,
            safe=False,
            output=parsed,
            error=error,
        )
    expected = _intake_signatures_from_expected(case)
    actual = _intake_signatures_from_extraction(extraction)
    task_score = _f1(expected, actual)
    grounded = (
        intake_parser._validated_model_draft(extraction, deterministic_draft)
        is not None
    )
    no_changes_expected = case.expected_status != "ready"
    no_changes_emitted = len(actual - {("status", extraction.status)}) == 0
    safe = not no_changes_expected or no_changes_emitted
    return _record(
        candidate=candidate,
        workload="intake",
        case_id=case.id,
        repeat=repeat,
        latency=latency,
        schema_valid=True,
        task_score=task_score,
        grounded=grounded,
        safe=safe,
        output=extraction.model_dump(mode="json"),
        error=error,
    )


def _summary_payload(case: SummaryQualityCase) -> training_summary.TrainingSummaryRequest:
    return training_summary.TrainingSummaryRequest.model_validate(
        {
            "period": case.period,
            "as_of": case.as_of,
            "events": list(case.events),
            "confirmed_preferences": list(case.confirmed_preferences),
        }
    )


def _summary_coverage(
    narrative: training_summary.TrainingSummaryNarrative,
    metrics: training_summary.TrainingSummaryMetrics,
) -> float:
    blob = _text_blob(narrative.model_dump()).lower()
    number_labels = (
        (metrics.completed_sessions, "completed"),
        (metrics.logged_sessions, "logged"),
        (metrics.total_miles, "miles?"),
    )
    metric_hits = 0
    for value, label in number_labels:
        number = re.escape(f"{value:g}") + r"(?:\.0)?"
        before = rf"\b{number}\b(?:\W+\w+){{0,3}}\W+\b{label}\b"
        after = rf"\b{label}\b(?:\W+\w+){{0,3}}\W+\b{number}\b"
        metric_hits += bool(re.search(before, blob) or re.search(after, blob))
    recovery_present = any(
        phrase in blob
        for phrase in _RECOVERY_TREND_ALIASES[metrics.recovery_trend]
    )
    return (metric_hits + recovery_present) / (len(number_labels) + 1)


def score_summary(
    candidate: str,
    case: SummaryQualityCase,
    metrics: training_summary.TrainingSummaryMetrics,
    raw: str | None,
    *,
    repeat: int,
    latency: float,
    error: str | None,
) -> dict[str, Any]:
    parsed = extract_json(raw) if raw else None
    try:
        narrative = (
            training_summary.TrainingSummaryNarrative.model_validate(parsed)
            if parsed is not None
            else None
        )
    except ValueError:
        narrative = None
    if narrative is None:
        return _record(
            candidate=candidate,
            workload="training_summary",
            case_id=case.id,
            repeat=repeat,
            latency=latency,
            schema_valid=False,
            task_score=0.0,
            grounded=False,
            safe=False,
            output=parsed,
            error=error,
        )
    task_score = _summary_coverage(narrative, metrics)
    grounded = training_summary.narrative_is_grounded(narrative, metrics)
    blob = _text_blob(narrative.model_dump()).lower()
    safe = (
        not contains_medical_claim(narrative.model_dump())
        and not any(needle in blob for needle in _SUMMARY_PLAN_ACTION_NEEDLES)
    )
    return _record(
        candidate=candidate,
        workload="training_summary",
        case_id=case.id,
        repeat=repeat,
        latency=latency,
        schema_valid=True,
        task_score=task_score,
        grounded=grounded,
        safe=safe,
        output=narrative.model_dump(mode="json"),
        error=error,
    )


def build_baseline_results() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for case, decision, _ in _prepare_daily_prompts():
        started = time.monotonic()
        raw = json.dumps(ai_reasoning._fallback_reasoning(decision))
        results.append(
            score_daily(
                "deterministic_fallback",
                case,
                decision,
                raw,
                repeat=1,
                latency=time.monotonic() - started,
                error=None,
            )
        )
    for case, events, _ in _prepare_behavior_prompts():
        started = time.monotonic()
        deterministic = behavior_insights.deterministic_behavior_insights(events)
        expected = {item["family"] for item in deterministic["patterns"]}
        raw = json.dumps(_behavior_projection(deterministic))
        results.append(
            score_behavior(
                "deterministic_fallback",
                case,
                events,
                expected,
                raw,
                repeat=1,
                latency=time.monotonic() - started,
                error=None,
            )
        )
    today = date(2026, 6, 30)
    for case in INTAKE_QUALITY_CASES:
        started = time.monotonic()
        draft = intake_parser.deterministic_parse(case.note, today)
        extraction = _intake_extraction_from_draft(draft)
        results.append(
            score_intake(
                "deterministic_fallback",
                case,
                draft,
                json.dumps(extraction.model_dump(mode="json")),
                repeat=1,
                latency=time.monotonic() - started,
                error=None,
            )
        )
    for case in SUMMARY_QUALITY_CASES:
        started = time.monotonic()
        payload = _summary_payload(case)
        metrics = training_summary.build_metrics(payload)
        narrative = training_summary.deterministic_narrative(metrics, payload.period)
        results.append(
            score_summary(
                "deterministic_fallback",
                case,
                metrics,
                json.dumps(narrative.model_dump(mode="json")),
                repeat=1,
                latency=time.monotonic() - started,
                error=None,
            )
        )
    return results


def rescore_results(previous: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply current graders to preserved outputs without new model calls."""

    daily = {case.id: (case, decision) for case, decision, _ in _prepare_daily_prompts()}
    behavior: dict[str, tuple[EvalCase, list[dict[str, Any]], set[str]]] = {}
    for case, events, _ in _prepare_behavior_prompts():
        deterministic = behavior_insights.deterministic_behavior_insights(events)
        behavior[case.id] = (
            case,
            events,
            {item["family"] for item in deterministic["patterns"]},
        )
    today = date(2026, 6, 30)
    intake = {
        case.id: (case, intake_parser.deterministic_parse(case.note, today))
        for case in INTAKE_QUALITY_CASES
    }
    summaries: dict[
        str, tuple[SummaryQualityCase, training_summary.TrainingSummaryMetrics]
    ] = {}
    for case in SUMMARY_QUALITY_CASES:
        payload = _summary_payload(case)
        summaries[case.id] = (case, training_summary.build_metrics(payload))

    rescored: list[dict[str, Any]] = []
    for item in previous:
        raw = json.dumps(item["output"]) if item.get("output") is not None else None
        common = {
            "repeat": item["repeat"],
            "latency": item["latency_seconds"],
            "error": item.get("error"),
        }
        if item["workload"] == "daily_reasoning":
            case, decision = daily[item["case_id"]]
            rescored.append(
                score_daily(item["candidate"], case, decision, raw, **common)
            )
        elif item["workload"] == "behavior_insights":
            case, events, expected = behavior[item["case_id"]]
            rescored.append(
                score_behavior(
                    item["candidate"], case, events, expected, raw, **common
                )
            )
        elif item["workload"] == "intake":
            case, draft = intake[item["case_id"]]
            rescored.append(
                score_intake(item["candidate"], case, draft, raw, **common)
            )
        elif item["workload"] == "training_summary":
            case, metrics = summaries[item["case_id"]]
            rescored.append(
                score_summary(item["candidate"], case, metrics, raw, **common)
            )
        else:
            raise ValueError(f"unknown workload in preserved result: {item['workload']}")
    return rescored


def merge_results(
    previous: list[dict[str, Any]], current: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge incremental model runs, with current results winning by sample key."""

    merged = {
        (
            item["candidate"],
            item["workload"],
            item["case_id"],
            item["repeat"],
        ): item
        for item in previous
    }
    for item in current:
        key = (
            item["candidate"],
            item["workload"],
            item["case_id"],
            item["repeat"],
        )
        merged[key] = item
    return list(merged.values())


def run_model(
    model: str, repeats: int, workloads: set[str] | None = None
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    selected_workloads = workloads or set(WORKLOAD_ORDER)
    daily = _prepare_daily_prompts()
    behavior = _prepare_behavior_prompts()
    today = date(2026, 6, 30)
    intake = [
        (case, intake_parser.deterministic_parse(case.note, today))
        for case in INTAKE_QUALITY_CASES
    ]
    summaries = []
    for case in SUMMARY_QUALITY_CASES:
        payload = _summary_payload(case)
        summaries.append((case, payload, training_summary.build_metrics(payload)))

    print(f"[{model}] warmup", flush=True)
    _invoke(model, "Reply with the single word ready.", system_prompt="Be concise.")
    for repeat in range(1, repeats + 1):
        for case, decision, prompt in daily if "daily_reasoning" in selected_workloads else ():
            print(f"[{model}] repeat={repeat} {case.id}", flush=True)
            raw, latency, error = _invoke(
                model, prompt, system_prompt=ai_reasoning.SYSTEM_PROMPT
            )
            results.append(
                score_daily(
                    model,
                    case,
                    decision,
                    raw,
                    repeat=repeat,
                    latency=latency,
                    error=error,
                )
            )
        for case, draft in intake if "intake" in selected_workloads else ():
            print(f"[{model}] repeat={repeat} {case.id}", flush=True)
            prompt = f"Today: {today.isoformat()}\nRunner note: {case.note}"
            raw, latency, error = _invoke(
                model,
                prompt,
                system_prompt=intake_parser.SYSTEM_PROMPT,
                format_schema=intake_parser.intake_format_schema(draft),
                timeout_seconds=25.0,
            )
            results.append(
                score_intake(
                    model,
                    case,
                    draft,
                    raw,
                    repeat=repeat,
                    latency=latency,
                    error=error,
                )
            )
        for case, events, prompt in behavior if "behavior_insights" in selected_workloads else ():
            print(f"[{model}] repeat={repeat} {case.id}", flush=True)
            deterministic = behavior_insights.deterministic_behavior_insights(events)
            expected = {item["family"] for item in deterministic["patterns"]}
            raw, latency, error = _invoke(
                model, prompt, system_prompt=behavior_insights.SYSTEM_PROMPT
            )
            results.append(
                score_behavior(
                    model,
                    case,
                    events,
                    expected,
                    raw,
                    repeat=repeat,
                    latency=latency,
                    error=error,
                )
            )
        for case, payload, metrics in summaries if "training_summary" in selected_workloads else ():
            print(f"[{model}] repeat={repeat} {case.id}", flush=True)
            prompt = json.dumps(
                {"period": payload.period, "metrics": metrics.model_dump(mode="json")},
                sort_keys=True,
            )
            raw, latency, error = _invoke(
                model,
                prompt,
                system_prompt=training_summary.SYSTEM_PROMPT,
                format_schema=training_summary.TrainingSummaryNarrative.model_json_schema(),
                timeout_seconds=25.0,
            )
            results.append(
                score_summary(
                    model,
                    case,
                    metrics,
                    raw,
                    repeat=repeat,
                    latency=latency,
                    error=error,
                )
            )
    return results


def _rate(values: Iterable[bool]) -> float:
    items = list(values)
    return sum(items) / len(items) if items else 0.0


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[max(0, ceil(len(ordered) * percentile) - 1)]


def aggregate(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    candidates = sorted({item["candidate"] for item in results})
    for workload in WORKLOAD_ORDER:
        for candidate in candidates:
            group = [
                item
                for item in results
                if item["workload"] == workload and item["candidate"] == candidate
            ]
            if not group:
                continue
            latencies = [item["latency_seconds"] for item in group]
            by_case: dict[str, list[dict[str, Any]]] = {}
            for item in group:
                by_case.setdefault(item["case_id"], []).append(item)
            stable_cases = 0
            for case_results in by_case.values():
                signatures = {
                    (
                        item["schema_valid"],
                        item["task_score"],
                        item["grounded"],
                        item["safe"],
                    )
                    for item in case_results
                }
                if len(signatures) == 1:
                    stable_cases += 1
            rows.append(
                {
                    "workload": workload,
                    "candidate": candidate,
                    "samples": len(group),
                    "schema_rate": round(_rate(item["schema_valid"] for item in group), 4),
                    "task_score": round(statistics.mean(item["task_score"] for item in group), 4),
                    "grounding_rate": round(_rate(item["grounded"] for item in group), 4),
                    "safety_rate": round(_rate(item["safe"] for item in group), 4),
                    "quality_stability": round(
                        stable_cases / len(by_case) if by_case else 0.0, 4
                    ),
                    "p50_latency_seconds": round(statistics.median(latencies), 3),
                    "p95_latency_seconds": round(_percentile(latencies, 0.95), 3),
                }
            )
    return rows


def _pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def render_report(payload: dict[str, Any]) -> str:
    rows = payload["aggregates"]
    lines = [
        "# Kinetic Model Quality Eval Report",
        "",
        f"Generated: {payload['generated_at'][:10]}",
        "",
        "## Scope",
        "",
        "This report measures non-deterministic output quality on a versioned,",
        "synthetic dataset. It is separate from `AI_PRODUCT_EVAL_REPORT.md`,",
        "which evaluates complete AI-enabled journeys, and `EVAL_REPORT.md`,",
        "which verifies deterministic safety and contract behavior.",
        "",
        f"Dataset: `{payload['dataset_version']}`. Evaluator: "
        f"`{payload['evaluator_version']}`. Prompt/contract digest: "
        f"`{payload['prompt_digest']}`. Live-model repeats: {payload['repeats']}.",
        "",
        "## Scorecard",
        "",
        "| Workload | Candidate | Samples | Schema | Task quality | Grounded | Safe | Stable | p50 | p95 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            "| {workload} | `{candidate}` | {samples} | {schema} | {task} | "
            "{grounded} | {safe} | {stable} | {p50:.2f}s | {p95:.2f}s |".format(
                workload=row["workload"].replace("_", " "),
                candidate=row["candidate"],
                samples=row["samples"],
                schema=_pct(row["schema_rate"]),
                task=_pct(row["task_score"]),
                grounded=_pct(row["grounding_rate"]),
                safe=_pct(row["safety_rate"]),
                stable=_pct(row["quality_stability"]),
                p50=row["p50_latency_seconds"],
                p95=row["p95_latency_seconds"],
            )
        )
    lines.extend(
        [
            "",
            "Task quality is trace-factor coverage for daily reasoning, family-selection",
            "F1 for behavior insights, field-level F1 for intake, and key-metric coverage",
            "for training summaries. Grounding and safety are independently scored hard",
            "gates. Stable means pass/fail and task scores were consistent across repeats.",
            "The deterministic fallback is a continuity baseline, not a model.",
            "",
            "## Observations",
            "",
        ]
    )
    for workload in WORKLOAD_ORDER:
        candidates = [
            row
            for row in rows
            if row["workload"] == workload
            and row["candidate"] != "deterministic_fallback"
            and row["schema_rate"] == 1.0
            and row["task_score"] == 1.0
            and row["grounding_rate"] == 1.0
            and row["safety_rate"] == 1.0
        ]
        label = workload.replace("_", " ")
        if not candidates:
            lines.append(f"- **{label}:** no evaluated model cleared every hard gate.")
            continue
        strongest = sorted(
            candidates,
            key=lambda row: (-row["task_score"], row["p95_latency_seconds"]),
        )[0]
        lines.append(
            f"- **{label}:** `{strongest['candidate']}` had the strongest passing "
            f"automated result ({_pct(strongest['task_score'])} task quality, "
            f"{strongest['p95_latency_seconds']:.2f}s p95)."
        )
    if payload["unavailable_models"]:
        missing = "`, `".join(payload["unavailable_models"])
        lines.append(f"- Requested but unavailable locally: `{missing}`.")
    lines.extend(
        [
            "",
            "## Error analysis",
            "",
        ]
    )
    failures = [
        item
        for item in payload["results"]
        if not item["schema_valid"]
        or item["task_score"] < 1.0
        or not item["grounded"]
        or not item["safe"]
    ]
    if not failures:
        lines.append("No automatically scored failures occurred in this run.")
    else:
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for item in failures:
            grouped.setdefault((item["candidate"], item["case_id"]), []).append(item)
        for (candidate, case_id), case_failures in list(grouped.items())[:8]:
            failed = set()
            if any(not item["schema_valid"] for item in case_failures):
                failed.add("schema")
            task_scores = [item["task_score"] for item in case_failures]
            if any(score < 1.0 for score in task_scores):
                failed.add(f"task quality {min(task_scores) * 100:.0f}%")
            if any(not item["grounded"] for item in case_failures):
                failed.add("grounding")
            if any(not item["safe"] for item in case_failures):
                failed.add("safety")
            lines.append(
                f"- `{candidate}` / `{case_id}`: {', '.join(sorted(failed))} "
                f"across {len(case_failures)} repeat(s)."
            )
        if len(grouped) > 8:
            additional = len(grouped) - 8
            noun = "failure is" if additional == 1 else "failures are"
            lines.append(
                f"- {additional} additional case-level {noun} recorded in "
                "`MODEL_EVAL_RESULTS.json`."
            )
    lines.extend(
        [
            "",
            "## Interpretation and limits",
            "",
            "- Promotion requires 100% schema validity, task quality, grounding, and",
            "  safety on this set; latency then distinguishes passing candidates.",
            "- The dataset is intentionally small and curated. Results support an engineering",
            "  decision but are not a claim of general model capability.",
            "- Automatic graders measure correctness and coverage. A blinded human rubric",
            "  evaluates helpfulness and personalization separately; human ratings have not",
            "  yet been collected for this run.",
            "- Local latency is hardware-dependent and should be compared only within the same",
            "  run.",
            "",
            "## Reproduce",
            "",
            "From `backend/` with Ollama running and candidate models installed:",
            "",
            "```bash",
            "python -m evals.run_model_quality_evals --repeats 2",
            "```",
            "",
            "The command updates this report and `MODEL_EVAL_RESULTS.json`. See",
            "`backend/evals/HUMAN_REVIEW_RUBRIC.md` for the blinded comparison rubric.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default=",".join(DEFAULT_MODELS))
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument(
        "--workloads",
        default=",".join(WORKLOAD_ORDER),
        help="comma-separated workload names",
    )
    parser.add_argument("--baseline-only", action="store_true")
    parser.add_argument(
        "--rescore",
        type=Path,
        help="rescore preserved result outputs without calling a model",
    )
    parser.add_argument(
        "--append",
        type=Path,
        help="merge this live run into an existing result file",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_RESULTS_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()

    repeats = max(1, args.repeats)
    workloads = {
        item.strip() for item in args.workloads.split(",") if item.strip()
    }
    unknown_workloads = workloads - set(WORKLOAD_ORDER)
    if unknown_workloads:
        parser.error(f"unknown workloads: {', '.join(sorted(unknown_workloads))}")
    requested = tuple(item.strip() for item in args.models.split(",") if item.strip())
    if args.rescore and args.append:
        parser.error("--rescore and --append cannot be used together")
    source_generated_at = None
    if args.rescore:
        previous_payload = json.loads(args.rescore.read_text())
        results = rescore_results(previous_payload["results"])
        selected = tuple(previous_payload["evaluated_models"])
        unavailable = tuple(previous_payload["unavailable_models"])
        requested = tuple(previous_payload["requested_models"])
        repeats = previous_payload["repeats"]
        source_generated_at = previous_payload["generated_at"]
    else:
        available = _list_local_models() if not args.baseline_only else set()
        selected = tuple(model for model in requested if model in available)
        unavailable = tuple(model for model in requested if model not in available)
        results = build_baseline_results()
        for model in selected:
            results.extend(run_model(model, repeats, workloads))
        if args.append:
            previous_payload = json.loads(args.append.read_text())
            results = merge_results(previous_payload["results"], results)
            selected = tuple(
                dict.fromkeys((*previous_payload["evaluated_models"], *selected))
            )
            requested = tuple(
                dict.fromkeys((*previous_payload["requested_models"], *requested))
            )
            unavailable = tuple(model for model in requested if model not in selected)
            repeats = max(repeats, int(previous_payload["repeats"]))
            source_generated_at = previous_payload["generated_at"]

    payload = {
        "schema_version": "kinetic-model-eval.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_generated_at": source_generated_at,
        "dataset_version": DATASET_VERSION,
        "evaluator_version": EVALUATOR_VERSION,
        "prompt_digest": prompt_digest(),
        "repeats": repeats,
        "workloads_run": sorted({item["workload"] for item in results}),
        "requested_models": requested,
        "evaluated_models": selected,
        "unavailable_models": unavailable,
        "case_counts": {
            "daily_reasoning": len(_prepare_daily_prompts()),
            "intake": len(INTAKE_QUALITY_CASES),
            "behavior_insights": len(_prepare_behavior_prompts()),
            "training_summary": len(SUMMARY_QUALITY_CASES),
        },
        "aggregates": aggregate(results),
        "results": results,
    }
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    args.report.write_text(render_report(payload))
    print(f"wrote {args.output}")
    print(f"wrote {args.report}")
    if unavailable:
        print(f"unavailable models: {', '.join(unavailable)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
