"""Read-only weekly/monthly training summaries.

Deterministic logic owns every metric and trend classification. AI synthesizes
that immutable aggregate into a contextual review, while validation prevents it
from adding metrics, changing training state, or persisting anything.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .ai_runtime import runtime_status
from .ai_safety import contains_medical_claim
from .json_utils import extract_json
from .llm_client import LLMUnavailable, call_llm

Period = Literal["weekly", "monthly"]
RecoveryTrend = Literal["improving", "stable", "declining", "unknown"]


class TrainingSummaryEvent(BaseModel):
    date: date
    completed: bool
    distance_miles: float | None = Field(default=None, ge=0, le=100)
    duration_minutes: int | None = Field(default=None, ge=0, le=1440)
    perceived_effort: int | None = Field(default=None, ge=1, le=10)
    recovery_score: float | None = Field(default=None, ge=0, le=1)


class TrainingSummaryRequest(BaseModel):
    period: Period
    as_of: date
    events: list[TrainingSummaryEvent] = Field(default_factory=list, max_length=100)
    confirmed_preferences: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("confirmed_preferences")
    @classmethod
    def clean_preferences(cls, values: list[str]) -> list[str]:
        return [value.strip()[:160] for value in values if value.strip()]


class TrainingSummaryMetrics(BaseModel):
    window_days: Literal[7, 30]
    window_start: date
    window_end: date
    logged_sessions: int
    completed_sessions: int
    missed_sessions: int
    consistency_pct: int = Field(ge=0, le=100)
    total_miles: float = Field(ge=0)
    total_minutes: int = Field(ge=0)
    average_effort: float | None = Field(default=None, ge=1, le=10)
    average_recovery: float | None = Field(default=None, ge=0, le=1)
    recovery_trend: RecoveryTrend
    confirmed_preferences: list[str]


class TrainingSummaryNarrative(BaseModel):
    headline: str = Field(min_length=1, max_length=100)
    overview: str = Field(min_length=1, max_length=320)
    highlight: str = Field(min_length=1, max_length=220)
    next_focus: str = Field(min_length=1, max_length=220)


class TrainingSummaryEnvelope(BaseModel):
    mode: Literal["fallback", "local_ollama", "disabled"]
    source: str
    schema_version: Literal["training-summary.v1"] = "training-summary.v1"
    fallback_used: bool
    warnings: list[str]
    grounding: dict
    metrics: TrainingSummaryMetrics
    narrative: TrainingSummaryNarrative


SYSTEM_PROMPT = """Write a concise training review from the supplied aggregate.
The metrics are final. Do not recommend a plan change, diagnose, give medical
advice, or invent facts. Do not introduce a number absent from the aggregate.
Confirmed preferences are context only. In one compact sentence, state the
completed count, logged count, total miles, and recovery trend exactly as supplied.
Keep the overview under 220 characters and every other field under 160 characters.
Return the enforced JSON schema."""

_PLAN_CHANGE_RECOMMENDATIONS = (
    "consider adjusting",
    "should adjust",
    "try adjusting",
    "increase your mileage",
    "decrease your mileage",
    "add another workout",
    "skip the workout",
    "replace the workout",
    "change your plan",
)


def generate_training_summary(
    payload: TrainingSummaryRequest,
) -> TrainingSummaryEnvelope:
    metrics = build_metrics(payload)
    fallback = deterministic_narrative(metrics, payload.period)
    narrative = fallback
    status = runtime_status()
    source = "deterministic"
    fallback_used = True
    warnings: list[str] = []

    if metrics.logged_sessions == 0:
        warnings.append(
            "No logged sessions in this window; the review is intentionally limited."
        )
    elif status["live_model_enabled"]:
        try:
            raw = call_llm(
                json.dumps(
                    {
                        "period": payload.period,
                        "metrics": metrics.model_dump(mode="json"),
                    },
                    sort_keys=True,
                ),
                system_prompt=SYSTEM_PROMPT,
                timeout_override_seconds=summary_timeout_seconds(),
                model_override=summary_model(),
                format_schema=TrainingSummaryNarrative.model_json_schema(),
                keep_alive_override=-1,
            )
            parsed = extract_json(raw)
            candidate = (
                TrainingSummaryNarrative.model_validate(parsed)
                if parsed is not None
                else None
            )
            if candidate is not None and narrative_is_grounded(candidate, metrics):
                narrative = candidate
                source = status["source"]
                fallback_used = False
            else:
                warnings.append(
                    "AI summary was invalid or ungrounded; deterministic review used."
                )
        except (LLMUnavailable, ValueError):
            warnings.append(
                "AI summary was unavailable or timed out; deterministic review used."
            )
        except Exception:
            warnings.append("AI summary failed safely; deterministic review used.")
    elif status["mode"] == "disabled":
        warnings.append("AI is disabled; deterministic review used.")
    else:
        warnings.append("Deterministic summary mode is active.")

    return TrainingSummaryEnvelope(
        mode=status["mode"],
        source=source,
        fallback_used=fallback_used,
        warnings=warnings,
        grounding={
            "deterministic_authority": True,
            "read_only": True,
            "raw_notes_excluded": True,
            "aggregated_fields": list(TrainingSummaryMetrics.model_fields),
        },
        metrics=metrics,
        narrative=narrative,
    )


def build_metrics(payload: TrainingSummaryRequest) -> TrainingSummaryMetrics:
    days = 7 if payload.period == "weekly" else 30
    window_start = payload.as_of - timedelta(days=days - 1)
    events = [
        event
        for event in payload.events
        if window_start <= event.date <= payload.as_of
    ]
    completed = [event for event in events if event.completed]
    missed = [event for event in events if not event.completed]
    efforts = [
        event.perceived_effort
        for event in completed
        if event.perceived_effort is not None
    ]
    recovery = [
        (event.date, event.recovery_score)
        for event in events
        if event.recovery_score is not None
    ]
    return TrainingSummaryMetrics(
        window_days=days,
        window_start=window_start,
        window_end=payload.as_of,
        logged_sessions=len(events),
        completed_sessions=len(completed),
        missed_sessions=len(missed),
        consistency_pct=(
            round(len(completed) / len(events) * 100) if events else 0
        ),
        total_miles=round(
            sum(event.distance_miles or 0 for event in completed), 1
        ),
        total_minutes=sum(event.duration_minutes or 0 for event in completed),
        average_effort=(
            round(sum(efforts) / len(efforts), 1) if efforts else None
        ),
        average_recovery=(
            round(
                sum(score for _, score in recovery if score is not None)
                / len(recovery),
                2,
            )
            if recovery
            else None
        ),
        recovery_trend=_recovery_trend(recovery),
        confirmed_preferences=payload.confirmed_preferences,
    )


def deterministic_narrative(
    metrics: TrainingSummaryMetrics, period: Period
) -> TrainingSummaryNarrative:
    label = "week" if period == "weekly" else "month"
    if metrics.logged_sessions == 0:
        return TrainingSummaryNarrative(
            headline=f"Your {label} is ready to take shape",
            overview="Log completed or skipped sessions to unlock a grounded review.",
            highlight="Kinetic will summarize consistency, volume, and recovery here.",
            next_focus="Keep logging outcomes; no plan change is being suggested.",
        )
    return TrainingSummaryNarrative(
        headline=f"{metrics.consistency_pct}% consistent this {label}",
        overview=(
            f"You completed {metrics.completed_sessions} of "
            f"{metrics.logged_sessions} logged sessions for "
            f"{metrics.total_miles:g} miles."
        ),
        highlight=(
            f"Recovery was {metrics.recovery_trend} across the window."
            if metrics.recovery_trend != "unknown"
            else "Recovery history was too sparse to call a trend."
        ),
        next_focus=(
            "Carry the confirmed routine forward without changing the saved plan."
            if metrics.confirmed_preferences
            else "Keep logging outcomes so the next review has more context."
        ),
    )


def narrative_is_grounded(
    narrative: TrainingSummaryNarrative, metrics: TrainingSummaryMetrics
) -> bool:
    if contains_medical_claim(narrative.model_dump()):
        return False
    narrative_text = " ".join(narrative.model_dump().values())
    lowered = narrative_text.lower()
    if any(phrase in lowered for phrase in _PLAN_CHANGE_RECOMMENDATIONS):
        return False
    allowed = {
        str(metrics.window_days),
        str(metrics.logged_sessions),
        str(metrics.completed_sessions),
        str(metrics.missed_sessions),
        str(metrics.consistency_pct),
        f"{metrics.total_miles:g}",
        str(metrics.total_minutes),
    }
    if metrics.average_effort is not None:
        allowed.add(f"{metrics.average_effort:g}")
    if metrics.average_recovery is not None:
        allowed.update(
            {
                f"{metrics.average_recovery:g}",
                f"{round(metrics.average_recovery * 100):g}",
            }
        )
    # Exact window dates are part of the supplied aggregate and are valid to
    # repeat. Remove them before scanning for unsupported numeric claims so
    # their year/month/day components are not mistaken for invented metrics.
    for allowed_date in (metrics.window_start.isoformat(), metrics.window_end.isoformat()):
        narrative_text = narrative_text.replace(allowed_date, "")
    allowed_numbers = {Decimal(number) for number in allowed}
    numbers = re.findall(r"(?<![\w-])\d+(?:\.\d+)?", narrative_text)
    return all(Decimal(number) in allowed_numbers for number in numbers)


def summary_model() -> str | None:
    return (
        os.environ.get("SUMMARY_OLLAMA_MODEL", "").strip()
        or os.environ.get("INTAKE_OLLAMA_MODEL", "").strip()
        or None
    )


def summary_timeout_seconds() -> float:
    raw = os.environ.get("SUMMARY_LLM_TIMEOUT_SECONDS", "").strip()
    try:
        value = float(raw) if raw else 24.0
    except ValueError:
        value = 24.0
    return min(max(value, 1.0), 25.0)


def _recovery_trend(
    values: list[tuple[date, float | None]],
) -> RecoveryTrend:
    scores = [
        score
        for _, score in sorted(values, key=lambda item: item[0])
        if score is not None
    ]
    if len(scores) < 4:
        return "unknown"
    midpoint = len(scores) // 2
    first = sum(scores[:midpoint]) / midpoint
    second_values = scores[midpoint:]
    second = sum(second_values) / len(second_values)
    delta = second - first
    if delta >= 0.05:
        return "improving"
    if delta <= -0.05:
        return "declining"
    return "stable"
