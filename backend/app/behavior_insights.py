"""AI behavior-insights layer for Kinetic.

This module is **advisory only**. It looks at a runner's recent
recommendation history and surfaces conservative behavioural patterns
("you tend to skip Tuesdays when the calendar is heavy", "you reject
adjustments because they feel too easy", ...). It does not touch the
training plan and it does not produce diagnostic claims.

Inputs
------
A flat list of ``RecommendationEvent`` dicts as serialised by
``frontend/lib/behaviorTypes.ts``::

    {
      "id":       str,
      "date":     "YYYY-MM-DD",
      "plannedWorkout":     str,
      "recommendedWorkout": str,
      "selectedAction":  "proceed" | "modify" | "rest",
      "confidence":      "low" | "moderate" | "high",
      "recoveryScore":   float | absent,
      "availableMinutes":int   | absent,
      "userResponse":   "accepted" | "rejected" | "modified" | "skipped" | null,
      "rejectionReason": str | absent,
      "actualWorkout": {
        "completed":         bool,
        "distanceMiles":     float | absent,
        "durationMinutes":   int   | absent,
        "perceivedEffort":   int   | absent
      } | absent,
      "context": {
        "calendarLoad":   "light"|"moderate"|"heavy" | absent,
        "sleepStatus":    "below_baseline"|"normal"|"above_baseline" | absent,
        "recoveryStatus": "low"|"moderate"|"high" | absent
      }
    }

The module is robust to partial / messy input. Missing or malformed
events are silently skipped rather than rejected.

Hard rules (enforced by both the system prompt and the fallback):

* Fewer than 5 events ⇒ every emitted pattern is ``"low"`` confidence
  and a ``"Limited history"`` warning is included.
* No medical claims. No injury / diagnosis language.
* No overfitting to a single event — the fallback requires at least
  two supporting observations before emitting a pattern, and the
  system prompt instructs the LLM to do the same.
* If the LLM is unavailable or its output fails validation we return
  a deterministic fallback built from the same aggregates. The caller
  never has to handle errors.

Public API
----------
``generate_behavior_insights(recommendation_events) -> dict``
    Returns a dict matching the documented output schema. Always
    succeeds. May block for tens to hundreds of seconds on local
    inference; callers should treat it as a long-running operation
    and cache aggressively.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from copy import deepcopy
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from .json_utils import safe_json_parse
from .llm_client import LLMUnavailable, call_llm

_log = logging.getLogger(__name__)


# --- Constants -------------------------------------------------------------

# The runtime cutoff that triggers the "limited history" warning and
# forces every emitted pattern to ``low`` confidence.
LOW_DATA_THRESHOLD = 5

# Confidence levels and preference types allowed in the output schema.
# Used to validate LLM output and to constrain the fallback.
_ALLOWED_CONFIDENCE = {"low", "moderate", "high"}
_ALLOWED_PREF_TYPE = {
    "busy_day_preference",
    "rest_day_preference",
    "intensity_tolerance",
    "schedule_preference",
}
CONTRACT_VERSION = "behavior-pattern-result.v1"
_ALLOWED_PATTERN_FAMILY = {
    "heavy_calendar_misses",
    "specific_day_skips",
    "long_run_day_preference",
    "rest_override",
    "adjustment_tolerance",
    "stale_data_or_checkin_gap",
    "pain_or_discomfort_recurrence",
}
_NO_PREFERENCE = "none"
_ALLOWED_RESULT_KIND = {
    "scoring_preference_review",
    "preferred_day_review",
    "checkin_prompt",
    "caution",
}


class _StrictContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BehaviorAnalysisOut(_StrictContractModel):
    source: Literal["deterministic", "ollama"]
    fallback_used: bool
    failure: Literal[
        "none",
        "timeout",
        "ai_unavailable",
        "malformed_ai",
        "invalid_ai",
        "unsupported_ai",
        "unknown",
    ]


class ScoringPreferenceResultOut(_StrictContractModel):
    kind: Literal["scoring_preference_review"]
    review_required: Literal[True]
    confirmation_required: Literal[True]
    mutation: Literal["confirmed_preference"]
    action_label: str = Field(min_length=1, max_length=500)
    will_change_if_confirmed: str = Field(min_length=1, max_length=500)
    will_never_change: str = Field(min_length=1, max_length=500)
    preference_type: Literal[
        "busy_day_preference",
        "rest_day_preference",
        "intensity_tolerance",
    ]
    adjustment_direction: Literal[
        "shorter_or_easier",
        "recovery_alternative",
        "reduce_intensity",
        "increase_intensity",
    ]


class PreferredDayResultOut(_StrictContractModel):
    kind: Literal["preferred_day_review"]
    review_required: Literal[True]
    confirmation_required: Literal[True]
    mutation: Literal["preferred_training_days"]
    action_label: str = Field(min_length=1, max_length=500)
    will_change_if_confirmed: str = Field(min_length=1, max_length=500)
    will_never_change: str = Field(min_length=1, max_length=500)
    strategy: Literal["avoid_day", "prefer_long_run_day"]
    observed_day: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class CheckinPromptResultOut(_StrictContractModel):
    kind: Literal["checkin_prompt"]
    review_required: Literal[False]
    confirmation_required: Literal[False]
    mutation: Literal["none"]
    action_label: str = Field(min_length=1, max_length=500)
    will_change_if_confirmed: str = Field(min_length=1, max_length=500)
    will_never_change: str = Field(min_length=1, max_length=500)
    prompt_kind: Literal["sync_readiness", "complete_checkin"]


class CautionResultOut(_StrictContractModel):
    kind: Literal["caution"]
    review_required: Literal[False]
    confirmation_required: Literal[False]
    mutation: Literal["none"]
    action_label: str = Field(min_length=1, max_length=500)
    will_change_if_confirmed: str = Field(min_length=1, max_length=500)
    will_never_change: str = Field(min_length=1, max_length=500)
    caution_actions: tuple[
        Literal["stop_or_reduce"],
        Literal["capture_discomfort_flag"],
        Literal["seek_qualified_care"],
    ]


BehaviorPatternResultOut = Annotated[
    Union[
        ScoringPreferenceResultOut,
        PreferredDayResultOut,
        CheckinPromptResultOut,
        CautionResultOut,
    ],
    Field(discriminator="kind"),
]


class BehaviorPatternOut(_StrictContractModel):
    id: str = Field(pattern=r"^pattern_[a-z0-9_]+$", max_length=160)
    family: Literal[
        "heavy_calendar_misses",
        "specific_day_skips",
        "long_run_day_preference",
        "rest_override",
        "adjustment_tolerance",
        "stale_data_or_checkin_gap",
        "pain_or_discomfort_recurrence",
    ]
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=500)
    confidence: Literal["low", "moderate", "high"]
    suggested_adjustment: str = Field(min_length=1, max_length=500)
    preference_type: Literal[
        "busy_day_preference",
        "rest_day_preference",
        "intensity_tolerance",
        "schedule_preference",
        "none",
    ]
    support_count: int = Field(ge=2, le=1000)
    why_it_matters: str = Field(min_length=1, max_length=500)
    result: BehaviorPatternResultOut


class BehaviorPatternEnvelope(_StrictContractModel):
    contract_version: Literal["behavior-pattern-result.v1"]
    analysis: BehaviorAnalysisOut
    patterns: List[BehaviorPatternOut] = Field(max_length=20)
    warnings: List[str] = Field(max_length=20)


# --- Prompt ----------------------------------------------------------------

SYSTEM_PROMPT = """You are the behavior insight layer for Kinetic, an adaptive running training system.

