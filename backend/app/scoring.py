"""Score candidate workout adaptations on safety, goal alignment, and feasibility."""

from typing import Tuple

from .types import CandidateAction, Constraints, TrainingContext


# Explicit weights — safety dominates by design.
WEIGHT_SAFETY = 0.6
WEIGHT_GOAL = 0.25
WEIGHT_FEASIBILITY = 0.15

# Heuristic: assume the planned session targets ~60 minutes when no number is known.
ASSUMED_PLANNED_MINUTES = 60


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
