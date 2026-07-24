"""Additional round-trip sanity checks for backend/evals/eval_cases.py.

Drives every case through the live FastAPI app (TestClient, deterministic
fallback) and asserts the deterministic engine outcomes pinned in each
EvalCase. The canonical safety gates run separately through ``evals._gates``;
this module deliberately does not invoke them again.
"""

from __future__ import annotations

import os

os.environ.setdefault("KINETIC_DEMO_MODE", "true")
os.environ["KINETIC_AI_MODE"] = "fallback"
os.environ.setdefault("KINETIC_AUTH_REQUIRED", "false")

from fastapi.testclient import TestClient

from app.api import app
from app import decision_engine as decision_engine_module
from evals.eval_cases import BEHAVIOR_INSIGHT_CASES, DAILY_REASONING_CASES

# Match the hermetic Calendar boundary used by the canonical gate registry.
decision_engine_module.get_available_minutes = lambda: 90


def main() -> None:
    client = TestClient(app)

    print("--- Daily reasoning round-trip ---")
    for case in DAILY_REASONING_CASES:
        r = client.post("/decision", json=dict(case.input))
        assert r.status_code == 200, (case.id, r.status_code, r.text)
        envelope = r.json()
        d = envelope["decision"]
        sa = d["selected_action"]["name"]
        warns = len(d["staleness_warnings"])
        print(
            f"  {case.id:<48} state={d['state']:<10} action={sa:<8} "
            f"conf={d['confidence']:.2f} warns={warns}"
        )

        if case.expected_state is not None:
            assert d["state"] == case.expected_state, (
                case.id,
                d["state"],
                case.expected_state,
            )
        if case.expected_selected_actions:
            assert sa in case.expected_selected_actions, (
                case.id,
                sa,
                case.expected_selected_actions,
            )
        if case.min_confidence is not None:
            assert d["confidence"] >= case.min_confidence - 0.01, (
                case.id,
                d["confidence"],
                case.min_confidence,
            )
        if case.max_confidence is not None:
            assert d["confidence"] <= case.max_confidence + 0.01, (
                case.id,
                d["confidence"],
                case.max_confidence,
            )
        if "warns_about_stale_data" in case.safety_expectations:
            assert warns > 0, (case.id, "expected staleness warning, got none")

        # Key-factor substring match (case-insensitive)
        joined = " | ".join(d["key_factors"]).lower()
        for needle in case.expected_key_factors:
            assert needle.lower() in joined, (case.id, needle, d["key_factors"])

        # Reasoning round-trip
        rr = client.post("/decision/reasoning", json={"decision": d})
        assert rr.status_code == 200, (case.id, rr.status_code, rr.text)
        body = rr.json()["ai_reasoning"]
        for key in ("summary", "factors", "tradeoff", "confidence_note"):
            assert key in body, (case.id, key, body)

    print()
    print("--- Behavior insight round-trip ---")
    for case in BEHAVIOR_INSIGHT_CASES:
        r = client.post("/behavior-insights", json=dict(case.input))
        assert r.status_code == 200, (case.id, r.status_code, r.text)
        b = r.json()
        pts = [p["preference_type"] for p in b.get("patterns", [])]
        confs = [p["confidence"] for p in b.get("patterns", [])]
        print(
            f"  {case.id:<48} patterns={len(b['patterns']):>2} "
            f"warns={len(b['warnings']):>2} types={pts} confs={confs}"
        )
        if case.expect_warnings:
            assert b["warnings"], (case.id, "expected non-empty warnings")
        if case.expected_preference_types:
            for needle in case.expected_preference_types:
                assert needle in pts, (case.id, needle, pts)

    print()
    print("OK all additional round-trip smoke cases passed")


if __name__ == "__main__":
    main()
