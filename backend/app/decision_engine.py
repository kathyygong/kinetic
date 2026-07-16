"""Top-level decision engine that ties all components together."""

import logging
from dataclasses import replace
from typing import List, Optional

from .types import (
    Biometrics,
    TrainingContext,
    Constraints,
    DataFreshness,
    DecisionOutput,
)
from .calendar import get_available_minutes
from .state_estimator import estimate_state
from .candidate_generator import generate_candidates
from .scoring import apply_learned_preferences, score_candidate
from .constraint_engine import apply_constraints

_log = logging.getLogger(__name__)


# --- Data freshness ---------------------------------------------------------

# Recovery thresholds. Manual readiness logs are expected daily; anything
# older than ~36h means today's decision is leaning on yesterday's mood
# at best. Penalties are intentionally modest so a single missed day
# doesn't tank an otherwise-confident recommendation.
_RECOVERY_FRESH_HOURS = 36.0
_RECOVERY_STALE_HOURS = 72.0
_RECOVERY_MILD_PENALTY = 0.05
_RECOVERY_HARD_PENALTY = 0.15

# Calendar thresholds. Calendar is fetched live per-request, but on
# fallback paths we use the cached availability — the frontend reports
# how long ago that cache was refreshed.
_CALENDAR_FRESH_HOURS = 24.0
_CALENDAR_STALE_HOURS = 72.0
_CALENDAR_MILD_PENALTY = 0.05
_CALENDAR_HARD_PENALTY = 0.10


def _freshness_adjustment(
    freshness: Optional[DataFreshness],
    *,
    penalize_missing_calendar: bool = False,
) -> tuple[float, list[str], list[str]]:
    """Compute the confidence penalty and human-readable notes for the
    supplied freshness info.

    Returns ``(penalty, warnings, trace_notes)``:
      - ``penalty`` is a non-negative float subtracted from the base
        confidence (clamped at the call site so we never go below 0).
      - ``warnings`` are short user-facing strings rendered in the UI.
      - ``trace_notes`` are diagnostic strings appended to the decision
        trace for debugging / probing.
    """
    if freshness is None:
        return 0.0, [], []

    penalty = 0.0
    warnings: list[str] = []
    trace: list[str] = []

    # --- Recovery freshness ------------------------------------------------
    rec = freshness.recovery_age_hours
    if rec is None:
        # No reading ever logged on this device — we still have the demo
        # baseline to fall back on, but the user-specific signal is
        # effectively absent.
        penalty += _RECOVERY_HARD_PENALTY
        warnings.append("Missing updated recovery data")
        trace.append(
            f"Recovery freshness: no reading on file (penalty -{_RECOVERY_HARD_PENALTY:.2f})."
        )
    elif rec > _RECOVERY_STALE_HOURS:
        penalty += _RECOVERY_HARD_PENALTY
        days = max(1, round(rec / 24))
        warnings.append(f"Recovery data last logged {days} days ago")
        trace.append(
            f"Recovery freshness: {rec:.1f}h old (penalty -{_RECOVERY_HARD_PENALTY:.2f})."
        )
    elif rec > _RECOVERY_FRESH_HOURS:
        penalty += _RECOVERY_MILD_PENALTY
        warnings.append("Recovery data is more than a day old")
        trace.append(
            f"Recovery freshness: {rec:.1f}h old (penalty -{_RECOVERY_MILD_PENALTY:.2f})."
        )
    else:
        trace.append(f"Recovery freshness: {rec:.1f}h old (current).")

    # --- Calendar freshness ------------------------------------------------
    cal = freshness.calendar_age_hours
    if cal is None:
        if penalize_missing_calendar:
            # Caller-authoritative clients (Native Today) deliberately skipped
            # server calendar lookup, so a missing age means schedule context
            # is genuinely unverified and must lower confidence.
            penalty += _CALENDAR_HARD_PENALTY
            warnings.append("Missing updated calendar data")
            trace.append(
                f"Calendar freshness: no sync recorded "
                f"(penalty -{_CALENDAR_HARD_PENALTY:.2f})."
            )
        else:
            # Legacy web/server-calendar calls may have just completed a live
            # lookup without a client-side sync timestamp.
            trace.append("Calendar freshness: no client sync recorded (skipped).")
    elif cal > _CALENDAR_STALE_HOURS:
        penalty += _CALENDAR_HARD_PENALTY
        days = max(1, round(cal / 24))
        warnings.append(f"Calendar data last synced {days} days ago")
        trace.append(
            f"Calendar freshness: {cal:.1f}h old (penalty -{_CALENDAR_HARD_PENALTY:.2f})."
        )
    elif cal > _CALENDAR_FRESH_HOURS:
        penalty += _CALENDAR_MILD_PENALTY
        warnings.append("Calendar data is more than a day old")
        trace.append(
            f"Calendar freshness: {cal:.1f}h old (penalty -{_CALENDAR_MILD_PENALTY:.2f})."
        )
    else:
        trace.append(f"Calendar freshness: {cal:.1f}h old (current).")

    return penalty, warnings, trace