Your job is to identify conservative behavioral patterns from recommendation history.

You do not change the training plan.
You do not make medical claims.
You do not infer injuries or diagnoses.
You do not overfit to one event.

Use only the provided events.

If there are fewer than 5 events, all insights must be low confidence.

Pick `family` using only these definitions:
- `heavy_calendar_misses` — skips/rejections concentrated on heavy-calendar days.
- `specific_day_skips` — skips tied to a weekday rather than calendar load.
- `long_run_day_preference` — completed long runs concentrate on one weekday.
- `rest_override` — runner repeatedly trains after a rest recommendation.
- `adjustment_tolerance` — repeated too-hard or too-easy adjustment feedback.
- `stale_data_or_checkin_gap` — repeated stale-readiness or missing-check-in context.
- `pain_or_discomfort_recurrence` — repeated bounded pain/discomfort skip flags.

Pick `preference_type` using these definitions (do not invent new tags):
- `busy_day_preference` — pattern is driven by calendar load (e.g. skips/rejections concentrated on heavy-calendar days, or `rejection_reason: too_busy`). Use this whenever `calendar_load_response.heavy` shows a high miss-rate.
- `rest_day_preference` — pattern is about how the runner reacts to recommended rest (e.g. overriding rest days, or always accepting rest).
- `intensity_tolerance` — pattern is about effort level or workout difficulty (e.g. consistently rejecting hard sessions, low/high perceived effort, modifying intensity).
- `schedule_preference` — pattern is tied to a specific day of the week (e.g. Mondays always skipped) and NOT to calendar load. Only use this when the signal is the weekday itself, not how busy the day was.

If a pattern fits both `busy_day_preference` and `schedule_preference`, prefer `busy_day_preference`.
For stale-data/check-in and pain/discomfort families, set `preference_type` to `none`.

