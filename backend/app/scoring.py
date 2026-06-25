"""Score candidate workout adaptations on safety, goal alignment, and feasibility."""

from typing import List, Optional, Tuple

from .types import CandidateAction, Constraints, TrainingContext


# Explicit weights — safety dominates by design.
WEIGHT_SAFETY = 0.6
WEIGHT_GOAL = 0.25
WEIGHT_FEASIBILITY = 0.15

# Heuristic: assume the planned session targets ~60 minutes when no number is known.
ASSUMED_PLANNED_MINUTES = 60

# --- Learned-preference adjustment constants --------------------------------
#
# Personalization derived from user-confirmed behavior patterns can only nudge
# the engine's choice — it must never override safety. Three guards enforce
# that property:
#
#   1. PREFERENCE_DELTA caps how much a single rule can contribute before
#      we scale by the preference's own confidence multiplier.
#   2. MAX_PREFERENCE_NET_DELTA caps the *total* signed adjustment any one
#      candidate can absorb across all rules combined.
#   3. Safety-touching rules (rest_day_preference, intensity_tolerance) are
#      skipped entirely when ``state == "at_risk"``.
#
# Together these mean: even with multiple "high"-confidence preferences all
# pushing the same way, the maximum shift is ±0.08 in absolute score — well
# below the typical safety-vs-goal score spread (~0.3+) the scoring layer
# produces between e.g. a "proceed" and a "rest" candidate when the runner
# is actually depleted.
PREFERENCE_DELTA = 0.05
MAX_PREFERENCE_NET_DELTA = 0.08
HEAVY_DAY_AVAILABLE_MINUTES = 30  # at-or-below = heavy calendar day

_PREF_CONFIDENCE_MULTIPLIERS = {
    "low": 0.3,
    "moderate": 0.6,
    "high": 1.0,
}


def _safety_score(candidate: CandidateAction, state: str) -> float:
    """How safe is this candidate given the athlete's current state?"""
    intensity = candidate.intensity_modifier

    if state == "at_risk":
        # Heavily penalize intensity; rest is best, modify is okay, proceed is bad.
        return max(0.0, 1.0 - 1.5 * intensity)

    if state == "fatigued":
        # Mild penalty for full intensity.
        return max(0.0, 1.0 - 0.6 * max(0.0, intensity - 0.5))

    # recovered
    if intensity == 0.0:
        # Resting when recovered isn't unsafe, but we don't reward it on safety.
        return 0.85
    return 1.0


def _goal_score(candidate: CandidateAction, state: str) -> float:
    """How well does this candidate move the athlete toward their training goals?"""
    intensity = candidate.intensity_modifier
    duration = candidate.duration_modifier

    # Training adaptation roughly tracks the work performed.
    work = 0.5 * intensity + 0.5 * duration  # in [0, 1]

    if state == "at_risk":
        # Doing too much when at-risk hurts long-term goals.
        return max(0.0, 1.0 - work)
    if state == "fatigued":
        # Moderate work is ideal.
        return 1.0 - abs(work - 0.7)

    # recovered: more work is better, up to 1.0.
    return work


def _feasibility_score(
    candidate: CandidateAction,
    constraints: Constraints,
    training_context: TrainingContext,
) -> float:
    """Does this candidate fit within the user's available time?"""
    available = constraints.available_minutes
    estimated_minutes = ASSUMED_PLANNED_MINUTES * candidate.duration_modifier

    if estimated_minutes <= available:
        return 1.0

    # Penalize linearly by how much it overruns the window.
    overrun_ratio = (estimated_minutes - available) / max(1, available)
    return max(0.0, 1.0 - overrun_ratio)


