# AI Product Human Review Rubric

Use representative runner tasks, not isolated response snippets. Reviewers
complete the journey from input through the resulting recommendation, draft,
review, or fallback state.

Score each task from 1–5 on:

1. **Task success** — the runner reaches the intended outcome without help.
2. **Understanding** — the result makes what happened and why clear.
3. **Appropriate trust** — confidence and limitations match the evidence.
4. **Control** — proposed changes are visible and require the expected action.
5. **Friction** — the AI adds enough value to justify latency and review effort.

Also record completion, time on task, fallback encountered, critical error, and
one short reason for the score. A critical error includes an incorrect training
outcome, invented evidence, unsafe guidance, hidden mutation, or inability to
recover.

Run at least five participants across the six product journeys. Report median
scores, completion rate, critical-error rate, and the most common failure mode;
do not average away a critical safety or control failure.