Return JSON only:
{
  "patterns": [
    {
      "family": "heavy_calendar_misses" | "specific_day_skips" | "long_run_day_preference" | "rest_override" | "adjustment_tolerance" | "stale_data_or_checkin_gap" | "pain_or_discomfort_recurrence",
      "title": string,
      "description": string,
      "confidence": "low" | "moderate" | "high",
      "suggested_adjustment": string,
      "preference_type": "busy_day_preference" | "rest_day_preference" | "intensity_tolerance" | "schedule_preference" | "none"
    }
  ],
  "warnings": string[]
}

The server, not you, owns the final copy and action for every surfaced result.
Your output can only select among deterministically supported families.
"""


# --- Public API ------------------------------------------------------------


def generate_behavior_insights(
    recommendation_events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Surface conservative behavioural patterns from recent history.

    The function never raises. On any failure path — bad input,
    LLM offline, malformed JSON, schema violation — it returns the
    deterministic fallback computed from the same input.
    """
    events = _sanitise_events(recommendation_events)
    aggregates = _compute_aggregates(events)

    # We always compute the fallback first so we have a safe default
    # to return on any LLM failure. It's cheap (pure aggregation over
    # a handful of dicts).
    deterministic = _fallback_insights(events, aggregates)

    # When there's nothing to summarise the LLM call is wasted effort.
    # Return the (very small) deterministic output directly.
    if not events:
        return deterministic

    user_prompt = _build_user_prompt(events, aggregates)

    try:
        raw = call_llm(user_prompt, system_prompt=SYSTEM_PROMPT)
    except LLMUnavailable as exc:
        _log.warning(
            "LLM unavailable, falling back to deterministic behavior insights: %s",
            exc,
        )
        failure = (
            "timeout"
            if "timeout" in str(exc).lower() or "timed out" in str(exc).lower()
            else "ai_unavailable"
        )
        return _with_analysis_failure(deterministic, failure)

    parsed = safe_json_parse(raw)
    if parsed is None:
        _log.warning(
            "LLM returned unparseable JSON for behavior insights; falling back. Raw head: %r",
            raw[:200],
        )
        return _with_analysis_failure(deterministic, "malformed_ai")

    validated = _validate_schema(parsed, low_data=len(events) < LOW_DATA_THRESHOLD)
    if validated is None:
        _log.warning(
            "LLM JSON did not match behavior-insights schema; falling back. Body: %r",
            parsed,
        )
        return _with_analysis_failure(deterministic, "invalid_ai")

    # The model may select only families the deterministic detector already
    # supported. It never authors the displayed action, copy, mutation target,
    # or safety boundary.
    selected_families = {item["family"] for item in validated["patterns"]}
    selected = [
        deepcopy(pattern)
        for pattern in deterministic["patterns"]
        if pattern["family"] in selected_families
    ]
    if not selected and deterministic["patterns"]:
        return _with_analysis_failure(deterministic, "unsupported_ai")
    return {
        **deepcopy(deterministic),
        "analysis": {
            "source": "ollama",
            "fallback_used": False,
            "failure": "none",
        },
        "patterns": selected,
    }


