# Kinetic Five-Minute Demo

## 0:00–0:45 — Set the runner context

Open Kinetic, load or seed the demo runner, and show the race goal, preferred
training days, and current plan. Explain that the plan is generated
deterministically and works without AI.

## 0:45–1:45 — Show today's recommendation

Open **Today**. Point out the recommended workout, readiness score, available
training window, confidence, and primary action. The workout is already final
before explanatory AI runs.

## 1:45–2:30 — Explain the decision

Open the reasoning section. Show the AI runtime badge and the grounded factors
for recovery, calendar load, and training progression. Emphasize that malformed
or unavailable AI falls back to deterministic prose and cannot change the
workout.

## 2:30–3:35 — Show intake, training review, and What-if

Open **Plan** and review the weekly recalibration: what was preserved, modified,
or dropped around schedule/travel constraints. In **Tell Kinetic what changed**,
enter an explicit schedule note and show the source-grounded draft. Point out
that the saved plan is unchanged until **Confirm changes**, which routes the
draft through deterministic validation. Use the What-if panel to preview a day,
duration, or easy-only change without mutating the saved plan. Toggle the
read-only training review from 7 to 30 days and point out that its metrics are
deterministic, raw notes are excluded, and its narrative cannot alter the plan.

## 3:35–4:15 — Show recovery and learning

Open **Recovery** and enter a manual readiness signal. Then open **Profile** and
show a tentative behavior pattern. Confirm or dismiss it, noting that only
confirmed preferences become bounded scoring nudges.

## 4:15–5:00 — Prove the boundaries

Open [EVAL_REPORT.md](./EVAL_REPORT.md). Highlight no recommendation drift, no
medical claims, sparse-history warnings, schema validity, intake grounding,
training-summary privacy, malformed/timeout fallback, no AI mutation, and the
privacy-conscious product event boundary.
Close with the architecture:
deterministic safety core, optional bounded AI, local fallback by default, and
an authenticated Firebase mirror that remains non-blocking when remote
persistence is unavailable. For beta-readiness, call out that Cloud Firestore
is enabled, rules are deployed, and live QA verifies hydration/account
isolation plus deletion tombstones after reload and second-origin sign-in.

If the reviewer asks about beta operations, point to `BETA_RUNBOOK.md` and
`QA_MATRIX.md`: the product is demo-shippable with the Firebase persistence
gate closed and npm advisory audit passing, while dependency pin/range review
remains the next beta-hardening gate.
