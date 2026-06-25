"""Utilities for parsing JSON out of messy LLM output.

Open-weight models routinely wrap their JSON in markdown fences, prepend
a "Sure! Here's the JSON you asked for:" preamble, or trail off with
extra commentary. These helpers tolerate that without turning the
caller's code into a thicket of try/except.

Two entry points:

``safe_json_parse(text)``
    Strict-ish: trims whitespace and strips a single ``` / ```json fence
    pair, then attempts ``json.loads``. Use when you have reasonable
    confidence the model produced JSON and just want to forgive a fenced
    block.

``extract_json(text)``
    Permissive: first runs ``safe_json_parse``; if that fails, scans the
    text for the first balanced ``{...}`` block and tries to parse that.
    Use when the model has been asked for JSON inside a longer answer.

Both return ``None`` on failure. Neither raises.

Notes
-----
* Both functions only return ``dict``. Top-level JSON arrays / scalars
  are treated as parse failures because every Kinetic caller currently
  expects an object.
* No schema validation happens here — that's the caller's job (typically
  a Pydantic model).
"""

from __future__ import annotations

import json
import re
from typing import Optional


# Matches a fenced code block, optionally tagged ``json``. Group 1 is the
# inner content. ``re.DOTALL`` so the body can span newlines.
_FENCE_RE = re.compile(
    r"```(?:json)?\s*(.*?)\s*```",
    re.DOTALL | re.IGNORECASE,
)


def _strip_fences(text: str) -> str:
    """Return the inner body of the first ```...``` block, or ``text`` unchanged."""
    match = _FENCE_RE.search(text)
    if match:
        return match.group(1).strip()
    return text.strip()


def safe_json_parse(text: str) -> Optional[dict]:
    """Parse ``text`` as JSON, tolerating a wrapping code fence.

    Returns the parsed ``dict`` on success, ``None`` on any failure
    (empty input, parse error, non-object root).
    """
    if not text or not isinstance(text, str):
        return None

    candidate = _strip_fences(text)
    if not candidate:
        return None

    try:
        parsed = json.loads(candidate)
    except (ValueError, TypeError):
        return None

    return parsed if isinstance(parsed, dict) else None


def _first_balanced_object(text: str) -> Optional[str]:
    """Return the first balanced ``{...}`` substring, or ``None``.

    Walks the string once, tracking brace depth while honouring string
    literals and escapes so braces inside ``"..."`` don't confuse the
    counter. Good enough for typical LLM output; not a full JSON
    tokenizer.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]

        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def extract_json(text: str) -> Optional[dict]:
    """Best-effort JSON extraction from arbitrary model output.

    Tries (in order):
      1. ``safe_json_parse`` on the whole input (handles fenced or bare JSON).
      2. The first balanced ``{...}`` block found anywhere in the text.

    Returns the parsed ``dict`` or ``None``.
    """
    if not text or not isinstance(text, str):
        return None

    direct = safe_json_parse(text)
    if direct is not None:
        return direct

    block = _first_balanced_object(text)
    if block is None:
        return None

    try:
        parsed = json.loads(block)
    except (ValueError, TypeError):
        return None

    return parsed if isinstance(parsed, dict) else None
