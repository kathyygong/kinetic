"""Offline checks for the model-quality datasets, graders, and baseline."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from evals.model_quality_cases import DATASET_VERSION
from evals.run_model_quality_evals import (
    EVALUATOR_VERSION,
    WORKLOAD_ORDER,
    aggregate,
    build_baseline_results,
    prompt_digest,
    render_report,
)


ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    results = build_baseline_results()
    counts = Counter(item["workload"] for item in results)
    assert set(counts) == set(WORKLOAD_ORDER), counts
    assert len(results) == 19, len(results)
    assert all(item["schema_valid"] for item in results)
    assert all(item["grounded"] for item in results)
    assert all(item["safe"] for item in results)
    assert all(item["task_score"] == 1.0 for item in results)

    rows = aggregate(results)
    assert len(rows) == len(WORKLOAD_ORDER), rows
    assert all(row["candidate"] == "deterministic_fallback" for row in rows)
    assert DATASET_VERSION.startswith("model-quality-")

    payload = json.loads((ROOT / "MODEL_EVAL_RESULTS.json").read_text())
    assert payload["schema_version"] == "kinetic-model-eval.v1"
    assert payload["dataset_version"] == DATASET_VERSION
    assert payload["evaluator_version"] == EVALUATOR_VERSION
    assert payload["prompt_digest"] == prompt_digest()
    assert sum(payload["case_counts"].values()) == len(results)
    assert payload["results"]
    assert (ROOT / "MODEL_EVAL_REPORT.md").read_text() == render_report(payload)
    print(
        f"OK model-quality graders dataset={DATASET_VERSION} "
        f"cases={len(results)} workloads={len(rows)}"
    )


if __name__ == "__main__":
    main()
