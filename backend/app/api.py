"""FastAPI app exposing the Kinetic decision engine."""

import logging
import copy
import os
from dataclasses import asdict
from typing import List

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import RequireAuth
from .calendar import (
    calendar_health,
    detect_travel_events,
    get_week_availability,
)
from .decision_engine import make_decision
from .ai_reasoning import generate_daily_reasoning, lookup_cached_reasoning
from .ai_runtime import runtime_status
from .weekly_reasoning import generate_weekly_recalibration_summary
from .behavior_insights import (
    BehaviorPatternEnvelope,
    deterministic_behavior_insights,
    generate_behavior_insights,
)
from .intake_parser import (
    IntakeParseEnvelope,
    IntakeParseRequest,
    parse_intake,
    warm_intake_model,
)
from .mobile_intake import (
    MobileIntakeEnvelope,
    MobileIntakeRequest,
    route_mobile_intake,
)
from .training_summary import (
    TrainingSummaryEnvelope,
    TrainingSummaryRequest,
    generate_training_summary,
)
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
    available_minutes: int = Field(ge=0, le=240)
    # Mobile and other cache-aware clients can explicitly declare that they
    # already resolved availability. In that case the engine must not replace
    # a valid zero-minute window or a plan-duration fallback with server-side
    # calendar data/defaults.
    calendar_authoritative: bool = False


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


class LearnedPreferenceIn(BaseModel):
    """A pattern Kinetic has inferred from the runner's behavior.

    Mirrors the frontend's ``LearnedPreference`` type (see
    ``frontend/lib/behaviorTypes.ts``). Field names match the
    over-the-wire shape sent by the dashboard, including the
    camelCase ``userConfirmed`` / ``createdAt`` — Pydantic v2 is
    happy to validate them as-is and the engine never reformats them.

    ``extra="ignore"`` keeps the endpoint forward-compatible: newer
    clients can attach extra fields (e.g. ``lastReinforcedAt``) without
    a backend deploy.
    """

    id: str
    type: str
    # The deterministic scorer uses the bounded type/confidence fields only.
    # Keeping description optional lets privacy-minimized clients omit free
    # text while preserving compatibility with older web requests.
    description: str = ""
    confidence: str
    userConfirmed: bool
    createdAt: str

    model_config = {"extra": "ignore"}


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
    # Optional list of preferences the runner has explicitly confirmed
    # on the "Kinetic is learning" card. Always treated as an empty
    # list when missing so older clients (and the probe scripts) keep
    # working unchanged. The decision engine receives the list but is
    # free to ignore preferences it doesn't yet know how to act on.
    learned_preferences: List[LearnedPreferenceIn] | None = None


# --- App --------------------------------------------------------------------

app = FastAPI(title="Kinetic", description="Adaptive training decision engine")


