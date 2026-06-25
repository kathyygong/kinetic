"""AI explanation layer for Kinetic weekly recalibrations.

This module sits **downstream** of the weekly plan adjuster. By the
time we are called, the deterministic recalibration step has already
decided which workouts to keep, modify, or drop. Our job is to turn
that structured diff into a short, coach-friendly explanation.

Hard rules (enforced by both the system prompt and the fallback):
  * The LLM cannot change the adjusted plan.
  * The LLM may only reference data present in the recalibration trace.
  * The LLM does not recommend additional changes.
  * The LLM does not make medical claims.
  * If anything goes wrong (demo mode, Ollama down, malformed JSON,
    schema mismatch) we fall back to a deterministic explanation
    built from the same trace. The caller never has to handle errors.

Public API
----------
``generate_weekly_recalibration_summary(recalibration_trace) -> dict``
    Returns a dict matching the output schema below. Always succeeds.
    May block for tens to hundreds of seconds while the LLM responds.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from .ai_safety import contains_medical_claim
from .json_utils import safe_json_parse
from .llm_client import LLMUnavailable, call_llm

_log = logging.getLogger(__name__)


# --- Prompt -----------------------------------------------------------------

SYSTEM_PROMPT = """You are the weekly reasoning layer for Kinetic.

The weekly training plan has already been recalibrated by a deterministic planning system.

Your job is to explain what changed and why.

Use only the provided recalibration trace.
Do not invent calendar events, workouts, biometric data, or goals.
Do not recommend additional changes.
Do not make medical claims.

Return JSON only:
{
  "summary": string,
  "changes": [
    {
      "title": string,
      "explanation": string
    }
  ],
  "preserved": string[],
  "tradeoff": string,
  "confidence_note": string
}"""


# --- Public API -------------------------------------------------------------


def generate_weekly_recalibration_summary(
    recalibration_trace: Dict[str, Any],
) -> Dict[str, Any]:
    """Explain a weekly recalibration in structured, coach-like prose.

    ``recalibration_trace`` is the dict produced by the weekly adjuster.
    The function tolerates partial / missing fields — the fallback path
    can build a reasonable explanation from whatever is present.

    The return value always matches the schema documented in the system
    prompt above. On any failure path the caller still gets a usable
    dict; the failure mode is logged but never raised.
    """
    if not isinstance(recalibration_trace, dict):
        _log.warning(
            "generate_weekly_recalibration_summary: non-dict input; using fallback"
        )
        return _fallback_summary({})

    user_prompt = _build_user_prompt(recalibration_trace)

    try:
        raw = call_llm(user_prompt, system_prompt=SYSTEM_PROMPT)
    except LLMUnavailable as exc:
        _log.warning(
            "LLM unavailable, falling back to deterministic recalibration summary: %s",
            exc,
        )
        return _fallback_summary(recalibration_trace)

    parsed = safe_json_parse(raw)
    if parsed is None:
        _log.warning(
            "LLM returned unparseable JSON for weekly recalibration; falling back. Raw head: %r",
            raw[:200],
        )
        return _fallback_summary(recalibration_trace)

    validated = _validate_schema(parsed)
    if validated is None:
        _log.warning(
            "LLM JSON did not match weekly recalibration schema; falling back. Body: %r",
            parsed,
        )
        return _fallback_summary(recalibration_trace)
    if contains_medical_claim(validated):
        _log.warning(
            "LLM weekly recalibration tripped medical-claim guard; falling back."
        )
        return _fallback_summary(recalibration_trace)

    return validated


# --- Prompt building -------------------------------------------------------


def _build_user_prompt(recalibration_trace: Dict[str, Any]) -> str:
    """Render the recalibration trace as a single user-prompt string.

    We pass only the fields the model strictly needs to phrase the five
    output sections. Anything not present in the spec input list is
    excluded — keeping the prompt small saves prompt-eval time on local
    CPU inference.
    """
    summary_view: Dict[str, Any] = {}
    for key in (
        "original_week_plan",
        "adjusted_week_plan",
        "calendar_changes",
        "recovery_trends",
        "preserved_workouts",
        "modified_workouts",
        "dropped_workouts",
        "confidence",
    ):
        if key in recalibration_trace:
            summary_view[key] = recalibration_trace[key]

    payload = json.dumps(summary_view, indent=2, default=str)
    return (
        "Explain the following Kinetic weekly recalibration to the runner.\n"
        "Stay grounded in the trace. Return JSON only — no preamble, "
        "no commentary, no <think> blocks, no markdown fences.\n\n"
        "Recalibration trace:\n"
        f"{payload}"
    )


# --- Schema validation -----------------------------------------------------


def _validate_schema(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return ``obj`` coerced to the published schema, or ``None`` on failure.

    Strict about types; tolerant of extra keys (silently dropped).
    """
    summary = obj.get("summary")
    tradeoff = obj.get("tradeoff")
    confidence_note = obj.get("confidence_note")
    changes_raw = obj.get("changes")
    preserved_raw = obj.get("preserved")

    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(tradeoff, str):
        return None
    if not isinstance(confidence_note, str):
        return None
    if not isinstance(changes_raw, list):
        return None
    if not isinstance(preserved_raw, list):
        return None

    changes: List[Dict[str, str]] = []
    for entry in changes_raw:
        if not isinstance(entry, dict):
            return None
        title = entry.get("title")
        explanation = entry.get("explanation")
        if not isinstance(title, str) or not title.strip():
            return None
        if not isinstance(explanation, str) or not explanation.strip():
            return None
        changes.append(
            {
                "title": title.strip(),
                "explanation": explanation.strip(),
            }
        )

    preserved: List[str] = []
    for item in preserved_raw:
        if isinstance(item, str) and item.strip():
            preserved.append(item.strip())
        elif isinstance(item, (int, float)):
            preserved.append(str(item))
        else:
            # Skip non-string entries silently rather than reject the
            # whole response — the model occasionally wraps preserved
            # items in {"name": "..."} dicts.
            if isinstance(item, dict):
                label = item.get("name") or item.get("title") or item.get("label")
                if isinstance(label, str) and label.strip():
                    preserved.append(label.strip())

    return {
        "summary": summary.strip(),
        "changes": changes,
        "preserved": preserved,
        "tradeoff": tradeoff.strip(),
        "confidence_note": confidence_note.strip(),
    }


