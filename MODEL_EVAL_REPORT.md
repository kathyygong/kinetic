# Kinetic Model Quality Eval Report

Generated: 2026-09-05

## Scope

This report measures non-deterministic output quality on a versioned,
synthetic dataset. It is separate from `EVAL_REPORT.md`, which verifies
deterministic safety, contracts, and integration behavior.

Dataset: `model-quality-2026-09-04.v1`. Evaluator: `model-quality-graders.v1`. Prompt/contract digest: `ec437518f51a`. Live-model repeats: 2.

## Scorecard

| Workload | Candidate | Samples | Schema | Task quality | Grounded | Safe | Stable | p50 | p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| daily reasoning | `deterministic_fallback` | 4 | 100% | 100% | 100% | 100% | 100% | 0.00s | 0.00s |
| daily reasoning | `llama3.1:8b` | 8 | 100% | 100% | 100% | 100% | 100% | 10.89s | 17.92s |
| daily reasoning | `llama3.2:3b` | 8 | 75% | 75% | 75% | 75% | 100% | 4.86s | 6.40s |
| daily reasoning | `qwen3:8b` | 8 | 100% | 100% | 100% | 100% | 100% | 10.47s | 12.43s |
| intake | `deterministic_fallback` | 8 | 100% | 100% | 100% | 100% | 100% | 0.00s | 0.01s |
| intake | `llama3.1:8b` | 16 | 100% | 100% | 100% | 100% | 100% | 1.31s | 3.11s |
| intake | `llama3.2:3b` | 16 | 100% | 100% | 100% | 100% | 100% | 0.58s | 1.28s |
| intake | `qwen3:8b` | 16 | 100% | 100% | 100% | 100% | 100% | 1.60s | 3.39s |
| behavior insights | `deterministic_fallback` | 4 | 100% | 100% | 100% | 100% | 100% | 0.00s | 0.00s |
| behavior insights | `llama3.1:8b` | 8 | 100% | 75% | 75% | 100% | 100% | 7.39s | 11.87s |
| behavior insights | `llama3.2:3b` | 8 | 50% | 50% | 50% | 50% | 100% | 3.58s | 5.74s |
| behavior insights | `qwen3:8b` | 8 | 100% | 100% | 100% | 100% | 100% | 8.54s | 12.08s |
| training summary | `deterministic_fallback` | 3 | 100% | 100% | 100% | 100% | 100% | 0.00s | 0.00s |
| training summary | `llama3.1:8b` | 6 | 100% | 92% | 100% | 100% | 100% | 3.37s | 3.81s |
| training summary | `llama3.2:3b` | 6 | 100% | 67% | 100% | 100% | 100% | 1.38s | 1.72s |
| training summary | `qwen3:8b` | 6 | 100% | 100% | 100% | 100% | 100% | 6.26s | 6.91s |

Task quality is trace-factor coverage for daily reasoning, family-selection
F1 for behavior insights, field-level F1 for intake, and key-metric coverage
for training summaries. Grounding and safety are independently scored hard
gates. Stable means pass/fail and task scores were consistent across repeats.
The deterministic fallback is a continuity baseline, not a model.

## Observations

- **daily reasoning:** `qwen3:8b` had the strongest passing automated result (100% task quality, 12.43s p95).
- **intake:** `llama3.2:3b` had the strongest passing automated result (100% task quality, 1.28s p95).
- **behavior insights:** `qwen3:8b` had the strongest passing automated result (100% task quality, 12.08s p95).
- **training summary:** `qwen3:8b` had the strongest passing automated result (100% task quality, 6.91s p95).

## Error analysis

- `llama3.1:8b` / `behavior.sparse_history`: grounding, task quality 0% across 2 repeat(s).
- `llama3.1:8b` / `summary.monthly_sparse`: task quality 75% across 2 repeat(s).
- `llama3.2:3b` / `daily.low_confidence_borderline`: grounding, safety, schema, task quality 0% across 2 repeat(s).
- `llama3.2:3b` / `behavior.sparse_history`: grounding, safety, schema, task quality 0% across 2 repeat(s).
- `llama3.2:3b` / `behavior.busy_day_skipped`: grounding, safety, schema, task quality 0% across 2 repeat(s).
- `llama3.2:3b` / `summary.weekly_consistent`: task quality 50% across 2 repeat(s).
- `llama3.2:3b` / `summary.weekly_declining_recovery`: task quality 75% across 2 repeat(s).
- `llama3.2:3b` / `summary.monthly_sparse`: task quality 75% across 2 repeat(s).

## Interpretation and limits

- Promotion requires 100% schema validity, task quality, grounding, and
  safety on this set; latency then distinguishes passing candidates.
- The dataset is intentionally small and curated. Results support an engineering
  decision but are not a claim of general model capability.
- Automatic graders measure correctness and coverage. A blinded human rubric
  evaluates helpfulness and personalization separately; human ratings have not
  yet been collected for this run.
- Local latency is hardware-dependent and should be compared only within the same
  run.

## Reproduce

From `backend/` with Ollama running and candidate models installed:

```bash
python -m evals.run_model_quality_evals --repeats 2
```

The command updates this report and `MODEL_EVAL_RESULTS.json`. See
`backend/evals/HUMAN_REVIEW_RUBRIC.md` for the blinded comparison rubric.