def score_candidate(
    candidate: CandidateAction,
    state: str,
    constraints: Constraints,
    training_context: TrainingContext,
) -> Tuple[float, str]:
    """Score a single candidate. Returns (score in [0,1], explanation)."""
    safety = _safety_score(candidate, state)
    goal = _goal_score(candidate, state)
    feasibility = _feasibility_score(candidate, constraints, training_context)

    score = (
        WEIGHT_SAFETY * safety
        + WEIGHT_GOAL * goal
        + WEIGHT_FEASIBILITY * feasibility
    )
    score = round(max(0.0, min(1.0, score)), 3)

    explanation = (
        f"{candidate.name}: safety={safety:.2f} "
        f"(w={WEIGHT_SAFETY}), goal={goal:.2f} (w={WEIGHT_GOAL}), "
        f"feasibility={feasibility:.2f} (w={WEIGHT_FEASIBILITY}) "
        f"-> {score:.3f}"
    )
    return score, explanation


# --- Learned-preference adjustments -----------------------------------------


def apply_learned_preferences(
    scored: List[Tuple[CandidateAction, float, str]],
    state: str,
    constraints: Constraints,
    learned_preferences: Optional[List[dict]],
) -> Tuple[List[Tuple[CandidateAction, float, str]], List[str]]:
    """Layer small, bounded score nudges from user-confirmed preferences.

    Inputs
    ------
    scored
        The output of ``score_candidate`` for every candidate, as already
        used by the engine: a list of ``(candidate, score, explanation)``.
    state
        The recovery state classification ("recovered" / "fatigued" /
        "at_risk"). Used as a safety guard: rules that could compromise
        safety are skipped when the runner is at risk.
    constraints
        The merged constraints (calendar availability already folded in).
        ``constraints.available_minutes`` is the heavy-day proxy used by
        ``busy_day_preference``.
    learned_preferences
        Dicts mirroring the frontend ``LearnedPreference`` wire shape
        (``id``, ``type``, ``description``, ``confidence``,
        ``userConfirmed``, ``createdAt``). Anything that isn't a
        confirmed preference is silently dropped.

    Returns
    -------
    ``(new_scored, trace_lines)`` — a new list of ``(candidate, score,
    explanation)`` with score nudges applied, plus one trace line per
    rule that was actually evaluated. The trace explicitly logs both
    *applied* and *safety-skipped* rules so the personalization layer
    is fully auditable from the decision_trace.

    Safety contract
    ---------------
    * Only ``userConfirmed=True`` preferences are honored.
    * Each rule contributes at most ``PREFERENCE_DELTA`` × confidence
      multiplier (max 0.05 raw, scaled down for lower-confidence
      preferences) to a single candidate.
    * The net adjustment for any one candidate is clamped to
      ``±MAX_PREFERENCE_NET_DELTA`` (= 0.08).
    * Safety-touching rules — ``rest_day_preference`` and
      ``intensity_tolerance`` — are skipped when ``state == "at_risk"``.
    * No rule ever changes the candidate set, removes "rest", or boosts
      "proceed" when the runner is at risk.
    """
    if not learned_preferences:
        return scored, []

    confirmed = [
        p for p in learned_preferences
        if isinstance(p, dict) and p.get("userConfirmed") is True
    ]
    if not confirmed:
        return scored, []

    candidate_names = [c.name for c, _, _ in scored]
    deltas: dict[str, float] = {name: 0.0 for name in candidate_names}
    applied_trace: List[str] = []
    has_rest = "rest" in candidate_names
    safety_guarded = state == "at_risk"

    for pref in confirmed:
        ptype = pref.get("type")
        pconf = pref.get("confidence", "moderate")
        mult = _PREF_CONFIDENCE_MULTIPLIERS.get(
            pconf, _PREF_CONFIDENCE_MULTIPLIERS["moderate"]
        )
        delta = round(PREFERENCE_DELTA * mult, 3)
        if delta <= 0:
            continue

        if ptype == "busy_day_preference":
            # Heavy calendar day -> nudge shorter candidates up. Always safe:
            # a shorter session is never riskier than the planned one.
            if constraints.available_minutes <= HEAVY_DAY_AVAILABLE_MINUTES:
                boosted = []
                for c, _, _ in scored:
                    if c.duration_modifier < 1.0:
                        deltas[c.name] += delta
                        boosted.append(c.name)
                if boosted:
                    applied_trace.append(
                        f"Preference 'busy_day_preference' ({pconf}): heavy day "
                        f"({constraints.available_minutes} min available) -> "
                        f"+{delta:.3f} on shorter candidates "
                        f"({', '.join(boosted)})."
                    )
                else:
                    applied_trace.append(
                        "Preference 'busy_day_preference' considered but no "
                        "shorter candidate available to boost."
                    )
            else:
                applied_trace.append(
                    f"Preference 'busy_day_preference' ({pconf}) inactive: "
                    f"calendar not heavy ({constraints.available_minutes} min "
                    "available)."
                )

        elif ptype == "rest_day_preference":
            # Runner tends to override full rest. When a "rest" candidate
            # exists and we're NOT in at-risk state, slightly favour "modify"
            # so the engine surfaces a recovery-run alternative instead of
            # full rest. Skipped under at-risk: safety needs the rest signal.
            if safety_guarded:
                applied_trace.append(
                    f"Preference 'rest_day_preference' ({pconf}) skipped: "
                    "state=at_risk (safety overrides personalization)."
                )
                continue
            if has_rest and "modify" in deltas:
                deltas["modify"] += delta
                applied_trace.append(
                    f"Preference 'rest_day_preference' ({pconf}): runner "
                    f"overrides rest -> +{delta:.3f} on 'modify' "
                    "(recovery-run alternative)."
                )
            else:
                applied_trace.append(
                    f"Preference 'rest_day_preference' ({pconf}) inactive: "
                    "no rest candidate present."
                )

        elif ptype == "intensity_tolerance":
            # Runner consistently finds adjustments too hard / too easy.
            # Soft nudge toward 'modify' (the softer option) — never
            # increases 'proceed' or decreases 'rest'. Skipped under
            # at-risk so low-recovery safety rules win cleanly.
            if safety_guarded:
                applied_trace.append(
                    f"Preference 'intensity_tolerance' ({pconf}) skipped: "
                    "state=at_risk (safety overrides personalization)."
                )
                continue
            if "modify" in deltas:
                deltas["modify"] += delta
                applied_trace.append(
                    f"Preference 'intensity_tolerance' ({pconf}): "
                    f"+{delta:.3f} on 'modify' (softer option)."
                )
            else:
                applied_trace.append(
                    f"Preference 'intensity_tolerance' ({pconf}) inactive: "
                    "no modify candidate present."
                )

        elif ptype == "schedule_preference":
            # No scoring rule yet — the day-of-week swap signal is acted on
            # upstream (in plan generation). Logged here for transparency.
            applied_trace.append(
                f"Preference 'schedule_preference' ({pconf}) acknowledged; "
                "no scoring adjustment (handled upstream in plan generation)."
            )

        else:
            applied_trace.append(
                f"Preference '{ptype}' ({pconf}) ignored (unknown type)."
            )

    if not any(abs(v) > 1e-9 for v in deltas.values()):
        return scored, applied_trace

    new_scored: List[Tuple[CandidateAction, float, str]] = []
    for c, score, explanation in scored:
        raw_delta = deltas.get(c.name, 0.0)
        clamped = max(
            -MAX_PREFERENCE_NET_DELTA,
            min(MAX_PREFERENCE_NET_DELTA, raw_delta),
        )
        if abs(clamped) < 1e-9:
            new_scored.append((c, score, explanation))
            continue
        new_score = round(max(0.0, min(1.0, score + clamped)), 3)
        cap_note = ""
        if abs(raw_delta) > MAX_PREFERENCE_NET_DELTA + 1e-9:
            cap_note = f" (capped from {raw_delta:+.3f})"
        new_scored.append(
            (
                c,
                new_score,
                explanation
                + f" Preference adjustment: {clamped:+.3f}{cap_note}.",
            )
        )

    applied_trace.append(
        "Personalization (learned_preferences): net deltas "
        + ", ".join(
            f"{name}={round(deltas[name], 3):+.3f}" for name in candidate_names
        )
        + f"; clamped at ±{MAX_PREFERENCE_NET_DELTA}."
    )
    return new_scored, applied_trace
