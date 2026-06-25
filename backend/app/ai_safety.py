"""Safety checks shared by Kinetic AI explanation layers."""

from __future__ import annotations

import re
from typing import Any

_MEDICAL_CLAIM_RE = re.compile(
    r"\b("
    r"diagnos(?:e|is|tic)|"
    r"tendonitis|stress fracture|fracture|"
    r"injur(?:y|ed)|illness|disease|"
    r"medical advice|doctor|clinician|symptom"
    r")\b",
    re.IGNORECASE,
)

_DRIFT_PHRASES: dict[str, tuple[str, ...]] = {
    "proceed": (
        "rest day",
        "take today off",
        "skip today",
        "workout was adjusted",
        "has been adjusted",
    ),
    "modify": (
        "stay as scheduled",
        "stays as scheduled",
        "as planned without changes",
        "rest day",
        "take today off",
    ),
    "rest": (
        "proceed with",
        "stay as scheduled",
        "stays as scheduled",
        "green light",
        "push through",
    ),
}


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(flatten_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(v) for v in value)
    return ""


def contains_medical_claim(value: Any) -> bool:
    return _MEDICAL_CLAIM_RE.search(flatten_text(value)) is not None


def contradicts_selected_action(value: Any, action_name: str | None) -> bool:
    if not action_name:
        return False
    phrases = _DRIFT_PHRASES.get(action_name.lower(), ())
    if not phrases:
        return False
    text = flatten_text(value).lower()
    return any(phrase in text for phrase in phrases)
