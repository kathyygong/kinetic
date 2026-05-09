"""Apply user constraints (e.g. available time) to a planned workout."""

import re

from .types import Constraints


# Below this many minutes we consider the session "time-constrained"
SHORT_SESSION_THRESHOLD = 45


def apply_constraints(planned_workout: str, constraints: Constraints) -> str:
    """Adjust the planned workout string based on user constraints.

    - If `available_minutes` is short, shorten the workout and tag it.
    - If the planned workout already encodes a duration (e.g. "60 min run"),
      cap that duration at `available_minutes`.
    """
    available = constraints.available_minutes
    workout = planned_workout.strip()

    # Find an explicit duration in the planned workout, e.g. "60 min", "45-minute"
    match = re.search(r"(\d+)\s*(?:min|minute|minutes|m\b)", workout, flags=re.IGNORECASE)
    if match:
        planned_minutes = int(match.group(1))
        if available < planned_minutes:
            workout = re.sub(
                r"\d+\s*(?:min|minute|minutes|m\b)",
                f"{available} min",
                workout,
                count=1,
                flags=re.IGNORECASE,
            )
            workout += f" (shortened from {planned_minutes} min to fit {available} min window)"
            return workout

    # No explicit duration; if the available window is short, shorten generically
    if available < SHORT_SESSION_THRESHOLD:
        return f"{workout} — shortened to {available} min (time-constrained)"

    return workout
