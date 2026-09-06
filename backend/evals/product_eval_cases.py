"""Versioned AI product-eval scenarios.

These synthetic journeys evaluate the behavior of the complete AI-enabled
feature, not the isolated quality of a model response.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


DATASET_VERSION = "ai-product-2026-09-06.v1"

Journey = Literal[
    "daily_decision",
    "weekly_recalibration",
    "what_if",
    "intake",
    "behavior_insights",
    "training_summary",
]
AICondition = Literal[
    "valid",
    "contradictory",
    "ambiguous",
    "unsupported",
    "malformed",
    "ungrounded",
    "unavailable",
]


@dataclass(frozen=True)
class ProductEvalCase:
    id: str
    journey: Journey
    ai_condition: AICondition
    user_goal: str
    expected_product_outcome: str


PRODUCT_EVAL_CASES: tuple[ProductEvalCase, ...] = (
    ProductEvalCase(
        "product.daily.grounded_explanation",
        "daily_decision",
        "valid",
        "Understand why today's lower-load recommendation was selected.",
        "The selected action remains final and the grounded explanation is shown.",
    ),
    ProductEvalCase(
        "product.daily.contradiction",
        "daily_decision",
        "contradictory",
        "Receive a safe explanation when AI argues against the selected action.",
        "The contradiction is rejected and a usable explanation remains available.",
    ),
    ProductEvalCase(
        "product.daily.outage",
        "daily_decision",
        "unavailable",
        "Receive today's recommendation when AI is unavailable.",
        "The recommendation and explanation remain usable without a model.",
    ),
    ProductEvalCase(
        "product.weekly.grounded_explanation",
        "weekly_recalibration",
        "valid",
        "Understand an already-calculated weekly adjustment.",
        "AI explains the recalibration without altering its trace.",
    ),
    ProductEvalCase(
        "product.weekly.additional_change",
        "weekly_recalibration",
        "contradictory",
        "Avoid turning a weekly explanation into a new training recommendation.",
        "The additional change is rejected while the final recalibration remains intact.",
    ),
    ProductEvalCase(
        "product.what_if.malformed_ai",
        "what_if",
        "malformed",
        "Preview a schedule scenario without changing the saved plan.",
        "The preview remains read-only and usable despite malformed AI output.",
    ),
    ProductEvalCase(
        "product.intake.multi_field",
        "intake",
        "valid",
        "Describe several explicit training changes in one note.",
        "A complete grounded draft is returned for review before confirmation.",
    ),
    ProductEvalCase(
        "product.intake.ambiguous_status",
        "intake",
        "ambiguous",
        "Avoid unintended changes from an ambiguous note.",
        "The product asks for clarification and exposes no confirmable changes.",
    ),
    ProductEvalCase(
        "product.intake.pain_caution",
        "intake",
        "unsupported",
        "Avoid treating pain or recovery language as a plan-edit request.",
        "The mobile intake routes to bounded caution guidance with no mutation.",
    ),
    ProductEvalCase(
        "product.behavior.supported_pattern",
        "behavior_insights",
        "valid",
        "Review a repeated behavior pattern before it affects training.",
        "AI selects supported evidence and the product supplies a review-only action.",
    ),
    ProductEvalCase(
        "product.behavior.unsupported_selection",
        "behavior_insights",
        "unsupported",
        "Avoid an action based on a pattern the evidence does not support.",
        "The unsupported selection is rejected and the grounded result remains usable.",
    ),
    ProductEvalCase(
        "product.summary.grounded_review",
        "training_summary",
        "valid",
        "Understand recent training and recovery without editing the plan.",
        "A grounded AI review is shown alongside immutable calculated metrics.",
    ),
    ProductEvalCase(
        "product.summary.invented_metric",
        "training_summary",
        "ungrounded",
        "Receive an accurate review when AI invents a metric.",
        "The invented claim is rejected while calculated metrics remain unchanged.",
    ),
    ProductEvalCase(
        "product.summary.plan_change",
        "training_summary",
        "contradictory",
        "Keep a read-only review from becoming an unconfirmed plan change.",
        "The plan-change recommendation is rejected and safe review copy is shown.",
    ),
)


assert len({case.id for case in PRODUCT_EVAL_CASES}) == len(PRODUCT_EVAL_CASES)
