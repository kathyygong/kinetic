"""AI product, model-quality, and deterministic safety evals for Kinetic.

The :mod:`backend.evals.eval_cases` module is a pure-data manifest of
test cases for the daily reasoning and behavior insight layers. It
declares the inputs to send, the deterministic engine outcomes we
expect, and a set of *safety expectations* — machine-readable invariants
the AI-authored output must satisfy.

The case manifests remain pure data. Product and model harnesses import the
production feature modules to exercise the relevant integrated or live-model
boundary, while the deterministic gate registry remains provider-independent.
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
