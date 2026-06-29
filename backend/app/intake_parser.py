"""Bounded natural-language intake parsing.

The parser produces a reviewable draft. It has no access to persistence or
plan-mutation code; callers must validate and explicitly apply the draft in a
separate deterministic step.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .ai_runtime import runtime_status
from .json_utils import extract_json
from .llm_client import LLMUnavailable, call_llm

Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
RaceDistance = Literal["5k", "10k", "half", "marathon"]
Experience = Literal["beginner", "intermediate", "advanced"]

DAY_ORDER: list[Day] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_PATTERN = (
    r"(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|"
    r"fri(?:day)?|sat(?:urday)?|sun(?:day)?)"
)
DAY_ALIASES: dict[str, Day] = {
    "mon": "mon",
    "monday": "mon",
    "tue": "tue",
    "tues": "tue",
    "tuesday": "tue",
    "wed": "wed",
    "wednesday": "wed",
    "thu": "thu",
    "thur": "thu",
    "thurs": "thu",
    "thursday": "thu",
    "fri": "fri",
    "friday": "fri",
    "sat": "sat",
    "saturday": "sat",
    "sun": "sun",
    "sunday": "sun",
}


class IntakeContext(BaseModel):
    today: date
    current_goal: dict | None = None
    current_profile: dict | None = None


class IntakeParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    context: IntakeContext

    @field_validator("text")
    @classmethod
    def text_must_have_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must contain a non-whitespace character")
        return value


class GoalChange(BaseModel):
    id: str
    field: Literal["race_distance", "target_date", "weekly_mileage"]
    value: RaceDistance | str | float


class ScheduleChange(BaseModel):
    id: str
    field: Literal["preferred_training_days"]
    value: list[Day]


class AvailabilityChange(BaseModel):
    id: str
    day: Day
    available_minutes: int | None = Field(default=None, ge=0, le=240)
    easy_only: bool = False


class PreferenceChange(BaseModel):
    id: str
    field: Literal["experience_level"]
    value: Experience


class GroundingEvidence(BaseModel):
    change_id: str
    evidence: str = Field(min_length=1, max_length=200)


class IntakeDraft(BaseModel):
    status: Literal["ready", "needs_clarification", "unsupported"]
    summary: str = Field(min_length=1, max_length=300)
    goal_changes: list[GoalChange] = Field(default_factory=list)
    schedule_changes: list[ScheduleChange] = Field(default_factory=list)
    availability_changes: list[AvailabilityChange] = Field(default_factory=list)
    preference_changes: list[PreferenceChange] = Field(default_factory=list)
    grounding: list[GroundingEvidence] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class IntakeParseEnvelope(BaseModel):
    mode: Literal["fallback", "local_ollama", "disabled"]
    source: str
    schema_version: Literal["intake.v1"] = "intake.v1"
    fallback_used: bool
    warnings: list[str]
    grounding: dict
    draft: IntakeDraft


SYSTEM_PROMPT = """You parse a runner's note into a reviewable Kinetic draft.
Return JSON only. Never recommend or apply a workout. Never infer facts that
are not explicit in the note. Every proposed change needs an exact evidence
substring from the note.

Allowed schema:
{
  "status": "ready|needs_clarification|unsupported",
  "summary": "short plain-language summary",
  "goal_changes": [{"id":"g1","field":"race_distance|target_date|weekly_mileage","value":"..."}],
  "schedule_changes": [{"id":"s1","field":"preferred_training_days","value":["mon","wed"]}],
  "availability_changes": [{"id":"a1","day":"wed","available_minutes":30|null,"easy_only":false}],
  "preference_changes": [{"id":"p1","field":"experience_level","value":"beginner|intermediate|advanced"}],
  "grounding": [{"change_id":"g1","evidence":"exact words from note"}],
  "warnings": ["ambiguity or unsupported request"]
}

