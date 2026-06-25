"""AI reasoning layer for Kinetic decisions.

This module sits **downstream** of the deterministic decision engine.
The engine in ``decision_engine.py`` has already picked the workout and
computed the score / confidence; this file only turns the structured
``DecisionOutput`` into a coach-friendly explanation.

Hard rules (enforced by both the system prompt and the fallback):
  * The LLM cannot change the selected workout.
  * The LLM may only reference data present in the decision trace.
  * If anything goes wrong (demo mode, Ollama down, malformed JSON,
    schema mismatch) we fall back to a deterministic explanation
    built from the same trace. The caller never has to handle errors.

Public API
----------
``generate_daily_reasoning(decision_trace) -> dict``
    Returns a dict matching the schema below. Always succeeds. May
    block until the configured timeout when local Ollama mode is enabled.
``lookup_cached_reasoning(decision_trace) -> dict | None``
    Returns the cached reasoning for ``decision_trace`` if one is
    available, else ``None``. Never calls the LLM. Cheap and safe to
    call from latency-sensitive paths like the main `/decision`
    endpoint.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from . import reasoning_cache
from .ai_safety import contains_medical_claim, contradicts_selected_action
from .json_utils import extract_json
from .llm_client import LLMUnavailable, call_llm

_log = logging.getLogger(__name__)


# --- Prompt -----------------------------------------------------------------

SYSTEM_PROMPT = """You are the AI reasoning layer for Kinetic, an adaptive running training system.

You do not decide the workout.
The workout has already been selected by a deterministic decision engine.

Your job is to explain the decision clearly and concisely.

Use only the provided decision trace.
Do not invent biometric data, injuries, diagnoses, calendar events, or training history.
Do not make medical claims.
Do not recommend a workout that was not selected by the deterministic engine.

Be concise. Total response under 250 words.
- summary: 1–2 sentences.
- factors: 2–4 items. Each title ≤ 5 words. Each explanation ≤ 2 short sentences.
- tradeoff: 1–2 sentences.
- confidence_note: 1 sentence.

Return JSON only with this schema:
{
  "summary": string,
  "factors": [
    {
      "title": string,
      "explanation": string,
      "impact": "positive" | "negative" | "neutral"
    }
  ],
  "tradeoff": string,
  "confidence_note": string
}"""


# Allowed values for the `impact` enum.
_IMPACT_VALUES = {"positive", "negative", "neutral"}


# --- Public API -------------------------------------------------------------


def generate_daily_reasoning(decision_trace: Dict[str, Any]) -> Dict[str, Any]:
    """Explain a deterministic decision in structured, coach-like prose.

    ``decision_trace`` is expected to be the ``DecisionOutput`` produced
    by ``decision_engine.make_decision``, serialised to a dict (e.g. via
    ``dataclasses.asdict``). The function tolerates partial / missing
    fields — the fallback path can build a reasonable explanation from
    whatever is present.

    The return value always matches the schema documented in the system
    prompt above. On any failure path the caller still gets a usable
    dict; the failure mode is logged but never raised.

    Caching: successful LLM-authored responses are memoised by a stable
    hash of the canonical decision fields, so repeat calls for the same
    state + selected workout return in O(1) without hitting the model.
    Fallback responses are deliberately *not* cached — we want the next
    request to retry the LLM in case the prior failure was transient.
    """
    if not isinstance(decision_trace, dict):
        _log.warning("generate_daily_reasoning: non-dict input; using fallback")
        return _fallback_reasoning({})

    cache_key = reasoning_cache.reasoning_cache_key(decision_trace)
    cached = reasoning_cache.get(cache_key)
    if cached is not None:
        return cached

    user_prompt = _build_user_prompt(decision_trace)

    try:
        raw = call_llm(user_prompt, system_prompt=SYSTEM_PROMPT)
    except LLMUnavailable as exc:
        _log.warning("LLM unavailable, falling back to deterministic reasoning: %s", exc)
        return _fallback_reasoning(decision_trace)

    parsed = extract_json(raw)
    if parsed is None:
        _log.warning("LLM returned unparseable JSON; falling back. Raw head: %r", raw[:200])
        return _fallback_reasoning(decision_trace)

    validated = _validate_schema(parsed)
    if validated is None:
        _log.warning("LLM JSON did not match schema; falling back. Body: %r", parsed)
        return _fallback_reasoning(decision_trace)

    selected = decision_trace.get("selected_action")
    action_name = selected.get("name") if isinstance(selected, dict) else None
    if contains_medical_claim(validated):
        _log.warning("LLM reasoning tripped medical-claim guard; falling back.")
        return _fallback_reasoning(decision_trace)
    if contradicts_selected_action(validated, action_name):
        _log.warning("LLM reasoning contradicted selected action; falling back.")
        return _fallback_reasoning(decision_trace)

    reasoning_cache.put(cache_key, validated)
    return validated


def lookup_cached_reasoning(
    decision_trace: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return the cached reasoning for ``decision_trace`` if present.

    Never calls the LLM, never falls back, never blocks. Intended for
    the synchronous ``/decision`` endpoint to opportunistically embed
    reasoning when it's free (cache hit) and otherwise return ``None``
    so the client can fetch it lazily.
    """
    if not isinstance(decision_trace, dict):
        return None
    return reasoning_cache.get(reasoning_cache.reasoning_cache_key(decision_trace))