def _build_final_workout(planned: str, action, constraints: Constraints) -> str:
    """Compose the human-readable final workout for the selected action."""
    if action.name == "rest":
        return "Rest day: light mobility or easy walk only."

    base = planned if action.name == "proceed" else (
        f"{planned} (intensity x{action.intensity_modifier:.2f}, "
        f"duration x{action.duration_modifier:.2f})"
    )
    return apply_constraints(base, constraints)


def _merge_calendar_constraints(constraints: Constraints) -> tuple[Constraints, str]:
    """Fold today's calendar availability into the caller's constraints.

    Rules:
      - If the caller didn't supply a positive `available_minutes`, populate
        it from the calendar.
      - If they did, take the minimum so the calendar acts as a real-world
        ceiling without overriding a user-imposed tighter window.
      - Any other fields on `Constraints` are preserved via `dataclasses.replace`.
      - If the calendar integration is unavailable (missing credentials,
        offline, transient API error), fall back to the caller's value
        without failing the whole decision.
    """
    caller_minutes = constraints.available_minutes

    if constraints.calendar_authoritative:
        note = (
            f"Calendar availability: caller-authoritative "
            f"{caller_minutes} min (server lookup skipped)."
        )
        return constraints, note

    try:
        calendar_minutes = get_available_minutes()
    except Exception as exc:  # noqa: BLE001 — calendar is best-effort
        _log.warning("Calendar lookup failed (%s); falling back to caller value.", exc)
        if caller_minutes <= 0:
            # No caller hint either — assume a generous default so the engine
            # can still produce a decision instead of blocking on it.
            fallback = 90
            note = (
                f"Calendar unavailable ({type(exc).__name__}); "
                f"using default {fallback} min."
            )
            return replace(constraints, available_minutes=fallback), note
        note = (
            f"Calendar unavailable ({type(exc).__name__}); "
            f"using caller's {caller_minutes} min."
        )
        return constraints, note

    if caller_minutes <= 0:
        merged_minutes = calendar_minutes
        note = (
            f"Calendar availability: {calendar_minutes} min "
            f"(populated; no caller value)."
        )
    else:
        merged_minutes = min(caller_minutes, calendar_minutes)
        if merged_minutes < caller_minutes:
            note = (
                f"Calendar availability: {calendar_minutes} min "
                f"(tightened caller's {caller_minutes} min)."
            )
        else:
            note = (
                f"Calendar availability: {calendar_minutes} min "
                f"(caller's {caller_minutes} min already fits)."
            )

    return replace(constraints, available_minutes=merged_minutes), note


