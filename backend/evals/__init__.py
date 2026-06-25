"""Eval cases and harness scaffolding for Kinetic AI outputs.

The :mod:`backend.evals.eval_cases` module is a pure-data manifest of
test cases for the daily reasoning and behavior insight layers. It
declares the inputs to send, the deterministic engine outcomes we
expect, and a set of *safety expectations* — machine-readable invariants
the AI-authored output must satisfy.

This package intentionally has no runtime dependencies on the FastAPI
app or any LLM client. Harnesses import from here, drive the system
under test, and assert against the declared expectations.
"""

from .eval_cases import (
    EVAL_CASES,
    BEHAVIOR_INSIGHT_CASES,
    DAILY_REASONING_CASES,
    EvalCase,
    EvalKind,
    SafetyExpectation,
)

__all__ = [
    "EVAL_CASES",
    "BEHAVIOR_INSIGHT_CASES",
    "DAILY_REASONING_CASES",
    "EvalCase",
    "EvalKind",
    "SafetyExpectation",
]
