"""Provider-agnostic LLM client for Kinetic.

This module is intentionally minimal: it knows how to send a prompt to
a configured backend and return a string. It contains **no**
Kinetic-specific reasoning, prompt templates, or domain logic — those
live in the caller. Swap providers by changing ``LLM_PROVIDER`` in the
environment.

Environment variables
---------------------
LLM_PROVIDER
    Which backend to call. Currently supported: ``"ollama"``.
OLLAMA_MODEL
    Model tag for the Ollama provider, e.g. ``"qwen3:8b"``.
OLLAMA_BASE_URL
    Base URL for the Ollama HTTP API. Defaults to
    ``http://localhost:11434``.
OLLAMA_NUM_PREDICT
    Maximum output tokens per call. Defaults to 320 — enough for the
    4-field daily-reasoning JSON schema with `think: false`. Bump
    higher for reasoning-first models (e.g. gpt-oss) whose internal
    reasoning phase eats tokens before any response is emitted.
OLLAMA_REASONING_EFFORT
    Optional. When set (e.g. ``"low"``, ``"medium"``, ``"high"``) it
    is forwarded as ``options.reasoning_effort`` to Ollama. Used by
    models like gpt-oss that have a built-in reasoning phase not
    gated by ``think: false``. Setting it to ``"low"`` keeps the
    reasoning phase short enough that the response phase fits inside
    ``OLLAMA_NUM_PREDICT``.
OLLAMA_TEMPERATURE
    Decoding temperature forwarded as ``options.temperature``.
    Defaults to ``0.0`` (greedy decoding) so identical prompts
    produce identical outputs across runs — required for the eval
    harness to be reproducible. Set to a positive value (e.g.
    ``"0.7"``) to restore sampling behaviour.
OLLAMA_STREAM_IDLE_SECONDS
    Per-chunk read timeout in seconds. If no streaming chunk arrives
    for this long, the underlying ``requests`` library raises
    ``ReadTimeout`` and the call fails fast. Defaults to 60. Bumps
    above ``LLM_TIMEOUT_SECONDS`` are clamped down. Increase for
    reasoning-first models whose internal reasoning phase can stay
    silent for >60s on large prompts (gpt-oss with a 10-event
    behavior prompt routinely takes ~120–180s before the response
    channel emits any tokens).
LLM_TIMEOUT_SECONDS
    Request timeout in seconds. Defaults to 480 — generous enough for
    an 8B-class local model on CPU (observed 240–350s total: ~120s
    prompt eval plus ~2 tok/s output). Lower in production when
    running against a hosted endpoint.
KINETIC_DEMO_MODE
    When set to a truthy value (``"true"``, ``"1"``, ``"yes"``) the
    client short-circuits and raises :class:`LLMUnavailable` without
    making a network call. Callers should catch that and fall back to
    their canned/template output. This is intended for offline demos
    and CI.

Public API
----------
``call_llm(..., timeout_override_seconds=None, model_override=None,
format_schema=None, keep_alive_override=None) -> str``
    Send a single non-streaming completion request and return the raw
    response text. Raises :class:`LLMUnavailable` on any controlled
    failure (provider not configured, network error, timeout, non-2xx
    response, malformed body). Callers should treat that exception as
    "fall back to the deterministic path".
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

import requests

_log = logging.getLogger(__name__)


# --- Defaults / constants ---------------------------------------------------

_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
# Default is intentionally large: an 8B local model on CPU is
# typically 240–350s per call in this workspace (~120s prompt eval
# plus ~2 tok/s for ~400–600 output tokens). Override with
# `LLM_TIMEOUT_SECONDS` for hosted endpoints where latency is much
# lower and you want fail-fast behaviour.
_DEFAULT_TIMEOUT_SECONDS = 480.0

_TRUTHY = {"1", "true", "yes", "on"}


# --- Exceptions -------------------------------------------------------------


class LLMUnavailable(RuntimeError):
    """Raised when the configured LLM cannot be reached or used.

    Wraps every failure mode the client recognises — bad config,
    network error, timeout, non-2xx HTTP, malformed response — so
    callers only need a single ``except`` clause to fall back.
    """


# --- Helpers ----------------------------------------------------------------


def _is_truthy(value: Optional[str]) -> bool:
    return value is not None and value.strip().lower() in _TRUTHY


def _demo_mode() -> bool:
    return _is_truthy(os.environ.get("KINETIC_DEMO_MODE"))


def _provider() -> str:
    return (os.environ.get("LLM_PROVIDER") or "").strip().lower()


# --- Provider: Ollama -------------------------------------------------------


def _timeout_seconds() -> float:
    """Return the configured per-call timeout, falling back to the default."""
    raw = os.environ.get("LLM_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return _DEFAULT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        return _DEFAULT_TIMEOUT_SECONDS
    return value if value > 0 else _DEFAULT_TIMEOUT_SECONDS


_DEFAULT_NUM_PREDICT = 320


def _num_predict() -> int:
    """Return the configured output-token cap. Falls back on bad input."""
    raw = os.environ.get("OLLAMA_NUM_PREDICT", "").strip()
    if not raw:
        return _DEFAULT_NUM_PREDICT
    try:
        value = int(raw)
    except ValueError:
        return _DEFAULT_NUM_PREDICT
    return value if value > 0 else _DEFAULT_NUM_PREDICT


def _reasoning_effort() -> Optional[str]:
    """Return ``OLLAMA_REASONING_EFFORT`` if set, else ``None``."""
    raw = os.environ.get("OLLAMA_REASONING_EFFORT", "").strip()
    return raw or None


# Default decoding temperature. ``0.0`` makes Ollama use greedy decoding
# (or as close to it as the backend allows), so identical prompts produce
# identical outputs across runs. Critical for the eval harness — without
# it, Ollama defaults to 0.8 and the same case can flip PASS/FAIL between
# runs, making model comparisons noisy. Override with ``OLLAMA_TEMPERATURE``
# at the env level if you want sampling behaviour.
_DEFAULT_TEMPERATURE = 0.0


def _temperature() -> float:
    """Return the configured decoding temperature. Defaults to greedy (0.0)."""
    raw = os.environ.get("OLLAMA_TEMPERATURE", "").strip()
    if not raw:
        return _DEFAULT_TEMPERATURE
    try:
        value = float(raw)
    except ValueError:
        return _DEFAULT_TEMPERATURE
    if value < 0:
        return _DEFAULT_TEMPERATURE
    return value


_DEFAULT_IDLE_TIMEOUT_SECONDS = 60.0


def _idle_timeout_seconds(overall_timeout: Optional[float] = None) -> float:
    """Return the per-chunk read-idle timeout in seconds.

    Bounded above by the overall ``LLM_TIMEOUT_SECONDS`` deadline so a
    misconfigured idle timeout can never extend past the caller's
    intended wall-clock budget.
    """
    raw = os.environ.get("OLLAMA_STREAM_IDLE_SECONDS", "").strip()
    overall = overall_timeout or _timeout_seconds()
    if not raw:
        return min(_DEFAULT_IDLE_TIMEOUT_SECONDS, overall)
    try:
        value = float(raw)
    except ValueError:
        return min(_DEFAULT_IDLE_TIMEOUT_SECONDS, overall)
    if value <= 0:
        return min(_DEFAULT_IDLE_TIMEOUT_SECONDS, overall)
    return min(value, overall)


def _call_ollama(
    prompt: str,
    system_prompt: Optional[str],
    timeout_override_seconds: Optional[float] = None,
    model_override: Optional[str] = None,
    format_schema: Optional[dict] = None,
    keep_alive_override: Optional[str | int] = None,
) -> str:
    """Stream from Ollama's ``/api/generate`` and accumulate the text.

    We use streaming (``stream=True``) instead of a single non-streaming
    POST for a critical operational reason: when our client-side
    ``requests`` timeout fires on a non-streaming request, the TCP
    connection drops but Ollama keeps generating tokens until it
    naturally hits EOS or ``num_predict``. The next request queues
    behind that orphaned generation, and on CPU-only inference that
    can mean *minutes* of head-of-line blocking.

    With streaming, our read loop holds the connection open. When we
    abort (e.g. on per-call deadline) Ollama notices the client
    disconnect and stops generating, freeing the runner for the next
    request.
    """
    model = (model_override or os.environ.get("OLLAMA_MODEL", "")).strip()
    if not model:
        raise LLMUnavailable("OLLAMA_MODEL is not set")

    base_url = (
        os.environ.get("OLLAMA_BASE_URL", "").strip()
        or _DEFAULT_OLLAMA_BASE_URL
    )
    url = f"{base_url.rstrip('/')}/api/generate"

    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        # Disable chain-of-thought emission for "thinking" models
        # (qwen3, deepseek-r1, etc.). Without this, qwen3:8b spends
        # its entire token budget under the `"thinking"` channel and
        # never reaches the `"response"` channel we accumulate — the
        # stream looks empty from our side and we fall back to the
        # deterministic path. Ollama ignores this key for non-thinking
        # models, so it is safe to leave unconditionally.
        "think": False,
        # Keep the model resident between calls so we don't pay the
        # cold-load cost on every request. Ollama interprets this as
        # a duration string ("10m" = 10 minutes).
        "keep_alive": keep_alive_override or "10m",
        # Cap output length so a runaway generation can't push us past
        # the request timeout. With thinking disabled, ~320 tokens is
        # plenty for the 4-field JSON schema given the conciseness
        # guidance in the system prompt (typical real output is
        # ~220–280 tokens). Lower caps directly cut wall-clock latency
        # on CPU inference at ~2 tok/s. Callers can override via
        # ``OLLAMA_NUM_PREDICT`` — useful for reasoning-first models
        # whose internal reasoning eats output tokens before any
        # response is emitted.
        "options": {
            "num_predict": _num_predict(),
            # Greedy by default (see ``_DEFAULT_TEMPERATURE``). Eliminates
            # decoding non-determinism so eval scores are reproducible
            # and changes to prompts/scoring are attributable.
            "temperature": _temperature(),
        },
    }
    # Reasoning-first models (gpt-oss, deepseek-r1) ignore ``think:
    # false`` but accept a separate ``reasoning_effort`` knob. We
    # forward it only when explicitly set, to avoid changing behaviour
    # for models that don't recognise the key.
    effort = _reasoning_effort()
    if effort:
        payload["options"]["reasoning_effort"] = effort
    if system_prompt:
        payload["system"] = system_prompt
    if format_schema:
        payload["format"] = format_schema

    timeout = (
        timeout_override_seconds
        if timeout_override_seconds is not None and timeout_override_seconds > 0
        else _timeout_seconds()
    )
    deadline = time.monotonic() + timeout
    # Idle timeout: if no chunk arrives for this many seconds, abort.
    # Critical for CPU inference — the previous behaviour set the
    # socket read timeout to the full ``timeout`` (e.g. 1200s), so a
    # model that stalled (e.g. an oversized prompt that the runtime
    # silently struggled with) would block our deadline check for the
    # entire timeout, then continue past it. With a short idle
    # timeout the underlying ``requests`` library raises
    # ``ReadTimeout`` and we fail fast. Tuned to 60s by default,
    # which is conservative even for 20B-class models on CPU at
    # ~2 tok/s (a single token is ~0.5s, a sentence ~5–10s).
    idle_timeout = _idle_timeout_seconds(timeout)
    chunks: list[str] = []
    # Capture a short prefix of the model's chain-of-thought so that
    # if the response channel ends up empty (think:false ignored, or
    # model misconfigured) the diagnostic includes enough context to
    # see what actually came back.
    thinking_preview: list[str] = []
    thinking_chars = 0

    try:
        # connect timeout: keep tight (10s).
        # read timeout: idle-timeout per chunk — raises ReadTimeout
        # if no bytes arrive for ``idle_timeout`` seconds. The
        # overall deadline is enforced manually inside the loop.
        with requests.post(
            url,
            json=payload,
            stream=True,
            timeout=(min(10.0, timeout), idle_timeout),
        ) as response:
            if not response.ok:
                # Drain a small slice of the body for diagnostics.
                body_head = response.text[:200] if response.text else ""
                raise LLMUnavailable(
                    f"Ollama returned HTTP {response.status_code}: {body_head}"
                )

            for line in response.iter_lines(decode_unicode=True):
                if time.monotonic() > deadline:
                    # Closing the response (via the `with` block) drops
                    # the TCP connection, which Ollama reads as a
                    # client disconnect and uses as the cancel signal.
                    raise LLMUnavailable(
                        f"Ollama streaming exceeded {timeout}s deadline"
                    )
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError:
                    # Skip malformed line; Ollama occasionally emits
                    # keep-alives or partial frames during heavy load.
                    continue
                piece = chunk.get("response")
                if isinstance(piece, str):
                    chunks.append(piece)
                if thinking_chars < 200:
                    think_piece = chunk.get("thinking")
                    if isinstance(think_piece, str) and think_piece:
                        thinking_preview.append(think_piece)
                        thinking_chars += len(think_piece)
                if chunk.get("done"):
                    break
    except requests.ReadTimeout as exc:
        # ReadTimeout fires when no bytes arrive on the socket for
        # ``idle_timeout`` seconds. Distinct from the overall
        # deadline check inside the loop — this catches a stalled
        # runtime, not a slow-but-progressing one.
        raise LLMUnavailable(
            f"Ollama stream went idle (no chunk for {idle_timeout}s)"
        ) from exc
    except requests.Timeout as exc:
        raise LLMUnavailable(f"Ollama request timed out after {timeout}s") from exc
    except requests.ConnectionError as exc:
        raise LLMUnavailable(f"Could not connect to Ollama at {base_url}") from exc
    except requests.RequestException as exc:  # noqa: BLE001
        raise LLMUnavailable(f"Ollama request failed: {exc}") from exc

    text = "".join(chunks)
    if not text:
        if thinking_preview:
            preview = "".join(thinking_preview)[:200]
            raise LLMUnavailable(
                "Ollama stream produced no response text; model emitted "
                f"only thinking tokens (preview: {preview!r}). "
                "Check that 'think: false' is honoured by the model."
            )
        raise LLMUnavailable("Ollama stream produced no response text")

    return text


# --- Public API -------------------------------------------------------------


def call_llm(
    prompt: str,
    system_prompt: Optional[str] = None,
    timeout_override_seconds: Optional[float] = None,
    model_override: Optional[str] = None,
    format_schema: Optional[dict] = None,
    keep_alive_override: Optional[str | int] = None,
) -> str:
    """Send ``prompt`` to the configured LLM and return its raw text.

    Parameters
    ----------
    prompt:
        The user-side prompt. Required.
    system_prompt:
        Optional system / instruction prompt. Passed through to providers
        that support a distinct system channel (Ollama's ``system``
        field).
    timeout_override_seconds:
        Optional per-call deadline. Lets latency-sensitive, fallback-safe
        surfaces fail before their client timeout without shortening slower
        offline reasoning/eval workflows globally.
    model_override:
        Optional provider model for a specialized workflow. Other callers keep
        using ``OLLAMA_MODEL``.
    format_schema:
        Optional JSON schema forwarded to Ollama's native structured-output
        ``format`` field.
    keep_alive_override:
        Optional Ollama residency duration. Latency-sensitive local workflows
        can remain loaded without changing other model calls.

    Returns
    -------
    str
        The model's raw response text. No post-processing is performed
        here — callers are responsible for stripping things like
        ``<think>`` blocks if their chosen model emits them.

    Raises
    ------
    LLMUnavailable
        When the provider isn't configured, demo mode is on, or any
        network / parsing failure occurs.
    """
    if not prompt or not prompt.strip():
        raise LLMUnavailable("Empty prompt")

    if _demo_mode():
        raise LLMUnavailable("KINETIC_DEMO_MODE is enabled; skipping LLM call")

    provider = _provider()
    if provider == "ollama":
        _log.debug("call_llm: provider=ollama")
        return _call_ollama(
            prompt,
            system_prompt,
            timeout_override_seconds=timeout_override_seconds,
            model_override=model_override,
            format_schema=format_schema,
            keep_alive_override=keep_alive_override,
        )

    if not provider:
        raise LLMUnavailable("LLM_PROVIDER is not set")

    raise LLMUnavailable(f"Unsupported LLM_PROVIDER: {provider!r}")
