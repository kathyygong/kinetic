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
        "perceivedEffort":   int   | absent,
        "note":              str   | absent
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
from typing import Any, Dict, List, Optional

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


# --- Prompt ----------------------------------------------------------------

SYSTEM_PROMPT = """You are the behavior insight layer for Kinetic, an adaptive running training system.

Your job is to identify conservative behavioral patterns from recommendation history.

You do not change the training plan.
You do not make medical claims.
You do not infer injuries or diagnoses.
You do not overfit to one event.

Use only the provided events.

If there are fewer than 5 events, all insights must be low confidence.

Pick `preference_type` using these definitions (do not invent new tags):
- `busy_day_preference` — pattern is driven by calendar load (e.g. skips/rejections concentrated on heavy-calendar days, or `rejection_reason: too_busy`). Use this whenever `calendar_load_response.heavy` shows a high miss-rate.
- `rest_day_preference` — pattern is about how the runner reacts to recommended rest (e.g. overriding rest days, or always accepting rest).
- `intensity_tolerance` — pattern is about effort level or workout difficulty (e.g. consistently rejecting hard sessions, low/high perceived effort, modifying intensity).
- `schedule_preference` — pattern is tied to a specific day of the week (e.g. Mondays always skipped) and NOT to calendar load. Only use this when the signal is the weekday itself, not how busy the day was.

If a pattern fits both `busy_day_preference` and `schedule_preference`, prefer `busy_day_preference`.

Return JSON only:
{
  "patterns": [
    {
      "title": string,
      "description": string,
      "confidence": "low" | "moderate" | "high",
      "suggested_adjustment": string,
      "preference_type": "busy_day_preference" | "rest_day_preference" | "intensity_tolerance" | "schedule_preference"
    }
  ],
  "warnings": string[]
}
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
        return deterministic

    parsed = safe_json_parse(raw)
    if parsed is None:
        _log.warning(
            "LLM returned unparseable JSON for behavior insights; falling back. Raw head: %r",
            raw[:200],
        )
        return deterministic

    validated = _validate_schema(parsed, low_data=len(events) < LOW_DATA_THRESHOLD)
    if validated is None:
        _log.warning(
            "LLM JSON did not match behavior-insights schema; falling back. Body: %r",
            parsed,
        )
        return deterministic

    # Always merge the fallback's "limited history" warning when
    # appropriate — the model may or may not have noticed.
    if len(events) < LOW_DATA_THRESHOLD:
        warning = _low_data_warning(len(events))
        if warning not in validated["warnings"]:
            validated["warnings"].insert(0, warning)

    return validated


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
    rest_recommendations = 0
    rest_overrides = 0  # recommended rest, user did the workout
    perceived_effort: List[int] = []
    completion = {"completed": 0, "not_completed": 0}

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
            if response == "skipped" or (
                isinstance(evt.get("actualWorkout"), dict)
                and evt["actualWorkout"].get("completed") is False
            ):
                weekday_skip[weekday] += 1

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
        "rest_recommendations": rest_recommendations,
        "rest_overrides": rest_overrides,
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
    can quote the runner's actual rejection reasons / notes when it
    phrases the description).
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
                for k in ("completed", "perceivedEffort", "note")
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

    patterns: List[Dict[str, str]] = []
    for entry in patterns_raw:
        if not isinstance(entry, dict):
            return None
        title = entry.get("title")
        description = entry.get("description")
        suggested = entry.get("suggested_adjustment")
        confidence = entry.get("confidence")
        pref_type = entry.get("preference_type")
        if not isinstance(title, str) or not title.strip():
            return None
        if not isinstance(description, str) or not description.strip():
            return None
        if not isinstance(suggested, str) or not suggested.strip():
            return None
        if not isinstance(confidence, str) or confidence not in _ALLOWED_CONFIDENCE:
            return None
        if not isinstance(pref_type, str) or pref_type not in _ALLOWED_PREF_TYPE:
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
        return {"patterns": [], "warnings": warnings}

    low_data = n < LOW_DATA_THRESHOLD
    if low_data:
        warnings.append(_low_data_warning(n))

    patterns: List[Dict[str, str]] = []

    # --- Intensity tolerance from rejection reasons ----------------------
    reasons = aggregates["rejection_reason_counts"]
    too_hard = reasons.get("too_hard", 0)
    too_easy = reasons.get("too_easy", 0)
    felt_better = reasons.get("felt_better", 0)
    if too_hard >= 2 and too_hard >= too_easy:
        patterns.append(
            _make_pattern(
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
                strong=too_hard >= 4,
                low_data=low_data,
            )
        )
    elif too_easy >= 2 and too_easy > too_hard:
        patterns.append(
            _make_pattern(
                title="Adjustments often feel too easy",
                description=(
                    f"In {too_easy} of {n} recommendations you rejected the "
                    "suggested adjustment because it felt too easy."
                ),
                suggested_adjustment=(
                    "The runner may tolerate slightly more intensity on adjustment days."
                ),
                preference_type="intensity_tolerance",
                strong=too_easy >= 4,
                low_data=low_data,
            )
        )
    if felt_better >= 2:
        patterns.append(
            _make_pattern(
                title="Reports feeling better than the data suggests",
                description=(
                    f"On {felt_better} of {n} recommendations the runner overrode "
                    "Kinetic because they felt better than the readiness signals indicated."
                ),
                suggested_adjustment=(
                    "Consider weighting recent perceived effort alongside biometric signals."
                ),
                preference_type="intensity_tolerance",
                strong=felt_better >= 4,
                low_data=low_data,
            )
        )

    # --- Rest-day preference --------------------------------------------
    rest_recs = aggregates["rest_recommendations"]
    rest_overrides = aggregates["rest_overrides"]
    if rest_recs >= 2 and rest_overrides >= 2 and rest_overrides / rest_recs >= 0.5:
        patterns.append(
            _make_pattern(
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
                strong=rest_overrides >= 4,
                low_data=low_data,
            )
        )

    # --- Busy-day pattern ------------------------------------------------
    heavy = aggregates["calendar_load_response"].get("heavy", {})
    heavy_total = sum(heavy.values())
    heavy_skipped = heavy.get("skipped", 0) + heavy.get("rejected", 0)
    if heavy_total >= 2 and heavy_skipped >= 2 and heavy_skipped / heavy_total >= 0.5:
        patterns.append(
            _make_pattern(
                title="Workouts drop on heavy-calendar days",
                description=(
                    f"On {heavy_total} heavy-calendar days, the runner skipped or "
                    f"rejected the recommendation {heavy_skipped} times."
                ),
                suggested_adjustment=(
                    "Default to shorter or easier sessions on heavy-calendar days."
                ),
                preference_type="busy_day_preference",
                strong=heavy_skipped >= 4,
                low_data=low_data,
            )
        )

    # --- Schedule preference (dominant skip weekday) --------------------
    weekday_total = aggregates["weekday_total"]
    weekday_skip = aggregates["weekday_skip"]
    dominant = _dominant_skip_weekday(weekday_total, weekday_skip)
    if dominant is not None:
        day, total_day, skipped_day = dominant
        patterns.append(
            _make_pattern(
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
                strong=skipped_day >= 4,
                low_data=low_data,
            )
        )

    return {"patterns": patterns, "warnings": warnings}


def _make_pattern(
    *,
    title: str,
    description: str,
    suggested_adjustment: str,
    preference_type: str,
    strong: bool,
    low_data: bool,
) -> Dict[str, str]:
    """Assemble a pattern dict with confidence chosen per the rules.

    ``strong`` is the heuristic signal-strength flag from the caller;
    ``low_data`` forces ``low`` regardless when history is sparse.
    """
    if low_data:
        confidence = "low"
    else:
        confidence = "high" if strong else "moderate"
    return {
        "title": title,
        "description": description,
        "confidence": confidence,
        "suggested_adjustment": suggested_adjustment,
        "preference_type": preference_type,
    }


def _low_data_warning(n: int) -> str:
    return (
        f"Limited history ({n} of at least {LOW_DATA_THRESHOLD} events needed); "
        "insights are preliminary."
    )


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
