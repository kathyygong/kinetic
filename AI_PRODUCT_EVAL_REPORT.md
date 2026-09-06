# Kinetic AI Product Eval Report

Generated: 2026-09-06

## Result

**PASS — 14 of 14 product journeys passed.**

These evals measure whether the complete AI-enabled experience produces
the intended user outcome. Scripted useful, adversarial, malformed, and
unavailable AI responses are replayed through production orchestration so
the suite is repeatable in CI.

Dataset: `ai-product-2026-09-06.v1`. Evaluator: `ai-product-graders.v1`.

## Product success dimensions

| Dimension | Passed | Rate |
| --- | ---: | ---: |
| task completion | 14/14 | 100% |
| correctness | 14/14 | 100% |
| decision integrity | 14/14 | 100% |
| user control | 14/14 | 100% |
| graceful failure | 8/8 | 100% |
| context minimization | 14/14 | 100% |

Task completion asks whether the runner reaches the intended outcome.
Correctness checks the resulting guidance or draft. Decision integrity
and user control verify that AI cannot unilaterally change authoritative
state. Graceful failure applies to adversarial or unavailable-AI cases.
Context minimization checks the actual prompt boundary.

## Journey coverage

| Journey | Cases | Result |
| --- | ---: | ---: |
| behavior insights | 2 | 2/2 passed |
| daily decision | 3 | 3/3 passed |
| intake | 3 | 3/3 passed |
| training summary | 3 | 3/3 passed |
| weekly recalibration | 2 | 2/2 passed |
| what if | 1 | 1/1 passed |

## Scenarios

- **PASS — `product.daily.grounded_explanation`:** Grounded AI reasoning was used.
- **PASS — `product.daily.contradiction`:** The product preserved the recommendation and returned fallback reasoning.
- **PASS — `product.daily.outage`:** The product preserved the recommendation and returned fallback reasoning.
- **PASS — `product.weekly.grounded_explanation`:** The accepted explanation described the final trace without changing it.
- **PASS — `product.weekly.additional_change`:** An AI-authored additional workout was rejected without changing the trace.
- **PASS — `product.what_if.malformed_ai`:** Malformed AI output fell back to a usable, read-only preview.
- **PASS — `product.intake.multi_field`:** The full grounded draft reached review with confirmation still required.
- **PASS — `product.intake.ambiguous_status`:** AI status disagreement was rejected and the product requested clarification.
- **PASS — `product.intake.pain_caution`:** Pain language opened bounded caution guidance without invoking AI or mutation.
- **PASS — `product.behavior.supported_pattern`:** Supported AI selection reached review.
- **PASS — `product.behavior.unsupported_selection`:** Unsupported AI selection fell back to the grounded product result.
- **PASS — `product.summary.grounded_review`:** Grounded AI narrative was accepted.
- **PASS — `product.summary.invented_metric`:** Unsafe or ungrounded narrative was replaced by a grounded review.
- **PASS — `product.summary.plan_change`:** Unsafe or ungrounded narrative was replaced by a grounded review.

## Interpretation and next evidence

This suite evaluates integrated product behavior, not whether one model is
generally capable. `MODEL_EVAL_REPORT.md` separately measures live model
outputs, and `EVAL_REPORT.md` inventories lower-level safety and contract
invariants.

Automated product checks do not establish perceived helpfulness, trust, or
interaction friction. The next evidence is moderated task testing using
`backend/evals/AI_PRODUCT_HUMAN_RUBRIC.md`, followed by privacy-safe
production task-completion and fallback-rate monitoring.

## Reproduce

From `backend/`:

```bash
python -m evals.run_product_evals --check
```