# --- Prompt building -------------------------------------------------------


def _build_user_prompt(decision_trace: Dict[str, Any]) -> str:
    """Render the decision trace as a single user-prompt string.

    We pass only the fields the model strictly needs to phrase the four
    output sections. Excluded:
      * ``decision_trace`` (verbose internal scoring log)
      * ``alternatives`` (we don't enumerate the rejected options; the
        ``tradeoff`` line just contrasts the selected action against
        "the alternative" generically)
      * ``scores`` (numeric weights don't help explanation prose, and
        listing them encourages the model to copy numbers instead of
        explaining)
    Trimming these dropped prompt-eval time by ~30% on local CPU.
    """
    summary_view: Dict[str, Any] = {}
    for key in (
        "state",
        "recovery_score",
        "final_workout",
        "confidence",
        "available_minutes",
        "key_factors",
        "staleness_warnings",
    ):
        if key in decision_trace:
            summary_view[key] = decision_trace[key]

    selected = decision_trace.get("selected_action")
    if isinstance(selected, dict):
        summary_view["selected_action"] = {
            "name": selected.get("name"),
            "description": selected.get("description"),
        }

    payload = json.dumps(summary_view, indent=2, default=str)
    return (
        "Explain the following Kinetic decision to the runner.\n"
        "Stay grounded in the trace. Return JSON only — no preamble, "
        "no commentary, no <think> blocks, no markdown fences.\n\n"
        "Decision trace:\n"
        f"{payload}"
    )


# --- Schema validation -----------------------------------------------------


def _validate_schema(obj: Dict[str, Any]) -> Dict[str, Any] | None:
    """Return ``obj`` coerced to the published schema, or ``None`` on failure.

    We're strict about types and the ``impact`` enum but tolerant of
    extra keys — the LLM sometimes adds metadata, which we silently
    drop rather than reject the whole response over.
    """
    summary = obj.get("summary")
    tradeoff = obj.get("tradeoff")
    confidence_note = obj.get("confidence_note")
    factors_raw = obj.get("factors")

    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(tradeoff, str):
        return None
    if not isinstance(confidence_note, str):
        return None
    if not isinstance(factors_raw, list):
        return None

    factors: List[Dict[str, str]] = []
    for entry in factors_raw:
        if not isinstance(entry, dict):
            return None
        title = entry.get("title")
        explanation = entry.get("explanation")
        impact = entry.get("impact")
        if not isinstance(title, str) or not title.strip():
            return None
        if not isinstance(explanation, str) or not explanation.strip():
            return None
        if impact not in _IMPACT_VALUES:
            return None
        factors.append(
            {
                "title": title.strip(),
                "explanation": explanation.strip(),
                "impact": impact,
            }
        )

    return {
        "summary": summary.strip(),
        "factors": factors,
        "tradeoff": tradeoff.strip(),
        "confidence_note": confidence_note.strip(),
    }


# --- Deterministic fallback ------------------------------------------------


