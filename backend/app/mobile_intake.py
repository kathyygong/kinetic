"""Versioned, privacy-bounded routing for Mobile Phase 2.5 intake.

This module is deliberately read-only. It classifies a short note into one
bounded product destination and may reuse the existing intake parser to build
an untrusted draft. It has no persistence or plan-mutation imports.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .intake_parser import (
    Day,
    Experience,
    IntakeDraft,
    IntakeParseRequest,
    RaceDistance,
    deterministic_parse,
    parse_intake,
)

MOBILE_INTAKE_SCHEMA = "mobile-intake.v1"

DraftKind = Literal[
    "schedule",
    "availability",
    "travel",
    "workout_swap",
    "goal",
    "preferred_day",
]
RouteName = Literal[
    "review_draft",
    "perceived_recovery",
    "caution",
    "missed_workout",
    "reflection",
    "explanation",
    "clarification",
    "refusal",
]
ParserFailure = Literal[
    "none",
    "ai_disabled",
    "ai_timeout",
    "ai_unavailable",
    "malformed_ai",
    "ungrounded_ai",
    "parser_error",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MobileGoalContext(StrictModel):
    race_distance: RaceDistance | None = None
    target_date: str | None = None
    weekly_mileage: float | None = Field(default=None, ge=1, le=150)


class MobileProfileContext(StrictModel):
    experience_level: Experience | None = None
    preferred_training_days: list[Day] = Field(default_factory=list, max_length=7)


class MobileDecisionContext(StrictModel):
    selected_action: Literal["proceed", "modify", "rest", "unknown"]
    readiness_state: Literal["ready", "caution", "unknown", "stale"]
    calendar_state: Literal["clear", "conflict", "stale", "missing"]
    confidence_bucket: Literal["low", "moderate", "high", "unknown"]
    staleness_warning_count: int = Field(ge=0, le=10)


class MobileIntakeContext(StrictModel):
    today: date
    current_goal: MobileGoalContext | None = None
    current_profile: MobileProfileContext | None = None
    decision: MobileDecisionContext | None = None


class MobileIntakeRequest(StrictModel):
    schema_version: Literal["mobile-intake.v1"]
    platform: Literal["ios"]
    text: str = Field(min_length=1, max_length=280)
    context: MobileIntakeContext

    @model_validator(mode="after")
    def trimmed_text(self) -> "MobileIntakeRequest":
        self.text = self.text.strip()
        if not self.text:
            raise ValueError("text must contain a non-whitespace character")
        return self


class ParserMetadata(StrictModel):
    source: Literal["deterministic", "ollama", "deterministic_router"]
    ai_attempted: bool
    fallback_used: bool
    failure: ParserFailure


class ReviewDraftOutcome(StrictModel):
    route: Literal["review_draft"] = "review_draft"
    mutable: Literal[True] = True
    draft_kinds: list[DraftKind] = Field(min_length=1, max_length=6)
    review_required: Literal[True] = True
    confirmation_required: Literal[True] = True
    deterministic_validation_required: Literal[True] = True
    draft: IntakeDraft


class PerceivedRecoveryOutcome(StrictModel):
    route: Literal["perceived_recovery"] = "perceived_recovery"
    mutable: Literal[False] = False
    destination: Literal["perceived_recovery_capture"] = "perceived_recovery_capture"
    fields_to_capture: list[
        Literal["perceived_recovery", "fatigue", "soreness", "sleep_correction"]
    ] = ["perceived_recovery", "fatigue", "soreness", "sleep_correction"]
    inferred_values: Literal[False] = False
    persistence_available: Literal[False] = False


class CautionOutcome(StrictModel):
    route: Literal["caution"] = "caution"
    mutable: Literal[False] = False
    destination: Literal["conservative_caution"] = "conservative_caution"
    actions: list[
        Literal["stop_or_reduce", "capture_discomfort_flag", "seek_qualified_care"]
    ] = ["stop_or_reduce", "capture_discomfort_flag", "seek_qualified_care"]
    diagnosis_provided: Literal[False] = False
    pain_severity_inferred: Literal[False] = False
    clearance_provided: Literal[False] = False


class MissedWorkoutOutcome(StrictModel):
    route: Literal["missed_workout"] = "missed_workout"
    mutable: Literal[False] = False
    destination: Literal["missed_workout_choices"] = "missed_workout_choices"
    choices: list[Literal["mark_skipped", "reschedule", "rebalance"]] = [
        "mark_skipped",
        "reschedule",
        "rebalance",
    ]
    completion_inferred: Literal[False] = False
    persistence_available: Literal[False] = False


class ReflectionOutcome(StrictModel):
    route: Literal["reflection"] = "reflection"
    mutable: Literal[False] = False
    destination: Literal["post_workout_capture"] = "post_workout_capture"
    fields_to_capture: list[Literal["completion", "perceived_effort"]] = [
        "completion",
        "perceived_effort",
    ]
    completion_inferred: Literal[False] = False
    effort_inferred: Literal[False] = False
    persistence_available: Literal[False] = False


class ExplanationFacts(StrictModel):
    selected_action: Literal["proceed", "modify", "rest", "unknown"]
    readiness_state: Literal["ready", "caution", "unknown", "stale"]
    calendar_state: Literal["clear", "conflict", "stale", "missing"]
    confidence_bucket: Literal["low", "moderate", "high", "unknown"]
    has_staleness_warning: bool


class ExplanationOutcome(StrictModel):
    route: Literal["explanation"] = "explanation"
    mutable: Literal[False] = False
    destination: Literal["deterministic_explanation"] = "deterministic_explanation"
    template: Literal["today_decision_trace"] = "today_decision_trace"
    facts: ExplanationFacts
    generated_prose: Literal[False] = False


class ClarificationOutcome(StrictModel):
    route: Literal["clarification"] = "clarification"
    mutable: Literal[False] = False
    reason: Literal["ambiguous", "incomplete_draft"] = "ambiguous"
    choices: list[
        Literal[
            "schedule",
            "recovery",
            "pain_or_injury",
            "missed_workout",
            "post_workout",
            "explanation",
        ]
    ] = [
        "schedule",
        "recovery",
        "pain_or_injury",
        "missed_workout",
        "post_workout",
        "explanation",
    ]


class RefusalOutcome(StrictModel):
    route: Literal["refusal"] = "refusal"
    mutable: Literal[False] = False
    reason: Literal["unsupported", "unsafe"]
    safe_next_action: Literal[
        "use_supported_intake",
        "seek_qualified_care",
    ]


MobileOutcome = Annotated[
    ReviewDraftOutcome
    | PerceivedRecoveryOutcome
    | CautionOutcome
    | MissedWorkoutOutcome
    | ReflectionOutcome
    | ExplanationOutcome
    | ClarificationOutcome
    | RefusalOutcome,
    Field(discriminator="route"),
]


class MobileIntakeEnvelope(StrictModel):
    schema_version: Literal["mobile-intake.v1"] = "mobile-intake.v1"
    mutation_performed: Literal[False] = False
    parser: ParserMetadata
    outcome: MobileOutcome


_UNSAFE = re.compile(
    r"\b(diagnose|prescribe|medication|ignore (?:the )?pain|"
    r"clear me to (?:run|race)|guarantee (?:i am|i'm) safe)\b",
    re.IGNORECASE,
)
_PAIN = re.compile(
    r"\b(pain|injur(?:y|ed)|sharp ache|swelling|limping|stress fracture)\b",
    re.IGNORECASE,
)
_RECOVERY = re.compile(
    r"\b(slept badly|poor sleep|heavy legs|feel tired|fatigued|"
    r"run down|sore|low recovery)\b",
    re.IGNORECASE,
)
_MISSED = re.compile(
    r"\b(missed|skipped|could not do|couldn't do|did not do|didn't do)\b"
    r"[^.!?]{0,30}\b(workout|run|session|training)\b",
    re.IGNORECASE,
)
_REFLECTION = re.compile(
    r"\b(finished|completed|did)\b[^.!?]{0,35}\b(workout|run|session)\b"
    r"|\b(workout|run|session)\b[^.!?]{0,35}\b(felt|was)\b",
    re.IGNORECASE,
)
_EXPLANATION = re.compile(
    r"\b(why|explain|reason)\b[^.!?]{0,50}"
    r"\b(today|recommend|modify|rest|workout|decision)\b",
    re.IGNORECASE,
)
_AMBIGUOUS = re.compile(
    r"\b(things changed|something changed|not sure|maybe|sometime|"
    r"schedule is weird|plans changed)\b",
    re.IGNORECASE,
)
_TRAVEL = re.compile(r"\btravel(?:ing|ling)?\b", re.IGNORECASE)
_SCHEDULE = re.compile(
    r"\b(can't|cannot|can not|unavailable|no time)\b", re.IGNORECASE
)


def route_mobile_intake(payload: MobileIntakeRequest) -> MobileIntakeEnvelope:
    """Route a note without mutating or persisting any state."""

    text = payload.text
    if _UNSAFE.search(text):
        return _envelope(
            RefusalOutcome(
                reason="unsafe",
                safe_next_action="seek_qualified_care",
            )
        )
    if _PAIN.search(text):
        return _envelope(CautionOutcome())
    if _RECOVERY.search(text):
        return _envelope(PerceivedRecoveryOutcome())
    if _MISSED.search(text):
        return _envelope(MissedWorkoutOutcome())
    if _EXPLANATION.search(text):
        decision = payload.context.decision
        return _envelope(
            ExplanationOutcome(
                facts=ExplanationFacts(
                    selected_action=(
                        decision.selected_action if decision else "unknown"
                    ),
                    readiness_state=(
                        decision.readiness_state if decision else "unknown"
                    ),
                    calendar_state=(
                        decision.calendar_state if decision else "missing"
                    ),
                    confidence_bucket=(
                        decision.confidence_bucket if decision else "unknown"
                    ),
                    has_staleness_warning=(
                        decision.staleness_warning_count > 0
                        if decision
                        else False
                    ),
                )
            )
        )
    if _REFLECTION.search(text):
        return _envelope(ReflectionOutcome())

    today = payload.context.today
    deterministic = deterministic_parse(text, today)
    if _change_count(deterministic) > 0:
        legacy_request = IntakeParseRequest.model_validate(
            {
                "text": text,
                "context": {
                    "today": today.isoformat(),
                    "current_goal": (
                        payload.context.current_goal.model_dump(exclude_none=True)
                        if payload.context.current_goal
                        else None
                    ),
                    "current_profile": (
                        payload.context.current_profile.model_dump(
                            exclude_none=True
                        )
                        if payload.context.current_profile
                        else None
                    ),
                },
            }
        )
        parsed = parse_intake(legacy_request)
        draft = parsed.draft
        if draft.status != "ready" or _change_count(draft) == 0:
            return _envelope(
                ClarificationOutcome(reason="incomplete_draft"),
                parser=ParserMetadata(
                    source=_parser_source(parsed.source),
                    ai_attempted=parsed.mode == "local_ollama",
                    fallback_used=parsed.fallback_used,
                    failure=parsed.failure_code,
                ),
            )
        return _envelope(
            ReviewDraftOutcome(
                draft_kinds=_draft_kinds(text, draft),
                draft=draft,
            ),
            parser=ParserMetadata(
                source=_parser_source(parsed.source),
                ai_attempted=parsed.mode == "local_ollama",
                fallback_used=parsed.fallback_used,
                failure=parsed.failure_code,
            ),
        )

    if deterministic.status == "needs_clarification" or _AMBIGUOUS.search(text):
        return _envelope(ClarificationOutcome())
    return _envelope(
        RefusalOutcome(
            reason="unsupported",
            safe_next_action="use_supported_intake",
        )
    )


def _envelope(
    outcome: MobileOutcome,
    parser: ParserMetadata | None = None,
) -> MobileIntakeEnvelope:
    return MobileIntakeEnvelope(
        parser=parser
        or ParserMetadata(
            source="deterministic_router",
            ai_attempted=False,
            fallback_used=False,
            failure="none",
        ),
        outcome=outcome,
    )


def _draft_kinds(text: str, draft: IntakeDraft) -> list[DraftKind]:
    kinds: list[DraftKind] = []
    if draft.goal_changes:
        kinds.append("goal")
    if draft.schedule_changes:
        kinds.append("preferred_day")
    if draft.workout_swap_changes:
        kinds.append("workout_swap")
    if _TRAVEL.search(text) and draft.availability_changes:
        kinds.append("travel")
    if _SCHEDULE.search(text) and any(
        change.available_minutes == 0 for change in draft.availability_changes
    ):
        kinds.append("schedule")
    if draft.availability_changes and not _TRAVEL.search(text):
        kinds.append("availability")
    # The change detector guarantees at least one kind. Keep the response
    # canonical and stable for Codable/TypeScript consumers.
    return list(dict.fromkeys(kinds))


def _change_count(draft: IntakeDraft) -> int:
    return sum(
        len(items)
        for items in (
            draft.goal_changes,
            draft.schedule_changes,
            draft.availability_changes,
            draft.preference_changes,
            draft.workout_swap_changes,
        )
    )


def _parser_source(value: str) -> Literal["deterministic", "ollama"]:
    return "ollama" if value == "ollama" else "deterministic"