@app.on_event("startup")
def preload_intake_model() -> None:
    """Warm latency-sensitive local intake before accepting requests."""

    status = runtime_status()
    if not status["live_model_enabled"]:
        return
    try:
        warm_intake_model()
    except Exception as exc:  # noqa: BLE001
        _log.warning("Intake model warmup failed; fallback remains available: %s", exc)

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
    allow_headers=["Authorization", "Content-Type", "X-Google-Access-Token"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ai/status")
def ai_status():
    """Report the bounded AI runtime mode without touching the model.

    This endpoint is intentionally cheap and side-effect free. It never
    probes Ollama over the network; it reports whether Kinetic is in
    deterministic fallback, explicit disabled mode, or configured for
    local Ollama demo calls.
    """
    return runtime_status()


@app.post("/decision", dependencies=[RequireAuth])
def decision(payload: DecisionRequest):
    """Run the deterministic decision engine and return immediately.

    The response shape is
    ``{decision, ai_reasoning, reasoning_available}``.

    ``ai_reasoning`` is populated only when an LLM-authored explanation
    for the same decision is already in cache (free hit), otherwise
    ``None`` with ``reasoning_available=False``. Clients that want the
    reasoning when it's a cache miss should follow up with a POST to
    ``/decision/reasoning``. This split keeps the main endpoint
    sub-100ms while still letting cheap calls piggy-back the
    explanation in a single round trip.
    """
    biometrics = Biometrics(**payload.biometrics.model_dump())
    training_context = TrainingContext(**payload.training_context.model_dump())
    constraints = Constraints(**payload.constraints.model_dump())
    freshness = (
        DataFreshness(**payload.data_freshness.model_dump())
        if payload.data_freshness is not None
        else None
    )

    learned_preferences = [
        pref.model_dump() for pref in (payload.learned_preferences or [])
    ]

    result = make_decision(
        biometrics,
        training_context,
        constraints,
        freshness,
        bias_toward_original=payload.bias_toward_original or 0.0,
        learned_preferences=learned_preferences,
    )
    decision_dict = asdict(result)

    # Free piggy-back: if reasoning for this exact decision is already
    # cached, include it. Never call the LLM here — the whole point of
    # /decision is to be fast.
    cached_reasoning = lookup_cached_reasoning(decision_dict)

    return {
        "decision": decision_dict,
        "ai_reasoning": cached_reasoning,
        "reasoning_available": cached_reasoning is not None,
    }


class ReasoningRequest(BaseModel):
    """Body for ``/decision/reasoning``.

    Accepts the full ``decision`` block as returned by ``/decision``,
    plus any extra keys (e.g. ``decision_trace``, ``alternatives``)
    that the engine attaches. We don't validate the inner shape
    strictly: the reasoning layer is contract-bound to tolerate
    partial / missing fields and fall back gracefully.
    """

    decision: dict


@app.post("/decision/reasoning", dependencies=[RequireAuth])
def decision_reasoning(payload: ReasoningRequest):
    """Generate (or return cached) AI reasoning for a deterministic decision.

    This endpoint is the slow path: on a cache miss it may invoke the
    configured local model, bounded by ``LLM_TIMEOUT_SECONDS``. On a cache hit
    (same state + selected workout + key factors) it returns in ~1ms.

    Cache hits and misses both return the same shape:
    ``{ai_reasoning}``. The reasoning layer never raises; fallback,
    disabled, timeout, or schema failure paths all return deterministic prose.
    """
    try:
        ai_reasoning = generate_daily_reasoning(payload.decision)
    except Exception as exc:  # noqa: BLE001 — defensive belt-and-braces
        _log.warning("ai_reasoning unexpectedly raised: %s", exc)
        ai_reasoning = generate_daily_reasoning({})

    return {"ai_reasoning": ai_reasoning}


class WeeklyReasoningRequest(BaseModel):
    """Body for ``/weekly-reasoning``.

    Accepts the full recalibration trace produced by the weekly plan
    adjuster. We don't validate the inner shape strictly: the weekly
    reasoning layer is contract-bound to tolerate partial / missing
    fields and fall back gracefully.
    """

    recalibration_trace: dict


@app.post("/weekly-reasoning", dependencies=[RequireAuth])
def weekly_reasoning(payload: WeeklyReasoningRequest):
    """Explain a deterministic weekly recalibration in coach-like prose.

    This endpoint never modifies the weekly plan — it only generates a
    structured explanation of the diff between the original and the
    adjusted plan. The reasoning layer falls back to a deterministic
    summary when the LLM is unavailable, malformed, or off-schema, so
    this handler always returns a usable payload.
    """
    try:
        summary = generate_weekly_recalibration_summary(payload.recalibration_trace)
    except Exception as exc:  # noqa: BLE001 — defensive belt-and-braces
        _log.warning("weekly_reasoning unexpectedly raised: %s", exc)
        summary = generate_weekly_recalibration_summary({})

    return summary


class WhatIfRequest(BaseModel):
    """Read-only deterministic simulation produced by the frontend planner."""

    simulation: dict


@app.post("/ai/what-if", dependencies=[RequireAuth])
def explain_what_if(payload: WhatIfRequest):
    """Explain, but never apply, a deterministic What-if simulation.

    The adjusted week is already final when it arrives. This handler echoes an
    immutable copy and asks the bounded weekly reasoning layer only to explain
    the tradeoff. No storage or plan-mutation code is reachable here.
    """

    simulation = copy.deepcopy(payload.simulation)
    original = simulation.get("original_week_plan", [])
    adjusted = simulation.get("simulated_week_plan", [])
    adjustments = simulation.get("adjustments", [])
    preserved = simulation.get("preserved_workouts", [])

    modified = []
    dropped = []
    if isinstance(adjustments, list):
        for adjustment in adjustments:
            if not isinstance(adjustment, dict):
                continue
            if adjustment.get("action") == "dropped":
                dropped.append(adjustment)
            elif adjustment.get("action") != "kept":
                modified.append(adjustment)

    trace = {
        "original_week_plan": original if isinstance(original, list) else [],
        "adjusted_week_plan": adjusted if isinstance(adjusted, list) else [],
        "calendar_changes": [simulation.get("scenario_summary", "")]
        if simulation.get("scenario_summary")
        else [],
        "recovery_trends": [],
        "preserved_workouts": preserved if isinstance(preserved, list) else [],
        "modified_workouts": modified,
        "dropped_workouts": dropped,
        "confidence": 0.8,
    }
    explanation = generate_weekly_recalibration_summary(trace)
    status = runtime_status()

    return {
        "mode": status["mode"],
        "source": status["source"],
        "schema_version": "what-if.v1",
        "grounding": {
            "deterministic_authority": True,
            "fields": [
                "original_week_plan",
                "simulated_week_plan",
                "adjustments",
                "scenario_summary",
            ],
        },
        "fallback_used": status["fallback_used"],
        "warnings": [
            "Read-only preview. Nothing changes until a deterministic plan action is explicitly accepted."
        ],
        "simulation": simulation,
        "explanation": explanation,
    }


@app.post(
    "/ai/parse-intake",
    response_model=IntakeParseEnvelope | MobileIntakeEnvelope,
    dependencies=[RequireAuth],
)
def parse_natural_language_intake(
    payload: IntakeParseRequest | MobileIntakeRequest,
) -> IntakeParseEnvelope | MobileIntakeEnvelope:
    """Route or parse a note without mutating training state."""

    if isinstance(payload, MobileIntakeRequest):
        return route_mobile_intake(payload)
    return parse_intake(payload)


@app.post(
    "/ai/training-summary",
    response_model=TrainingSummaryEnvelope,
    dependencies=[RequireAuth],
)
def training_summary(
    payload: TrainingSummaryRequest,
) -> TrainingSummaryEnvelope:
    """Return a read-only aggregate review with bounded optional prose."""

    return generate_training_summary(payload)


# The endpoint short-circuits to the deterministic fallback when the
# runner has fewer than this many recorded recommendations. Stricter
# than the module's LOW_DATA_THRESHOLD (which only forces "low"
# confidence): below this cutoff there is so little signal that the
# LLM has nothing meaningful to add, and paying its wall-clock cost
# is wasteful.
_MIN_EVENTS_FOR_LLM = 3


class BehaviorInsightsRequest(BaseModel):
    """Body for ``/behavior-insights``.

    The events list is intentionally untyped (``list[dict]``) — the
    behavior-insights layer is contract-bound to tolerate partial /
    malformed entries and silently drop anything it can't read.
    Validating each event with a Pydantic model here would just
    duplicate that work.
    """

    recommendation_events: list[dict]


@app.post(
    "/behavior-insights",
    dependencies=[RequireAuth],
    response_model=BehaviorPatternEnvelope,
)
def behavior_insights(payload: BehaviorInsightsRequest):
    """Surface conservative behavioural patterns from recommendation history.

    The endpoint is **read-only**: it never writes back to user
    preferences, training plans, or any other persisted state. Its
    output is purely advisory.

    Behaviour:
      * Fewer than 3 events → return the deterministic low-data
        response immediately, skipping the LLM call.
      * Otherwise → invoke the full insight pipeline. The
        ``generate_behavior_insights`` function falls back to the
        same deterministic path on any LLM failure (offline, demo
        mode, malformed JSON, schema mismatch), so this handler
        always returns a usable payload.
    """
    events = payload.recommendation_events or []

    if len(events) < _MIN_EVENTS_FOR_LLM:
        # Deterministic-only path. Honours the "no LLM" guarantee for
        # sparse history regardless of how the upstream module is
        # configured.
        return deterministic_behavior_insights(events)

    try:
        return generate_behavior_insights(events)
    except Exception as exc:  # noqa: BLE001 — defensive belt-and-braces
        # `generate_behavior_insights` already absorbs LLM failures
        # internally and returns a fallback, so getting here means an
        # unexpected error in our own code. Surface the deterministic
        # fallback rather than 500'ing on the runner.
        _log.warning("behavior_insights unexpectedly raised: %s", exc)
        return deterministic_behavior_insights(events)


@app.get("/availability/week", dependencies=[RequireAuth])
def availability_week(
    days: int = 7,
    x_google_access_token: str | None = Header(default=None),
):
    """Per-day available minutes for the next `days` days (default 7).

    Cap is 120 days so the frontend can fetch a full 16-week plan in one
    call when computing the calendar-aware initial plan.

    The ``X-Google-Access-Token`` header (sent by the frontend after
    the user completes the Google OAuth popup) lets us talk to Google
    directly with the user's own credentials. Without it we fall back
    to the server's cached ``token.json`` — which only the operator
    can refresh.
    """
    if days < 1 or days > 120:
        days = 7
    try:
        return {
            "days": get_week_availability(
                days=days, access_token=x_google_access_token
            )
        }
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
def travel(
    days: int = 14,
    x_google_access_token: str | None = Header(default=None),
):
    """Travel events detected in the next `days` days (default 14).

    Cap is 180 days so we can spot travel for the full plan horizon.

    See ``availability_week`` for the ``X-Google-Access-Token`` semantics.
    """
    if days < 1 or days > 180:
        days = 14
    try:
        return {
            "events": detect_travel_events(
                days=days, access_token=x_google_access_token
            )
        }
    except Exception as exc:  # noqa: BLE001 — calendar is best-effort
        _log.warning("travel failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=f"Calendar unavailable: {type(exc).__name__}",
        )


@app.get("/integrations/calendar/health", dependencies=[RequireAuth])
def integrations_calendar_health(
    x_google_access_token: str | None = Header(default=None),
):
    """Report Google Calendar reachability for the current user.

    Prefers the user's frontend OAuth token (when supplied via the
    ``X-Google-Access-Token`` header) since that's what the dashboard
    actually uses to fetch availability. Falls back to the server's
    cached ``token.json`` when the header is absent.
    """
    return calendar_health(access_token=x_google_access_token)