def _fallback_reasoning(decision_trace: Dict[str, Any]) -> Dict[str, Any]:
    """Build a coach-style explanation directly from the trace.

    No model calls, no creativity — just rephrase the structured fields
    so the UI still shows something useful when the LLM is offline or
    misbehaves. Every value here is read from the trace; nothing is
    invented.
    """
    state = str(decision_trace.get("state") or "unknown")
    recovery_score = _coerce_float(decision_trace.get("recovery_score"))
    confidence = _coerce_float(decision_trace.get("confidence"))
    final_workout = str(decision_trace.get("final_workout") or "today's session")
    key_factors = _as_str_list(decision_trace.get("key_factors"))
    staleness = _as_str_list(decision_trace.get("staleness_warnings"))
    scores = decision_trace.get("scores") if isinstance(decision_trace.get("scores"), dict) else {}
    selected_action = decision_trace.get("selected_action") or {}
    action_name = str(selected_action.get("name") or "proceed") if isinstance(selected_action, dict) else "proceed"

    # --- summary
    state_phrase = {
        "recovered": "You're recovered",
        "fatigued": "You're showing some fatigue",
        "at_risk": "Recovery signals are low",
    }.get(state, "Today's plan")

    action_phrase = {
        "proceed": "so the plan stays as scheduled",
        "modify": "so the workout has been adjusted to match",
        "rest": "so today is a rest day",
    }.get(action_name, "and the engine selected the best fit")

    summary_bits = [f"{state_phrase} {action_phrase}: {final_workout}."]
    if recovery_score is not None:
        summary_bits.append(f"Recovery score {round(recovery_score * 100)}/100.")
    summary = " ".join(summary_bits)

    # --- factors
    factors: List[Dict[str, str]] = []
    impact_for_state = {
        "recovered": "positive",
        "fatigued": "negative",
        "at_risk": "negative",
    }.get(state, "neutral")

    for kf in key_factors[:4]:
        factors.append(
            {
                "title": "Readiness signal",
                "explanation": kf,
                "impact": impact_for_state,
            }
        )

    if not factors:
        factors.append(
            {
                "title": "Readiness",
                "explanation": "No standout signals — readiness is within normal range.",
                "impact": "neutral",
            }
        )

    for warning in staleness[:2]:
        factors.append(
            {
                "title": "Data freshness",
                "explanation": warning,
                "impact": "neutral",
            }
        )

    # --- tradeoff
    best_score = scores.get(action_name) if isinstance(scores, dict) else None
    other_scores = {
        k: v
        for k, v in (scores.items() if isinstance(scores, dict) else [])
        if k != action_name and isinstance(v, (int, float))
    }
    if other_scores and isinstance(best_score, (int, float)):
        runner_up_name, runner_up_score = max(other_scores.items(), key=lambda kv: kv[1])
        tradeoff = (
            f"'{action_name}' scored {round(float(best_score), 2)} vs. "
            f"'{runner_up_name}' at {round(float(runner_up_score), 2)} — "
            "the engine picked the option with the best balance of safety, "
            "goal alignment, and feasibility."
        )
    else:
        tradeoff = (
            f"The engine compared proceed / modify / rest and selected "
            f"'{action_name}' as the best fit for today's signals."
        )

    # --- confidence note
    if confidence is None:
        confidence_note = "Confidence not reported for this decision."
    else:
        pct = round(confidence * 100)
        if staleness:
            confidence_note = (
                f"Confidence is {pct}/100. Some inputs are stale, which lowers how "
                "strongly the engine trusts today's recommendation."
            )
        elif confidence >= 0.7:
            confidence_note = f"Confidence is {pct}/100 — the recommendation is well supported by the inputs."
        elif confidence >= 0.45:
            confidence_note = f"Confidence is {pct}/100 — a reasonable call, but the runner-up was close."
        else:
            confidence_note = (
                f"Confidence is {pct}/100 — the signals are mixed, so treat the recommendation as a suggestion "
                "rather than a hard rule."
            )

    return {
        "summary": summary,
        "factors": factors,
        "tradeoff": tradeoff,
        "confidence_note": confidence_note,
    }


# --- Tiny coercion helpers -------------------------------------------------


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _as_str_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(v) for v in value if isinstance(v, (str, int, float))]