def make_decision(
    biometrics: Biometrics,
    training_context: TrainingContext,
    constraints: Constraints,
    freshness: Optional[DataFreshness] = None,
    bias_toward_original: float = 0.0,
    learned_preferences: Optional[List[dict]] = None,
) -> DecisionOutput:
    """Run the full pipeline and return a DecisionOutput.

    ``freshness`` is optional. When supplied, the engine penalises
    ``confidence`` for stale inputs and surfaces matching warnings on
    ``DecisionOutput.staleness_warnings`` so the UI can flag them
    subtly without changing the core recommendation.

    ``bias_toward_original`` is a [0, 1] preference signal derived from
    the runner's recent acceptance history (computed client-side from
    the workout log). When it's high — meaning the runner tends to
    reject the engine's adjustments — we softly tilt the recommendation
    toward the original plan in two ways:
      1. ``generate_candidates`` lerps the "modify" candidate's
         intensity / duration modifiers toward 1.0 so any adjustment we
         do recommend looks more like the planned workout.
      2. We add a small post-scoring bonus to the "proceed" candidate
         so it wins ties more often. The bonus tops out at +0.10, which
         is small enough that a genuinely poor readiness signal still
         produces a "modify" or "rest" recommendation.
    """
    bias = max(0.0, min(1.0, bias_toward_original))
    trace = []

    # 0) Fold calendar availability into the constraints up front so every
    #    downstream stage sees the same merged value.
    constraints, calendar_note = _merge_calendar_constraints(constraints)
    trace.append(calendar_note)

    # 1) Estimate state
    state, recovery_score, key_factors = estimate_state(biometrics, training_context)
    trace.append(
        f"State estimated: {state} (recovery_score={recovery_score:.3f}); "
        f"factors: {key_factors}"
    )

    # 2) Generate candidates — pass the bias so "modify" gets softened
    #    when the runner tends to reject adjustments.
    candidates = generate_candidates(
        training_context.planned_workout, state, constraints, bias
    )
    trace.append(f"Generated {len(candidates)} candidates: " + ", ".join(c.name for c in candidates))
    if bias > 0:
        modify = next((c for c in candidates if c.name == "modify"), None)
        if modify is not None:
            trace.append(
                f"Personalization: bias_toward_original={bias:.2f} → "
                f"softened modify modifiers to intensity x{modify.intensity_modifier:.2f}, "
                f"duration x{modify.duration_modifier:.2f}."
            )

    # 3) Score each
    scored = []  # list of (candidate, score, explanation)
    scores_by_name = {}
    for c in candidates:
        score, explanation = score_candidate(c, state, constraints, training_context)
        scored.append((c, score, explanation))
        scores_by_name[c.name] = score
        trace.append(explanation)

    # 3b) Apply the proceed bonus. We do this *after* scoring so the
    #     scoring function stays a clean "how well does this candidate
    #     fit the runner's state" calculation, decoupled from
    #     personalization. The bonus is capped at +0.10, which lets a
    #     truly bad readiness day still flip the recommendation away
    #     from "proceed".
    proceed_bonus = round(0.10 * bias, 3)
    if proceed_bonus > 0:
        boosted = []
        for c, score, explanation in scored:
            if c.name == "proceed":
                new_score = round(min(1.0, score + proceed_bonus), 3)
                boosted.append(
                    (
                        c,
                        new_score,
                        explanation
                        + f" Personalization bonus: +{proceed_bonus:.3f} "
                        "(history bias toward original).",
                    )
                )
                scores_by_name[c.name] = new_score
            else:
                boosted.append((c, score, explanation))
        scored = boosted
        trace.append(
            f"Personalization: bias_toward_original={bias:.2f} → "
            f"proceed candidate score +{proceed_bonus:.3f}."
        )

    # 3c) Apply learned-preference adjustments (small, bounded nudges from
    #     user-confirmed behavior patterns). This runs AFTER scoring and
    #     the bias bonus so the base scoring stays a clean state-vs-fit
    #     calculation, and personalization layers are visible and
    #     auditable in the trace. The scoring helper enforces its own
    #     safety contract — per-rule caps, per-candidate net cap, and
    #     skipping safety-touching rules under state=at_risk.
    scored, preference_trace = apply_learned_preferences(
        scored, state, constraints, learned_preferences or []
    )
    trace.extend(preference_trace)
    # Refresh scores_by_name so the engine and clients see the final
    # post-personalization values rather than the pre-adjustment ones.
    scores_by_name = {c.name: s for c, s, _ in scored}

    # 4) Select best
    scored.sort(key=lambda t: t[1], reverse=True)
    best, best_score, _ = scored[0]
    runner_up_score = scored[1][1] if len(scored) > 1 else 0.0
    trace.append(
        f"Selected '{best.name}' with score {best_score:.3f}; "
        f"runner-up score {runner_up_score:.3f}"
    )

    # Confidence blends absolute score quality and lead margin in equal
    # parts: a candidate is highly confident only when it both scores well
    # *and* clearly beats the runner-up. Solo candidates can never exceed
    # 50% on score alone, which is intentional — we want a comparison.
    spread = max(0.0, best_score - runner_up_score)
    base_confidence = min(1.0, 0.5 * best_score + 0.5 * spread)

    # 5) Apply data-freshness penalty. Stale inputs don't change the
    #    selected action — that would amount to making things up — but
    #    they do erode how much the engine trusts its own answer, which
    #    is exactly what confidence is for.
    penalty, warnings, freshness_trace = _freshness_adjustment(
        freshness,
        penalize_missing_calendar=constraints.calendar_authoritative,
    )
    trace.extend(freshness_trace)
    if penalty > 0:
        trace.append(
            f"Confidence: base {base_confidence:.3f} - freshness penalty "
            f"{penalty:.3f} = {max(0.0, base_confidence - penalty):.3f}."
        )
    confidence = round(max(0.0, min(1.0, base_confidence - penalty)), 3)

    final_workout = _build_final_workout(
        training_context.planned_workout, best, constraints
    )
    trace.append(f"Final workout: {final_workout}")

    alternatives = [c for c, _, _ in scored if c.name != best.name]

    return DecisionOutput(
        state=state,
        recovery_score=recovery_score,
        selected_action=best,
        final_workout=final_workout,
        confidence=confidence,
        available_minutes=constraints.available_minutes,
        key_factors=key_factors,
        alternatives=alternatives,
        scores=scores_by_name,
        decision_trace=trace,
        staleness_warnings=warnings,
    )
