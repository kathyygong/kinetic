"""Core data types for the Kinetic adaptive training decision engine."""

from dataclasses import dataclass, field
from typing import List, Dict, Optional


@dataclass
class Biometrics:
    """Raw biometric signals used to estimate readiness.

    The first four fields come from a wearable (or manual entry on the
    Recovery page). The optional `fatigue_level` and `soreness_level`
    are 1–5 self-reports captured alongside, and are folded into the
    recovery state estimate when present so the final decision reacts
    to how the athlete actually feels — not just to HRV / sleep.
    """
    hrv: float
    hrv_baseline: float
    sleep_hours: float
    resting_hr: float
    fatigue_level: Optional[int] = None  # 1=fresh .. 5=wiped
    soreness_level: Optional[int] = None  # 1=none  .. 5=very sore


@dataclass
class TrainingContext:
    """Context about the planned and recent training."""
    planned_workout: str
    recent_workouts: List[str] = field(default_factory=list)


@dataclass
class Constraints:
    """User-imposed constraints on today's session."""
    available_minutes: int
    # True when the client already resolved calendar availability (including
    # an explicit zero-minute window or a plan-duration fallback).
    calendar_authoritative: bool = False


@dataclass
class DataFreshness:
    """How recent the inputs feeding the decision actually are.

    Both ages are measured in hours since the last successful update for
    that source. ``None`` means we have no record at all (e.g. the user
    has never logged a manual readiness reading, or the calendar has
    never successfully synced on this device). The decision engine
    treats ``None`` as "very stale" for the purposes of confidence
    penalties — there's literally no signal to trust.
    """
    recovery_age_hours: Optional[float] = None
    calendar_age_hours: Optional[float] = None


@dataclass
class CandidateAction:
    """A possible adaptation to today's workout."""
    name: str  # "proceed" | "modify" | "rest"
    description: str
    intensity_modifier: float
    duration_modifier: float


@dataclass
class DecisionOutput:
    """Final decision returned by the engine."""
    state: str
    recovery_score: float
    selected_action: CandidateAction
    final_workout: str
    confidence: float
    available_minutes: int = 0
    key_factors: List[str] = field(default_factory=list)
    alternatives: List[CandidateAction] = field(default_factory=list)
    scores: Dict[str, float] = field(default_factory=dict)
    decision_trace: List[str] = field(default_factory=list)
    # Short, human-readable strings describing any data sources the engine
    # considered stale for this decision (e.g. "Calendar data last
    # synced 3 days ago"). Empty list when everything is current.
    staleness_warnings: List[str] = field(default_factory=list)