# --- Deterministic fallback ------------------------------------------------


def _fallback_summary(recalibration_trace: Dict[str, Any]) -> Dict[str, Any]:
    """Build a coach-style explanation directly from the trace.

    No model calls, no creativity — just rephrase the structured fields
    so the UI still shows something useful when the LLM is offline or
    misbehaves. Every value here is read from the trace; nothing is
    invented.
    """
    preserved_workouts = _as_workout_list(
        recalibration_trace.get("preserved_workouts")
    )
    modified_workouts = _as_workout_list(
        recalibration_trace.get("modified_workouts")
    )
    dropped_workouts = _as_workout_list(
        recalibration_trace.get("dropped_workouts")
    )
    calendar_changes = _as_str_list(recalibration_trace.get("calendar_changes"))
    recovery_trends = _as_str_list(recalibration_trace.get("recovery_trends"))
    confidence = _coerce_float(recalibration_trace.get("confidence"))

    # --- summary
    counts = (
        f"{len(preserved_workouts)} preserved, "
        f"{len(modified_workouts)} modified, "
        f"{len(dropped_workouts)} dropped"
    )
    if modified_workouts or dropped_workouts:
        summary = (
            f"This week's plan was recalibrated: {counts}. "
            "The adjustments reflect the recent calendar and recovery signals in the trace."
        )
    else:
        summary = (
            f"This week's plan stayed largely intact: {counts}. "
            "No material adjustments were needed."
        )

    # --- changes
    changes: List[Dict[str, str]] = []
    for entry in modified_workouts[:3]:
        label = _workout_label(entry) or "Workout"
        reason = _workout_reason(entry)
        explanation = (
            f"{label} was adjusted. {reason}"
            if reason
            else f"{label} was adjusted to fit this week's recalibrated load."
        )
        changes.append(
            {
                "title": f"Modified: {label}"[:80],
                "explanation": explanation,
            }
        )

    for entry in dropped_workouts[:2]:
        label = _workout_label(entry) or "Workout"
        reason = _workout_reason(entry)
        explanation = (
            f"{label} was removed from the week. {reason}"
            if reason
            else f"{label} was removed from the week."
        )
        changes.append(
            {
                "title": f"Dropped: {label}"[:80],
                "explanation": explanation,
            }
        )

    if not changes:
        if calendar_changes or recovery_trends:
            detail = calendar_changes[0] if calendar_changes else recovery_trends[0]
            changes.append(
                {
                    "title": "No workout edits",
                    "explanation": (
                        f"The recalibration kept every session as planned. Context: {detail}"
                    ),
                }
            )
        else:
            changes.append(
                {
                    "title": "No changes this week",
                    "explanation": "The recalibration left the original weekly plan unchanged.",
                }
            )

    # --- preserved
    preserved_labels: List[str] = []
    for entry in preserved_workouts:
        label = _workout_label(entry)
        if label:
            preserved_labels.append(label)

    # --- tradeoff
    if modified_workouts or dropped_workouts:
        tradeoff_bits = [
            "The adjusted plan trades some of the original training stimulus for better alignment with this week's"
        ]
        context_bits = []
        if calendar_changes:
            context_bits.append("schedule")
        if recovery_trends:
            context_bits.append("recovery trend")
        if not context_bits:
            context_bits.append("signals")
        tradeoff_bits.append(" and ".join(context_bits) + ".")
        tradeoff = " ".join(tradeoff_bits)
    else:
        tradeoff = (
            "The original plan was already a good fit for this week's calendar and "
            "recovery signals, so no tradeoff was required."
        )

    # --- confidence note
    if confidence is None:
        confidence_note = "Confidence not reported for this recalibration."
    else:
        pct = round(confidence * 100)
        if confidence >= 0.7:
            confidence_note = (
                f"Confidence is {pct}/100 — the recalibration is well supported by the inputs."
            )
        elif confidence >= 0.45:
            confidence_note = (
                f"Confidence is {pct}/100 — a reasonable adjustment, "
                "but treat it as a suggestion if the week shifts further."
            )
        else:
            confidence_note = (
                f"Confidence is {pct}/100 — the signals are mixed, "
                "so revisit the plan if more information arrives."
            )

    return {
        "summary": summary,
        "changes": changes,
        "preserved": preserved_labels,
        "tradeoff": tradeoff,
        "confidence_note": confidence_note,
    }


# --- Tiny coercion helpers -------------------------------------------------


def _coerce_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _as_str_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for v in value:
        if isinstance(v, str) and v.strip():
            out.append(v.strip())
        elif isinstance(v, (int, float)):
            out.append(str(v))
        elif isinstance(v, dict):
            # Calendar / trend entries may be objects with a short label.
            label = v.get("summary") or v.get("description") or v.get("label")
            if isinstance(label, str) and label.strip():
                out.append(label.strip())
    return out


def _as_workout_list(value: Any) -> List[Any]:
    """Return ``value`` as a list, dropping non-string / non-dict entries."""
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, (str, dict))]


def _workout_label(entry: Any) -> Optional[str]:
    """Pull a short human-readable label from a workout entry."""
    if isinstance(entry, str):
        text = entry.strip()
        return text or None
    if isinstance(entry, dict):
        for key in ("name", "title", "label", "workout", "day"):
            value = entry.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _workout_reason(entry: Any) -> Optional[str]:
    """Pull a short reason / note from a workout entry if present."""
    if isinstance(entry, dict):
        for key in ("reason", "rationale", "note", "explanation"):
            value = entry.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None
