"""One-shot smoke test for gpt-oss:20b with reasoning_effort=low tuning."""

from __future__ import annotations

import os
import time

os.environ["KINETIC_DEMO_MODE"] = "false"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["OLLAMA_MODEL"] = "gpt-oss:20b"
os.environ["OLLAMA_NUM_PREDICT"] = "1024"
os.environ["OLLAMA_REASONING_EFFORT"] = "low"
os.environ["LLM_TIMEOUT_SECONDS"] = "900"

from app.llm_client import LLMUnavailable, call_llm  # noqa: E402

prompt = 'Return JSON only, no markdown, no commentary. Return exactly: {"ok": true}'
system_prompt = "You return JSON only."

start = time.monotonic()
try:
    raw = call_llm(prompt, system_prompt=system_prompt)
except LLMUnavailable as exc:
    print(f"lat={time.monotonic() - start:.1f}s")
    print(f"ERROR: {exc}")
else:
    print(f"lat={time.monotonic() - start:.1f}s")
    print(f"len: {len(raw)}")
    print(f"head: {raw[:300]!r}")