def deterministic_behavior_insights(
    recommendation_events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Run the deterministic insight path without touching the LLM.

    Used by callers (notably the ``/behavior-insights`` HTTP endpoint)
    that want to short-circuit on very sparse history without paying
    the LLM's wall-clock cost. Returns the same schema as
    :func:`generate_behavior_insights`.
    """
    events = _sanitise_events(recommendation_events)
    aggregates = _compute_aggregates(events)
    return _fallback_insights(events, aggregates)


# --- Input sanitisation ----------------------------------------------------


def _sanitise_events(value: Any) -> List[Dict[str, Any]]:
    """Drop entries that aren't dicts. Keep field semantics intact."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


# --- Aggregation -----------------------------------------------------------


def _compute_aggregates(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pre-compute the counts the prompt and fallback both rely on.

    Doing this once keeps both code paths reading from the same view of
    the data — if a pattern is justified by the LLM, it must be
    justified by the same numbers the fallback would have used.
    """
    total = len(events)
    response_counts: Counter[str] = Counter()
    action_counts: Counter[str] = Counter()
    rejection_reason_counts: Counter[str] = Counter()
    calendar_load_response: Dict[str, Counter[str]] = {
        "light": Counter(),
        "moderate": Counter(),
        "heavy": Counter(),
    }
    weekday_skip: Counter[str] = Counter()
    weekday_total: Counter[str] = Counter()
    long_run_completion: Counter[str] = Counter()
    rest_recommendations = 0
    rest_overrides = 0  # recommended rest, user did the workout
    perceived_effort: List[int] = []
    completion = {"completed": 0, "not_completed": 0}
    stale_readiness = 0
    missing_checkins = 0
    pain_or_discomfort = 0

    for evt in events:
        response = evt.get("userResponse")
        if isinstance(response, str):
            response_counts[response] += 1

        action = evt.get("selectedAction")
        if isinstance(action, str):
            action_counts[action] += 1

        rejection_reason = evt.get("rejectionReason")
        if isinstance(rejection_reason, str) and rejection_reason.strip():
            rejection_reason_counts[rejection_reason.strip()] += 1

        ctx = evt.get("context") if isinstance(evt.get("context"), dict) else {}
        cal_load = ctx.get("calendarLoad")
        if isinstance(cal_load, str) and cal_load in calendar_load_response:
            calendar_load_response[cal_load][response if isinstance(response, str) else "pending"] += 1

        weekday = _weekday_from_iso(evt.get("date"))
        if weekday:
            weekday_total[weekday] += 1
            actual_for_day = (
                evt.get("actualWorkout")
                if isinstance(evt.get("actualWorkout"), dict)
                else {}
            )
            skip_reason = actual_for_day.get("skipReason")
            schedule_miss = (
                response == "skipped"
                or actual_for_day.get("completed") is False
            ) and skip_reason not in {"pain_or_discomfort", "recovery"}
            if schedule_miss:
                weekday_skip[weekday] += 1
            workout_label = " ".join(
                str(evt.get(key, ""))
                for key in ("plannedWorkout", "recommendedWorkout")
            ).lower()
            if actual_for_day.get("completed") is True and "long" in workout_label:
                long_run_completion[weekday] += 1

        if action == "rest":
            rest_recommendations += 1
            actual = evt.get("actualWorkout")
            if isinstance(actual, dict) and actual.get("completed") is True:
                rest_overrides += 1

        actual = evt.get("actualWorkout")
        if isinstance(actual, dict):
            effort = actual.get("perceivedEffort")
            if isinstance(effort, (int, float)) and 1 <= effort <= 10:
                perceived_effort.append(int(effort))
            completed = actual.get("completed")
            if completed is True:
                completion["completed"] += 1
            elif completed is False:
                completion["not_completed"] += 1
            if actual.get("skipReason") == "pain_or_discomfort":
                pain_or_discomfort += 1

        if ctx.get("readinessFreshness") == "stale":
            stale_readiness += 1
        if ctx.get("checkinStatus") == "missing":
            missing_checkins += 1

    return {
        "total_events": total,
        "response_counts": dict(response_counts),
        "action_counts": dict(action_counts),
        "rejection_reason_counts": dict(rejection_reason_counts),
        "calendar_load_response": {
            k: dict(v) for k, v in calendar_load_response.items() if v
        },
        "weekday_total": dict(weekday_total),
        "weekday_skip": dict(weekday_skip),
        "long_run_completion": dict(long_run_completion),
        "rest_recommendations": rest_recommendations,
        "rest_overrides": rest_overrides,
        "stale_readiness": stale_readiness,
        "missing_checkins": missing_checkins,
        "pain_or_discomfort": pain_or_discomfort,
        "perceived_effort_samples": perceived_effort,
        "perceived_effort_avg": (
            round(sum(perceived_effort) / len(perceived_effort), 2)
            if perceived_effort
            else None
        ),
        "completion": completion,
    }


# --- Prompt building -------------------------------------------------------


def _build_user_prompt(
    events: List[Dict[str, Any]],
    aggregates: Dict[str, Any],
) -> str:
    """Render aggregates + a trimmed event view as a single prompt.

    We hand the model both the pre-computed counts (so it doesn't have
    to do arithmetic) and a compact projection of each event (so it
    can explain patterns without receiving raw athlete notes).
    """
    # Keep only the fields the model needs. Pruning here keeps prompt
    # eval fast on CPU inference.
    event_view: List[Dict[str, Any]] = []
    for evt in events:
        projection = {
            "date": evt.get("date"),
            "plannedWorkout": evt.get("plannedWorkout"),
            "recommendedWorkout": evt.get("recommendedWorkout"),
            "selectedAction": evt.get("selectedAction"),
            "confidence": evt.get("confidence"),
            "userResponse": evt.get("userResponse"),
            "rejectionReason": evt.get("rejectionReason"),
            "context": evt.get("context") if isinstance(evt.get("context"), dict) else {},
        }
        actual = evt.get("actualWorkout")
        if isinstance(actual, dict):
            projection["actualWorkout"] = {
                k: actual.get(k)
                for k in ("completed", "perceivedEffort", "skipReason")
                if actual.get(k) is not None
            }
        event_view.append(projection)

    body = {
        "event_count": aggregates["total_events"],
        "low_data": aggregates["total_events"] < LOW_DATA_THRESHOLD,
        "aggregates": aggregates,
        "events": event_view,
    }
    payload = json.dumps(body, indent=2, default=str)
    return (
        "Analyse the following Kinetic recommendation history.\n"
        "Surface only patterns that are supported by at least two events.\n"
        "If `low_data` is true, every pattern must use confidence \"low\" "
        "and the warnings list must include a note about limited history.\n"
        "Return JSON only — no preamble, no commentary, no <think> blocks, "
        "no markdown fences.\n\n"
        "History:\n"
        f"{payload}"
    )


# --- Schema validation -----------------------------------------------------


def _validate_schema(
    obj: Dict[str, Any],
    *,
    low_data: bool,
) -> Optional[Dict[str, Any]]:
    """Coerce ``obj`` to the published schema or return ``None``.

    Strict about field types; tolerant of extra keys. When ``low_data``
    is true we downgrade any non-``low`` pattern confidence rather than
    reject the whole response — that's the contract documented in the
    module docstring.
    """
    patterns_raw = obj.get("patterns")
    warnings_raw = obj.get("warnings")

    if not isinstance(patterns_raw, list):
        return None
    if not isinstance(warnings_raw, list):
        return None

    patterns: List[Dict[str, Any]] = []
    for entry in patterns_raw:
        if not isinstance(entry, dict):
            return None
        title = entry.get("title")
        description = entry.get("description")
        suggested = entry.get("suggested_adjustment")
        confidence = entry.get("confidence")
        pref_type = entry.get("preference_type")
        family = entry.get("family")
        if not isinstance(title, str) or not title.strip():
            return None
        if not isinstance(description, str) or not description.strip():
            return None
        if not isinstance(suggested, str) or not suggested.strip():
            return None
        if not isinstance(confidence, str) or confidence not in _ALLOWED_CONFIDENCE:
            return None
        if not isinstance(family, str) or family not in _ALLOWED_PATTERN_FAMILY:
            return None
        if (
            not isinstance(pref_type, str)
            or pref_type not in _ALLOWED_PREF_TYPE | {_NO_PREFERENCE}
        ):
            return None
        # Enforce the low-data rule defensively. The system prompt
        # tells the model to do this; we belt-and-brace it here so a
        # misbehaving model can't claim "high" confidence from 2 events.
        if low_data and confidence != "low":
            confidence = "low"
        patterns.append(
            {
                "title": title.strip(),
                "description": description.strip(),
                "confidence": confidence,
                "suggested_adjustment": suggested.strip(),
                "preference_type": pref_type,
                "family": family,
            }
        )

    warnings: List[str] = []
    for item in warnings_raw:
        if isinstance(item, str) and item.strip():
            warnings.append(item.strip())

    return {"patterns": patterns, "warnings": warnings}


# --- Deterministic fallback -----------------------------------------------


def _fallback_insights(
    events: List[Dict[str, Any]],
    aggregates: Dict[str, Any],
) -> Dict[str, Any]:
    """Compute conservative insights without calling a model.

    The fallback never emits a pattern unless there are at least two
    supporting observations — the same "no overfitting" rule the LLM
    is asked to follow. When history is below the low-data threshold
    every emitted pattern is forced to ``low`` confidence and a
    warning is added.
    """
    n = aggregates["total_events"]
    warnings: List[str] = []
    if n == 0:
        warnings.append("No recommendation history yet.")
        return _response([], warnings)

    low_data = n < LOW_DATA_THRESHOLD
    if low_data:
        warnings.append(_low_data_warning(n))

    patterns: List[Dict[str, Any]] = []

    # --- Intensity tolerance from rejection reasons ----------------------
    reasons = aggregates["rejection_reason_counts"]
    too_hard = reasons.get("too_hard", 0)
    too_easy = reasons.get("too_easy", 0)
    if too_hard >= 2 and too_hard >= too_easy:
        patterns.append(
            _make_pattern(
                family="adjustment_tolerance",
                title="Adjustments often feel too hard",
                description=(
                    f"In {too_hard} of {n} recommendations you rejected the "
                    "suggested adjustment because it felt too hard."
                ),
                suggested_adjustment=(
                    "Consider keeping the original plan when recovery is uncertain, "
                    "or scaling intensity gradually."
                ),
                preference_type="intensity_tolerance",
                support_count=too_hard,
                detail="too_hard",
                strong=too_hard >= 4,
                low_data=low_data,
            )
        )
    elif too_easy >= 2 and too_easy > too_hard:
        patterns.append(
            _make_pattern(
                family="adjustment_tolerance",
                title="Adjustments often feel too easy",
                description=(
                    f"In {too_easy} of {n} recommendations you rejected the "
                    "suggested adjustment because it felt too easy."
                ),
                suggested_adjustment=(
                    "The runner may tolerate slightly more intensity on adjustment days."
                ),
                preference_type="intensity_tolerance",
                support_count=too_easy,
                detail="too_easy",
                strong=too_easy >= 4,
                low_data=low_data,
            )
        )

    # --- Rest-day preference --------------------------------------------
    rest_recs = aggregates["rest_recommendations"]
    rest_overrides = aggregates["rest_overrides"]
    if (
        rest_recs >= 2
        and rest_overrides >= 2
        and rest_overrides / rest_recs >= 0.5
    ):
        patterns.append(
            _make_pattern(
                family="rest_override",
                title="Frequently overrides recommended rest",
                description=(
                    f"Kinetic recommended rest {rest_recs} times; the runner trained "
                    f"anyway on {rest_overrides} of those days."
                ),
                suggested_adjustment=(
                    "When suggesting rest, offer a low-intensity alternative instead so "
                    "the runner has a smaller-step option."
                ),
                preference_type="rest_day_preference",
                support_count=rest_overrides,
                strong=rest_overrides >= 4,
                low_data=low_data,
            )
        )

    # --- Busy-day pattern ------------------------------------------------
    heavy = aggregates["calendar_load_response"].get("heavy", {})
    heavy_total = sum(heavy.values())
    heavy_skipped = heavy.get("skipped", 0) + heavy.get("rejected", 0)
    busy_day_pattern = (
        heavy_total >= 2
        and heavy_skipped >= 2
        and heavy_skipped / heavy_total >= 0.5
    )
    if busy_day_pattern:
        patterns.append(
            _make_pattern(
                family="heavy_calendar_misses",
                title="Workouts drop on heavy-calendar days",
                description=(
                    f"On {heavy_total} heavy-calendar days, the runner skipped or "
                    f"rejected the recommendation {heavy_skipped} times."
                ),
                suggested_adjustment=(
                    "Default to shorter or easier sessions on heavy-calendar days."
                ),
                preference_type="busy_day_preference",
                support_count=heavy_skipped,
                strong=heavy_skipped >= 4,
                low_data=low_data,
            )
        )

    # --- Schedule preference (dominant skip weekday) --------------------
    weekday_total = aggregates["weekday_total"]
    weekday_skip = aggregates["weekday_skip"]
    dominant = _dominant_skip_weekday(weekday_total, weekday_skip)
    if dominant is not None and not busy_day_pattern:
        day, total_day, skipped_day = dominant
        patterns.append(
            _make_pattern(
                family="specific_day_skips",
                title=f"{day}s are commonly skipped",
                description=(
                    f"{skipped_day} of {total_day} recommended workouts on "
                    f"{day}s were skipped or marked incomplete."
                ),
                suggested_adjustment=(
                    f"Consider moving {day}'s session to a different day, or "
                    "scheduling a lighter option there by default."
                ),
                preference_type="schedule_preference",
                support_count=skipped_day,
                subject=_day_key(day),
                strong=skipped_day >= 4,
                low_data=low_data,
            )
        )

    # --- Long-run day preference -----------------------------------------
    long_run_day = _dominant_count(aggregates["long_run_completion"])
    if long_run_day is not None:
        day, count = long_run_day
        patterns.append(
            _make_pattern(
                family="long_run_day_preference",
                title=f"Long runs land well on {day}",
                description=(
                    f"The runner completed {count} long runs on {day}. "
                    "That day may be a better fit for future long runs."
                ),
                suggested_adjustment=(
                    f"Review preferred training days and include {day} when spacing allows."
                ),
                preference_type="schedule_preference",
                support_count=count,
                subject=_day_key(day),
                strong=count >= 4,
                low_data=low_data,
            )
        )

    # --- Stale readiness / missed check-in -------------------------------
    stale = aggregates["stale_readiness"]
    gaps = aggregates["missing_checkins"]
    if max(stale, gaps) >= 2:
        detail = "sync_readiness" if stale >= gaps else "complete_checkin"
        count = max(stale, gaps)
        patterns.append(
            _make_pattern(
                family="stale_data_or_checkin_gap",
                title=(
                    "Readiness is often stale"
                    if detail == "sync_readiness"
                    else "Post-workout check-ins are often missing"
                ),
                description=(
                    f"{count} recent decisions used stale readiness context."
                    if detail == "sync_readiness"
                    else f"{count} recent workouts were missing a bounded check-in."
                ),
                suggested_adjustment=(
                    "Prompt a readiness sync before the next decision."
                    if detail == "sync_readiness"
                    else "Prompt the bounded post-workout check-in flow."
                ),
                preference_type=_NO_PREFERENCE,
                support_count=count,
                detail=detail,
                strong=count >= 4,
                low_data=low_data,
            )
        )

    # --- Pain/discomfort recurrence --------------------------------------
    pain_count = aggregates["pain_or_discomfort"]
    if pain_count >= 2:
        patterns.append(
            _make_pattern(
                family="pain_or_discomfort_recurrence",
                title="Repeated discomfort flags",
                description=(
                    f"The runner used the bounded discomfort flag {pain_count} times."
                ),
                suggested_adjustment=(
                    "Open fixed caution guidance; keep personalization and training "
                    "state unchanged."
                ),
                preference_type=_NO_PREFERENCE,
                support_count=pain_count,
                strong=pain_count >= 4,
                low_data=low_data,
            )
        )

    return _response(patterns, warnings)


def _make_pattern(
    *,
    family: str,
    title: str,
    description: str,
    suggested_adjustment: str,
    preference_type: str,
    support_count: int,
    subject: str | None = None,
    detail: str | None = None,
    strong: bool,
    low_data: bool,
) -> Dict[str, Any]:
    """Assemble a pattern dict with confidence chosen per the rules.

    ``strong`` is the heuristic signal-strength flag from the caller;
    ``low_data`` forces ``low`` regardless when history is sparse.
    """
    if low_data:
        confidence = "low"
    else:
        confidence = "high" if strong else "moderate"
    pattern = {
        "id": _pattern_id(family, subject, detail),
        "family": family,
        "title": title,
        "description": description,
        "confidence": confidence,
        "suggested_adjustment": suggested_adjustment,
        "preference_type": preference_type,
        "support_count": support_count,
        "why_it_matters": _why_it_matters(family),
        "result": _build_result(family, preference_type, subject, detail),
    }
    _validate_contract_pattern(pattern)
    return pattern


def _response(
    patterns: List[Dict[str, Any]],
    warnings: List[str],
) -> Dict[str, Any]:
    return {
        "contract_version": CONTRACT_VERSION,
        "analysis": {
            "source": "deterministic",
            "fallback_used": False,
            "failure": "none",
        },
        "patterns": patterns,
        "warnings": warnings,
    }


def _with_analysis_failure(
    response: Dict[str, Any],
    failure: str,
) -> Dict[str, Any]:
    safe = deepcopy(response)
    safe["analysis"] = {
        "source": "deterministic",
        "fallback_used": True,
        "failure": failure,
    }
    return safe


def _pattern_id(
    family: str,
    subject: str | None,
    detail: str | None,
) -> str:
    suffix = subject or detail
    return f"pattern_{family}" + (f"_{suffix}" if suffix else "")


def _why_it_matters(family: str) -> str:
    return {
        "heavy_calendar_misses": (
            "A smaller option may make training more feasible on constrained days."
        ),
        "specific_day_skips": (
            "A reviewed schedule input can make future deterministic plans easier to follow."
        ),
        "long_run_day_preference": (
            "A reviewed long-run day can improve fit without changing load or spacing rules."
        ),
        "rest_override": (
            "A recovery alternative may be more usable than full rest when safety allows."
        ),
        "adjustment_tolerance": (
            "A small confirmed nudge can better match adjustment difficulty."
        ),
        "stale_data_or_checkin_gap": (
            "Fresh bounded inputs make Today explanations more complete."
        ),
        "pain_or_discomfort_recurrence": (
            "Repeated discomfort belongs in a conservative safety flow, not personalization."
        ),
    }[family]


def _build_result(
    family: str,
    preference_type: str,
    subject: str | None,
    detail: str | None,
) -> Dict[str, Any]:
    common = {
        "review_required": family
        not in {"stale_data_or_checkin_gap", "pain_or_discomfort_recurrence"},
        "confirmation_required": family
        not in {"stale_data_or_checkin_gap", "pain_or_discomfort_recurrence"},
    }
    if family == "heavy_calendar_misses":
        return {
            **common,
            "kind": "scoring_preference_review",
            "mutation": "confirmed_preference",
            "action_label": "Review busy-day preference",
            "will_change_if_confirmed": (
                "Shorter or easier candidates may receive a small bounded score nudge "
                "on heavy-calendar days."
            ),
            "will_never_change": (
                "Safety state, available candidates, mileage, and the saved plan."
            ),
            "preference_type": preference_type,
            "adjustment_direction": "shorter_or_easier",
        }
    if family == "rest_override":
        return {
            **common,
            "kind": "scoring_preference_review",
            "mutation": "confirmed_preference",
            "action_label": "Review recovery-alternative preference",
            "will_change_if_confirmed": (
                "A recovery-run style modify option may receive a small bounded nudge."
            ),
            "will_never_change": (
                "At-risk safety decisions, mileage, and the saved plan."
            ),
            "preference_type": preference_type,
            "adjustment_direction": "recovery_alternative",
        }
    if family == "adjustment_tolerance":
        direction = "reduce_intensity" if detail == "too_hard" else "increase_intensity"
        return {
            **common,
            "kind": "scoring_preference_review",
            "mutation": "confirmed_preference",
            "action_label": "Review adjustment preference",
            "will_change_if_confirmed": (
                "Adjustment candidates may receive a small bounded score nudge."
            ),
            "will_never_change": (
                "At-risk safety decisions, workout validity, mileage, and the saved plan."
            ),
            "preference_type": preference_type,
            "adjustment_direction": direction,
        }
    if family in {"specific_day_skips", "long_run_day_preference"}:
        strategy = (
            "avoid_day"
            if family == "specific_day_skips"
            else "prefer_long_run_day"
        )
        return {
            **common,
            "kind": "preferred_day_review",
            "mutation": "preferred_training_days",
            "action_label": "Review preferred training days",
            "will_change_if_confirmed": (
                "Preferred-day inputs and the deterministically regenerated saved plan."
            ),
            "will_never_change": (
                "Weekly load, workout validity, phase structure, taper, or safety spacing."
            ),
            "strategy": strategy,
            "observed_day": subject,
        }
    if family == "stale_data_or_checkin_gap":
        prompt_kind = detail or "sync_readiness"
        return {
            **common,
            "kind": "checkin_prompt",
            "mutation": "none",
            "action_label": (
                "Sync readiness"
                if prompt_kind == "sync_readiness"
                else "Open bounded check-in"
            ),
            "will_change_if_confirmed": "No training state changes from this prompt.",
            "will_never_change": (
                "The saved plan, readiness values, completion state, or preferences."
            ),
            "prompt_kind": prompt_kind,
        }
    if family == "pain_or_discomfort_recurrence":
        return {
            **common,
            "kind": "caution",
            "mutation": "none",
            "action_label": "Review caution guidance",
            "will_change_if_confirmed": "No training state changes from this guidance.",
            "will_never_change": (
                "No sensitive health record or automatic training mutation is created."
            ),
            "caution_actions": [
                "stop_or_reduce",
                "capture_discomfort_flag",
                "seek_qualified_care",
            ],
        }
    raise ValueError(f"unsupported behavior pattern family: {family}")


def _validate_contract_pattern(pattern: Dict[str, Any]) -> None:
    family = pattern.get("family")
    if family not in _ALLOWED_PATTERN_FAMILY:
        raise ValueError("unsupported pattern family")
    if not isinstance(pattern.get("id"), str) or not pattern["id"]:
        raise ValueError("pattern id is required")
    support_count = pattern.get("support_count")
    if not isinstance(support_count, int) or support_count < 2:
        raise ValueError("pattern support must be at least two")
    result = pattern.get("result")
    if not isinstance(result, dict) or result.get("kind") not in _ALLOWED_RESULT_KIND:
        raise ValueError("pattern result kind is invalid")
    if result.get("mutation") not in {
        "none",
        "confirmed_preference",
        "preferred_training_days",
    }:
        raise ValueError("pattern mutation target is invalid")
    if result["kind"] in {"checkin_prompt", "caution"}:
        if result.get("mutation") != "none":
            raise ValueError("prompt and caution results cannot mutate")
        if result.get("confirmation_required") is not False:
            raise ValueError("prompt and caution results cannot require confirmation")
    if result["kind"] == "preferred_day_review":
        if result.get("observed_day") not in {
            "mon",
            "tue",
            "wed",
            "thu",
            "fri",
            "sat",
            "sun",
        }:
            raise ValueError("preferred-day result needs a bounded observed day")


def _low_data_warning(n: int) -> str:
    return (
        f"Limited history ({n} of at least {LOW_DATA_THRESHOLD} events needed); "
        "insights are preliminary."
    )


def _day_key(day: str) -> str:
    return day[:3].lower()


def _dominant_count(counts: Dict[str, int]) -> Optional[tuple[str, int]]:
    supported = [(day, count) for day, count in counts.items() if count >= 2]
    if not supported:
        return None
    return max(supported, key=lambda item: (item[1], -_WEEKDAY_NAMES.index(item[0])))


# --- Tiny helpers ----------------------------------------------------------


_WEEKDAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def _weekday_from_iso(value: Any) -> Optional[str]:
    """Return the weekday name for an ISO ``YYYY-MM-DD`` date, or ``None``."""
    if not isinstance(value, str):
        return None
    parts = value.split("-")
    if len(parts) != 3:
        return None
    try:
        year, month, day = (int(p) for p in parts)
    except ValueError:
        return None
    # Use Python's calendar module via datetime for the weekday computation.
    # Imported lazily to keep the module import-time light.
    import datetime as _dt

    try:
        idx = _dt.date(year, month, day).weekday()
    except ValueError:
        return None
    return _WEEKDAY_NAMES[idx]


def _dominant_skip_weekday(
    weekday_total: Dict[str, int],
    weekday_skip: Dict[str, int],
) -> Optional[tuple[str, int, int]]:
    """Identify a weekday that's disproportionately skipped.

    Returns ``(day, total, skipped)`` when a single weekday has at
    least two recommendations and a skip rate ≥50%; otherwise ``None``.
    Ties resolve to the highest absolute skip count.
    """
    best: Optional[tuple[str, int, int]] = None
    for day, total in weekday_total.items():
        if total < 2:
            continue
        skipped = weekday_skip.get(day, 0)
        if skipped < 2:
            continue
        if skipped / total < 0.5:
            continue
        if best is None or skipped > best[2]:
            best = (day, total, skipped)
    return best
