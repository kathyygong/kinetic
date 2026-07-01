"""Runtime-mode helpers for Kinetic's bounded AI layer."""

from __future__ import annotations

import os
from typing import Literal, TypedDict

AIRuntimeMode = Literal["fallback", "local_ollama", "disabled"]

_TRUTHY = {"1", "true", "yes", "on"}
_VALID_MODES: set[str] = {"fallback", "local_ollama", "disabled"}


class AIRuntimeStatus(TypedDict):
    mode: AIRuntimeMode
    source: str
    configured: bool
    live_model_enabled: bool
    fallback_used: bool
    provider: str | None
    model: str | None
    intake_model: str | None
    timeout_seconds: float
    message: str


def is_truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in _TRUTHY


def runtime_mode() -> AIRuntimeMode:
    """Resolve the current AI runtime mode.

    ``KINETIC_AI_MODE`` is authoritative when set. The legacy
    ``KINETIC_DEMO_MODE=true`` flag maps to fallback so existing demo
    scripts keep their no-network behavior. If neither is set but the
    old Ollama variables are present, we preserve that local-dev path.
    Otherwise the deployed-safe default is deterministic fallback.
    """
    explicit = (os.environ.get("KINETIC_AI_MODE") or "").strip().lower()
    if explicit in _VALID_MODES:
        return explicit  # type: ignore[return-value]

    if is_truthy(os.environ.get("KINETIC_DEMO_MODE")):
        return "fallback"

    provider = (os.environ.get("LLM_PROVIDER") or "").strip().lower()
    model = (os.environ.get("OLLAMA_MODEL") or "").strip()
    if provider == "ollama" and model:
        return "local_ollama"

    return "fallback"


def timeout_seconds(default: float = 20.0) -> float:
    raw = os.environ.get("LLM_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def provider_name() -> str:
    provider = (os.environ.get("LLM_PROVIDER") or "").strip().lower()
    if provider:
        return provider
    if runtime_mode() == "local_ollama":
        return "ollama"
    return ""


def runtime_status() -> AIRuntimeStatus:
    mode = runtime_mode()
    provider = provider_name() or None
    model = (os.environ.get("OLLAMA_MODEL") or "").strip() or None
    intake_model = (os.environ.get("INTAKE_OLLAMA_MODEL") or "").strip() or None
    configured = mode == "local_ollama" and provider == "ollama" and bool(model)

    if mode == "disabled":
        message = "AI is disabled; Kinetic will use deterministic explanations."
    elif mode == "local_ollama":
        message = (
            "Local Ollama mode is configured."
            if configured
            else "Local Ollama mode needs OLLAMA_MODEL before live AI can run."
        )
    else:
        message = "Deterministic fallback mode is active; no live AI call will be made."

    return {
        "mode": mode,
        "source": "ollama" if mode == "local_ollama" else "deterministic",
        "configured": configured if mode == "local_ollama" else True,
        "live_model_enabled": mode == "local_ollama" and configured,
        "fallback_used": mode != "local_ollama" or not configured,
        "provider": provider,
        "model": model if mode == "local_ollama" else None,
        "intake_model": intake_model if mode == "local_ollama" else None,
        "timeout_seconds": timeout_seconds(),
        "message": message,
    }
