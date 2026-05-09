"""Generate candidate adaptations for today's workout."""

from typing import List

from .types import CandidateAction, Constraints


# Default modify modifiers when the engine has no preference signal —
# moderate intensity / duration cut that still preserves the workout's
# stimulus family. These are softened toward 1.0 (i.e., toward the
# original plan) when `bias_toward_original` is high; see
# `generate_candidates` below.
_DEFAULT_MODIFY_INTENSITY = 0.7
_DEFAULT_MODIFY_DURATION = 0.75


def generate_candidates(
    planned_workout: str,
    state: str,
    constraints: Constraints,
    bias_toward_original: float = 0.0,
) -> List[CandidateAction]:
    """Return three candidate actions: proceed, modify, rest.

    ``bias_toward_original`` is a [0, 1] preference signal derived from
    the runner's acceptance history. When the runner has historically
    rejected the engine's adjustments, we soften the "modify" candidate
    so its modifiers sit closer to 1.0 — meaning the recommended
    adjusted workout looks more like the original plan. The "proceed"
    and "rest" candidates are unchanged: this only tunes the *kind* of
    adjustment we suggest, not whether to suggest one.
    """
    bias = max(0.0, min(1.0, bias_toward_original))

    proceed = CandidateAction(
        name="proceed",
        description=f"Proceed as planned: {planned_workout}",
        intensity_modifier=1.0,
        duration_modifier=1.0,
    )

    # Linearly interpolate from the default modifiers toward 1.0 (the
    # original plan) as bias rises. Cap the pull at 60% so even a
    # runner who's rejected every adjustment still gets a meaningful
    # softening on a fatigued day rather than the same workout twice.
    pull = 0.6 * bias
    modify_intensity = (
        _DEFAULT_MODIFY_INTENSITY
        + (1.0 - _DEFAULT_MODIFY_INTENSITY) * pull
    )
    modify_duration = (
        _DEFAULT_MODIFY_DURATION
        + (1.0 - _DEFAULT_MODIFY_DURATION) * pull
    )

    modify = CandidateAction(
        name="modify",
        description=(
            f"Modify {planned_workout}: reduce intensity and shorten duration "
            "to match current readiness."
        ),
        intensity_modifier=round(modify_intensity, 3),
        duration_modifier=round(modify_duration, 3),
    )

    rest = CandidateAction(
        name="rest",
        description="Take a rest day or do light mobility / easy walk only.",
        intensity_modifier=0.0,
        duration_modifier=0.0,
    )

    return [proceed, modify, rest]
