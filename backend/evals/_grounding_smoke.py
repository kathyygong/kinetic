"""Diagnose grounding failure on behavior.busy_day_skipped for qwen3:8b.

Runs the case once and prints both the deterministic-fallback reasoning
and the model's full raw output so we can compare the emitted
preference_type against the expected ``busy_day_preference``.
"""

from __future__ import annotations

import json
import os
import sys
import time

os.environ["KINETIC_DEMO_MODE"] = "false"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["OLLAMA_MODEL"] = "qwen3:8b"
os.environ["LLM_TIMEOUT_SECONDS"] = "1200"
os.environ["OLLAMA_STREAM_IDLE_SECONDS"] = "900"

from app import behavior_insights  # noqa: E402
from app.json_utils import safe_json_parse  # noqa: E402
from app.llm_client import LLMUnavailable, call_llm  # noqa: E402
from evals.eval_cases import BEHAVIOR_INSIGHT_CASES  # noqa: E402


def main() -> None:
    case = next(c for c in BEHAVIOR_INSIGHT_CASES if c.id == "behavior.busy_day_skipped")
    events = list(case.input.get("recommendation_events", []))
    sanitised = behavior_insights._sanitise_events(events)
    aggregates = behavior_insights._compute_aggregates(sanitised)
    user_prompt = behavior_insights._build_user_prompt(sanitised, aggregates)

    print(f"case: {case.id}")
    print(f"events: {len(sanitised)}, prompt_chars: {len(user_prompt)}")
    print(f"expected preference_types: {case.expected_preference_types}")
    print()
    print("--- aggregates ---")
    print(json.dumps(aggregates, indent=2, default=str)[:1500])
    print()
    print("--- user_prompt (first 1200 chars) ---")
    print(user_prompt[:1200])
    print()

    start = time.monotonic()
    try:
        raw = call_llm(user_prompt, system_prompt=behavior_insights.SYSTEM_PROMPT)
    except LLMUnavailable as exc:
        print(f"[err] {exc}", file=sys.stderr)
        return
    print(f"latency: {time.monotonic() - start:.1f}s")
    print()
    print("--- raw output ---")
    print(raw)
    print()

    parsed = safe_json_parse(raw)
    if not isinstance(parsed, dict):
        print("[err] unparseable JSON")
        return
    patterns = parsed.get("patterns") or []
    print("--- emitted preference_types ---")
    for p in patterns:
        print(
            f"  title={p.get('title')!r}  "
            f"preference_type={p.get('preference_type')!r}  "
            f"confidence={p.get('confidence')!r}"
        )


if __name__ == "__main__":
    main()
