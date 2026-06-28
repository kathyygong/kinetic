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

## 2:30–3:20 — Show weekly adaptation

Open **Plan** and review the weekly recalibration: what was preserved, modified,
or dropped around schedule/travel constraints. The trace is read-only until the
runner explicitly accepts a deterministically validated change.

## 3:20–4:10 — Show recovery and learning

Open **Recovery** and enter a manual readiness signal. Then open **Profile** and
show a tentative behavior pattern. Confirm or dismiss it, noting that only
confirmed preferences become bounded scoring nudges.

## 4:10–5:00 — Prove the boundaries

Open [EVAL_REPORT.md](./EVAL_REPORT.md). Highlight no recommendation drift, no
medical claims, sparse-history warnings, schema validity, and no AI mutation.
Close with the architecture: deterministic safety core, optional bounded AI,
local fallback by default, and Firebase persistence as the next beta layer.
