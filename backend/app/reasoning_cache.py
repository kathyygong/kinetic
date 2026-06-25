"""Bounded LRU cache for AI reasoning outputs.

The reasoning layer is the slow part of `/decision` (200-300s per call
on a CPU-only 8B model). But semantically, two decisions with the same
state, recovery band, selected workout, and key factors should yield
essentially the same explanation. Caching by those stable fields turns
repeat calls into ~1ms operations.

The cache lives in-process (one dict per uvicorn worker) — that's
fine for our scale, avoids a Redis dependency, and means restarts
clear stale entries automatically.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from typing import Any, Dict, Optional

# 128 entries is more than enough: the cache key is coarse-grained, so
# even a few weeks of distinct decisions per athlete fit comfortably.
_MAX_ENTRIES = 128

_cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
_lock = threading.Lock()


def _round_recovery(value: Any) -> str:
    """Bucket recovery score to 0.05 so micro-variations share cache.

    A change from 0.612 to 0.617 doesn't meaningfully alter the
    explanation; rounding ensures both hit the same cache entry.
    """
    try:
        return f"{round(float(value) * 20) / 20:.2f}"
    except (TypeError, ValueError):
        return "?"


def reasoning_cache_key(decision: Dict[str, Any]) -> str:
    """Build a stable cache key from the canonical decision fields.

    Two decisions yielding the same explanation should hash to the
    same key. We deliberately ignore:
      * `decision_trace` (verbose log of internal scoring steps)
      * `alternatives` (the explanation only describes the chosen action)
      * `scores` (already implied by the chosen action)
      * `available_minutes` (doesn't change the *why* of the choice)
      * `confidence` (small numeric jitter doesn't change wording)
    and round `recovery_score` to a 0.05 bucket.
    """
    selected = decision.get("selected_action") or {}
    payload = {
        "state": decision.get("state"),
        "recovery_bucket": _round_recovery(decision.get("recovery_score")),
        "action": selected.get("name") if isinstance(selected, dict) else None,
        "final_workout": decision.get("final_workout"),
        # Sort key_factors so order shuffles don't break the cache; cap
        # to a generous max so a runaway list can't blow out the hash.
        "key_factors": sorted([str(f) for f in (decision.get("key_factors") or [])])[:10],
        "staleness": sorted([str(w) for w in (decision.get("staleness_warnings") or [])])[:6],
    }
    serialised = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def get(key: str) -> Optional[Dict[str, Any]]:
    """Return the cached reasoning dict for ``key`` or ``None``."""
    with _lock:
        if key in _cache:
            # Move to end → most-recently-used.
            _cache.move_to_end(key)
            return _cache[key]
    return None


def put(key: str, value: Dict[str, Any]) -> None:
    """Insert ``value`` under ``key``, evicting the LRU entry on overflow."""
    with _lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > _MAX_ENTRIES:
            _cache.popitem(last=False)


def clear() -> None:
    """Drop every cached entry. Intended for tests."""
    with _lock:
        _cache.clear()


def size() -> int:
    """Return the current number of cached entries."""
    with _lock:
        return len(_cache)
