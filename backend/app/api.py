"""FastAPI app exposing the Kinetic decision engine."""

import logging
import os
from dataclasses import asdict
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import RequireAuth
from .calendar import detect_travel_events, get_week_availability
from .decision_engine import make_decision
from .types import Biometrics, TrainingContext, Constraints, DataFreshness

_log = logging.getLogger(__name__)


# --- Request models ---------------------------------------------------------

class BiometricsIn(BaseModel):
    hrv: float
    hrv_baseline: float
    sleep_hours: float
    resting_hr: float
    # Optional 1–5 self-reports captured alongside on the Recovery
    # page. When present they’re folded into the state estimate so
    # the final decision tracks how the athlete actually feels.
    fatigue_level: int | None = None
    soreness_level: int | None = None


class TrainingContextIn(BaseModel):
    planned_workout: str
    recent_workouts: List[str] = []


class ConstraintsIn(BaseModel):
    available_minutes: int


class DataFreshnessIn(BaseModel):
    """Optional per-source freshness reported by the client.

    Both fields are hours since the last successful update for that
    source on the caller's device. ``None`` means we have no record at
    all (e.g. the user has never logged readiness, or the calendar has
    never been successfully synced). The decision engine treats the
    missing-recovery case as "very stale" but the missing-calendar case
    as "not configured" to avoid penalising new accounts.
    """
    recovery_age_hours: float | None = None
    calendar_age_hours: float | None = None


class DecisionRequest(BaseModel):
    biometrics: BiometricsIn
    training_context: TrainingContextIn
    constraints: ConstraintsIn
    # Optional so older clients (and the probe scripts) keep working
    # untouched — the engine simply skips the staleness penalty when
    # nothing's reported.
    data_freshness: DataFreshnessIn | None = None
    # Optional [0, 1] preference signal derived from the runner's
    # recent acceptance history. When the runner consistently rejects
    # the engine's adjustments, the client passes a value > 0 and the
    # engine softens the "modify" candidate and lightly favours
    # "proceed". Defaults to 0 (no personalization) for older clients
    # and the probe scripts.
    bias_toward_original: float | None = None


# --- App --------------------------------------------------------------------

app = FastAPI(title="Kinetic", description="Adaptive training decision engine")

# CORS: comma-separated origins via env, defaulting to local dev. Use "*"
# only if explicitly opted in.
_DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
_origins_env = os.environ.get("KINETIC_CORS_ORIGINS", _DEFAULT_ORIGINS)
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/decision", dependencies=[RequireAuth])
def decision(payload: DecisionRequest):
    biometrics = Biometrics(**payload.biometrics.model_dump())
    training_context = TrainingContext(**payload.training_context.model_dump())
    constraints = Constraints(**payload.constraints.model_dump())
    freshness = (
        DataFreshness(**payload.data_freshness.model_dump())
        if payload.data_freshness is not None
        else None
    )

    result = make_decision(
        biometrics,
        training_context,
        constraints,
        freshness,
        bias_toward_original=payload.bias_toward_original or 0.0,
    )
    return asdict(result)


@app.get("/availability/week", dependencies=[RequireAuth])
def availability_week(days: int = 7):
    """Per-day available minutes for the next `days` days (default 7).

    Cap is 120 days so the frontend can fetch a full 16-week plan in one
    call when computing the calendar-aware initial plan.
    """
    if days < 1 or days > 120:
        days = 7
    try:
        return {"days": get_week_availability(days=days)}
    except Exception as exc:  # noqa: BLE001 — calendar is best-effort
        _log.warning("availability/week failed: %s", exc)
        # 503 lets the frontend distinguish "calendar not configured" from
        # "calendar said zero free minutes". The dashboard already swallows
        # non-2xx silently, so the rest of the UX still works.
        raise HTTPException(
            status_code=503,
            detail=f"Calendar unavailable: {type(exc).__name__}",
        )


@app.get("/travel", dependencies=[RequireAuth])
def travel(days: int = 14):
    """Travel events detected in the next `days` days (default 14).

    Cap is 180 days so we can spot travel for the full plan horizon.
    """
    if days < 1 or days > 180:
        days = 14
    try:
        return {"events": detect_travel_events(days=days)}
    except Exception as exc:  # noqa: BLE001 — calendar is best-effort
        _log.warning("travel failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=f"Calendar unavailable: {type(exc).__name__}",
        )