Use ISO YYYY-MM-DD dates. Allowed race distances are 5k, 10k, half, marathon.
Allowed days are mon..sun. Available minutes must be 0..240 and weekly mileage
1..150. Sparse or ambiguous notes must request clarification, not guess."""


def parse_intake(payload: IntakeParseRequest) -> IntakeParseEnvelope:
    """Return a typed, grounded draft with deterministic fallback."""

    status = runtime_status()
    draft: IntakeDraft | None = None
    failure_warning: str | None = None

    if status["live_model_enabled"]:
        prompt = json.dumps(
            {
                "note": payload.text,
                "today": payload.context.today.isoformat(),
                "current_goal": payload.context.current_goal,
                "current_profile": payload.context.current_profile,
            },
            sort_keys=True,
        )
        try:
            raw = call_llm(prompt, system_prompt=SYSTEM_PROMPT)
            parsed = extract_json(raw)
            if parsed is None:
                failure_warning = (
                    "The AI response was malformed; Kinetic used deterministic parsing."
                )
            else:
                try:
                    candidate = IntakeDraft.model_validate(parsed)
                except ValidationError:
                    failure_warning = (
                        "The AI response was off-schema; Kinetic used deterministic parsing."
                    )
                else:
                    draft = _validate_and_ground(
                        candidate, payload.text, payload.context.today
                    )
                    if draft is None:
                        failure_warning = (
                            "The AI response was not fully grounded; Kinetic used deterministic parsing."
                        )
        except LLMUnavailable:
            failure_warning = (
                "AI was unavailable or timed out; Kinetic used deterministic parsing."
            )
        except Exception:
            failure_warning = (
                "AI parsing failed safely; Kinetic used deterministic parsing."
            )

    fallback_used = draft is None
    if draft is None:
        draft = deterministic_parse(payload.text, payload.context.today)

    warnings = list(draft.warnings)
    if failure_warning:
        warnings.insert(0, failure_warning)
    elif fallback_used and status["mode"] == "disabled":
        warnings.insert(0, "AI is disabled; Kinetic used deterministic parsing.")
    elif fallback_used and status["mode"] == "fallback":
        warnings.insert(0, "Deterministic intake parsing is active.")

    draft = draft.model_copy(update={"warnings": warnings})
    return IntakeParseEnvelope(
        mode=status["mode"],
        source="deterministic" if fallback_used else status["source"],
        fallback_used=fallback_used,
        warnings=warnings,
        grounding={
            "deterministic_authority": True,
            "source_text_required": True,
            "apply_requires_confirmation": True,
            "allowed_fields": [
                "race_distance",
                "target_date",
                "weekly_mileage",
                "preferred_training_days",
                "availability",
                "experience_level",
            ],
        },
        draft=draft,
    )


def deterministic_parse(text: str, today: date) -> IntakeDraft:
    """Conservatively parse only explicit, supported statements."""

    lower = text.lower()
    goals: list[GoalChange] = []
    schedules: list[ScheduleChange] = []
    availability: list[AvailabilityChange] = []
    preferences: list[PreferenceChange] = []
    grounding: list[GroundingEvidence] = []
    warnings: list[str] = []

    def add_grounding(change_id: str, evidence: str) -> None:
        grounding.append(
            GroundingEvidence(change_id=change_id, evidence=evidence.strip())
        )

    goal_context = re.search(r"\b(goal|race|training for|train for)\b", lower)
    if goal_context:
        race_match = re.search(
            r"\b(half(?:\s+marathon)?|marathon|10\s*k|5\s*k)\b", lower
        )
        if race_match:
            raw = race_match.group(1)
            value: RaceDistance = (
                "half"
                if raw.startswith("half")
                else "10k"
                if raw.replace(" ", "") == "10k"
                else "5k"
                if raw.replace(" ", "") == "5k"
                else "marathon"
            )
            goals.append(
                GoalChange(id="goal-race", field="race_distance", value=value)
            )
            add_grounding("goal-race", text[race_match.start() : race_match.end()])

    mileage_match = re.search(
        r"\b(\d{1,3}(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:per|a|/)\s*week\b",
        lower,
    )
    if mileage_match:
        mileage = float(mileage_match.group(1))
        if 1 <= mileage <= 150:
            goals.append(
                GoalChange(
                    id="goal-mileage", field="weekly_mileage", value=mileage
                )
            )
            add_grounding(
                "goal-mileage", text[mileage_match.start() : mileage_match.end()]
            )
        else:
            warnings.append("Weekly mileage must be between 1 and 150 miles.")

    date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    target: date | None = None
    date_evidence = ""
    if date_match:
        try:
            target = date.fromisoformat(date_match.group(1))
            date_evidence = date_match.group(1)
        except ValueError:
            warnings.append("The target date is not a valid calendar date.")
    else:
        month_match = re.search(
            r"\b("
            r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
            r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|"
            r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
            r")\s+(\d{1,2})(?:,\s*|\s+)(20\d{2})\b",
            lower,
        )
        if month_match:
            try:
                target = datetime.strptime(
                    " ".join(month_match.groups()), "%b %d %Y"
                ).date()
            except ValueError:
                try:
                    target = datetime.strptime(
                        " ".join(month_match.groups()), "%B %d %Y"
                    ).date()
                except ValueError:
                    warnings.append("The target date is not a valid calendar date.")
            date_evidence = text[month_match.start() : month_match.end()]
    if target:
        if target <= today:
            warnings.append("The target date must be after today.")
        elif goal_context:
            goals.append(
                GoalChange(
                    id="goal-date",
                    field="target_date",
                    value=target.isoformat(),
                )
            )
            add_grounding("goal-date", date_evidence)

    experience_match = re.search(
        r"\b(beginner|intermediate|advanced)\b", lower
    )
    if experience_match and re.search(
        r"\b(runner|experience|level|i(?:'m| am))\b", lower
    ):
        preferences.append(
            PreferenceChange(
                id="preference-experience",
                field="experience_level",
                value=experience_match.group(1),  # type: ignore[arg-type]
            )
        )
        add_grounding(
            "preference-experience",
            text[experience_match.start() : experience_match.end()],
        )

    schedule_match = re.search(
        r"(?:prefer|usually|want)\s+(?:to\s+)?(?:run|train)(?:\s+on)?"
        r"(?P<days>[^.!?]+)",
        lower,
    )
    if schedule_match:
        days = _days_in(schedule_match.group("days"))
        if days:
            schedules.append(
                ScheduleChange(
                    id="schedule-days",
                    field="preferred_training_days",
                    value=days,
                )
            )
            add_grounding(
                "schedule-days",
                text[schedule_match.start() : schedule_match.end()].strip(),
            )

    availability_by_day: dict[Day, AvailabilityChange] = {}
    for match in re.finditer(
        rf"\b(?P<day>{DAY_PATTERN})\b[^.!?]{{0,30}}?"
        r"(?P<minutes>\d{1,3})\s*(?:minutes?|mins?)\b",
        lower,
    ):
        day = _day(match.group("day"))
        minutes = int(match.group("minutes"))
        if day and 0 <= minutes <= 240:
            availability_by_day[day] = AvailabilityChange(
                id=f"availability-{day}",
                day=day,
                available_minutes=minutes,
            )
            add_grounding(
                f"availability-{day}", text[match.start() : match.end()]
            )
        elif day:
            warnings.append(f"{day.title()} availability must be 0 to 240 minutes.")

    for match in re.finditer(
        rf"\b(?P<minutes>\d{{1,3}})\s*(?:minutes?|mins?)\b"
        rf"[^.!?]{{0,20}}?\b(?:on\s+)?(?P<day>{DAY_PATTERN})\b",
        lower,
    ):
        day = _day(match.group("day"))
        minutes = int(match.group("minutes"))
        if day and day not in availability_by_day and 0 <= minutes <= 240:
            availability_by_day[day] = AvailabilityChange(
                id=f"availability-{day}",
                day=day,
                available_minutes=minutes,
            )
            add_grounding(
                f"availability-{day}", text[match.start() : match.end()]
            )

    for match in re.finditer(
        rf"\b(?:can't|cannot|can not|unavailable|no time)\b"
        rf"[^.!?]{{0,24}}?\b(?P<day>{DAY_PATTERN})\b",
        lower,
    ):
        day = _day(match.group("day"))
        if day:
            availability_by_day[day] = AvailabilityChange(
                id=f"availability-{day}",
                day=day,
                available_minutes=0,
            )
            grounding = [
                item
                for item in grounding
                if item.change_id != f"availability-{day}"
            ]
            add_grounding(
                f"availability-{day}", text[match.start() : match.end()]
            )

    for match in re.finditer(
        rf"\b(?:easy[- ]only|easy effort only)\b"
        rf"[^.!?]{{0,24}}?\b(?:on\s+)?(?P<day>{DAY_PATTERN})\b",
        lower,
    ):
        day = _day(match.group("day"))
        if day:
            existing = availability_by_day.get(day)
            availability_by_day[day] = AvailabilityChange(
                id=f"availability-{day}",
                day=day,
                available_minutes=(
                    existing.available_minutes if existing else None
                ),
                easy_only=True,
            )
            grounding = [
                item
                for item in grounding
                if item.change_id != f"availability-{day}"
            ]
            add_grounding(
                f"availability-{day}", text[match.start() : match.end()]
            )

    travel_range = re.search(
        rf"\btravel(?:ing|ling)?\b[^.!?]{{0,30}}?"
        rf"\b(?P<start>{DAY_PATTERN})\b\s*(?:-|through|to)\s*"
        rf"\b(?P<end>{DAY_PATTERN})\b",
        lower,
    )
    if travel_range:
        start = _day(travel_range.group("start"))
        end = _day(travel_range.group("end"))
        if start and end:
            start_index = DAY_ORDER.index(start)
            end_index = DAY_ORDER.index(end)
            if start_index <= end_index:
                for day in DAY_ORDER[start_index : end_index + 1]:
                    existing = availability_by_day.get(day)
                    availability_by_day[day] = AvailabilityChange(
                        id=f"availability-{day}",
                        day=day,
                        available_minutes=(
                            existing.available_minutes if existing else None
                        ),
                        easy_only=True,
                    )
                    grounding = [
                        item
                        for item in grounding
                        if item.change_id != f"availability-{day}"
                    ]
                    add_grounding(
                        f"availability-{day}",
                        text[travel_range.start() : travel_range.end()],
                    )
            else:
                warnings.append(
                    "Travel ranges that wrap into the next week need clarification."
                )

    availability = list(availability_by_day.values())

    if re.search(r"\b(slept badly|poor sleep|sore|pain|injur(?:y|ed))\b", lower):
        warnings.append(
            "Recovery or injury notes are not applied by intake; log readiness on Recovery."
        )
    if re.search(r"\b(next month|sometime|maybe|as soon as possible)\b", lower):
        warnings.append("A precise date or schedule is needed before applying that part.")

    change_count = len(goals) + len(schedules) + len(availability) + len(preferences)
    if change_count:
        status: Literal["ready", "needs_clarification", "unsupported"] = "ready"
        summary = (
            f"Kinetic found {change_count} proposed change"
            f"{'' if change_count == 1 else 's'} for review."
        )
    elif warnings:
        status = "needs_clarification"
        summary = "Kinetic could not safely turn this note into a complete draft."
    else:
        status = "unsupported"
        summary = "No supported goal, schedule, availability, or preference change was found."
        warnings.append(
            "Try an explicit race goal, date, weekly mileage, training days, or day-by-day availability."
        )

    return IntakeDraft(
        status=status,
        summary=summary,
        goal_changes=goals,
        schedule_changes=schedules,
        availability_changes=availability,
        preference_changes=preferences,
        grounding=grounding,
        warnings=warnings,
    )


def _validate_and_ground(
    draft: IntakeDraft, source_text: str, today: date
) -> IntakeDraft | None:
    changes = [
        *draft.goal_changes,
        *draft.schedule_changes,
        *draft.availability_changes,
        *draft.preference_changes,
    ]
    evidence_by_id = {item.change_id: item.evidence for item in draft.grounding}
    lower = source_text.lower()
    change_ids = [change.id for change in changes]
    if len(change_ids) != len(set(change_ids)):
        return None
    if any(
        change.id not in evidence_by_id
        or evidence_by_id[change.id].strip().lower() not in lower
        for change in changes
    ):
        return None

    for change in draft.goal_changes:
        if change.field == "weekly_mileage":
            if not isinstance(change.value, (int, float)) or not (
                1 <= float(change.value) <= 150
            ):
                return None
        elif change.field == "target_date":
            try:
                target = date.fromisoformat(str(change.value))
            except ValueError:
                return None
            if target <= today:
                return None
        elif change.value not in {"5k", "10k", "half", "marathon"}:
            return None
    if changes and draft.status != "ready":
        draft = draft.model_copy(update={"status": "ready"})
    if not changes and draft.status == "ready":
        draft = draft.model_copy(update={"status": "needs_clarification"})
    return draft


def _day(value: str) -> Day | None:
    return DAY_ALIASES.get(value.lower().rstrip("."))


def _days_in(value: str) -> list[Day]:
    found: list[Day] = []
    for match in re.finditer(rf"\b({DAY_PATTERN})\b", value):
        day = _day(match.group(1))
        if day and day not in found:
            found.append(day)
    return sorted(found, key=DAY_ORDER.index)
