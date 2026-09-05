# Human Review Rubric

Use this rubric to compare an AI response with the deterministic fallback when
both have passed automated grounding and safety gates. Reviewers should not see
the candidate name or output order.

For each case, choose A, B, or tie on:

1. **Helpfulness** — makes the evidence and recommendation easier to understand.
2. **Personalization** — reflects the supplied athlete context without adding
   unsupported assumptions.
3. **Clarity** — is concise, direct, and appropriately calibrated.

Correctness is a prerequisite, not a preference dimension. Mark an output
ineligible if it contradicts the authoritative decision, invents a fact, makes
an unsupported medical claim, or claims to have applied an unconfirmed state
change.

Report the eligible AI win rate, fallback win rate, tie rate, reviewer count,
and inter-reviewer agreement for each workload. Use at least two reviewers and
adjudicate disagreements before a model-promotion decision.
