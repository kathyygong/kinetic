# Training-response discovery

Updated September 14, 2026. Local recruiter-demo implementation, using synthetic history.
This is bounded LLM-assisted exploration, not a trained physiological model,
an overtraining diagnosis, or an injury-prediction system.

## Demonstrated decision

The second Insights card investigates whether response to a prescribed plan is
changing across weeks. The sample supports increased effort above the prescribed
target alongside higher next-day fatigue. The runner can review an easier next
week, inspect the exact changes, keep the plan, or confirm the reviewed proposal.

The discovery endpoint is read-only. Only the frontend's explicit confirmation
changes the isolated sample plan. Real user storage, recovery weights and native
plan generation are not changed by this demonstration.

## Model role

`POST /behavior-insights/discover` receives a strict, bounded session history.
The model sees chronological records, a data dictionary and neutral descriptive
means/counts for the earlier two periods. It receives no candidate finding IDs,
titles or target conclusion.

The model may request up to three comparisons, choosing a workout group and an
increase/decrease direction for each of four allowed measures:

- Reported effort minus the prescribed effort target.
- Reported next-day fatigue, on the existing 1..5 scale.
- Completed sessions versus recovery-related misses; schedule and unknown misses
  are excluded from this measure.
- Actual pace divided by prescribed pace, derived from duration and distance.

Groups are all workouts, easy runs, quality sessions, or long runs. This is a
deliberately limited comparison language, not unrestricted discovery or arbitrary
code execution. Metric-keyed structured output prevents contradictory duplicate
queries. The model does not calculate authoritative statistics, write displayed
claims, prescribe a reduction or choose new recovery weights.

## Evidence verification

The six completed weeks before the current sample week are split into three
fixed two-week windows: reference, exploration and later corroboration. Later
records never enter the model prompt. Code executes each proposed comparison
against all three periods and discards comparisons that do not qualify.

- Each period needs at least six usable values for the selected measure/group.
- Workout categories must be present in each period. Mean prescribed duration,
  distance and target effort within each category must remain within 10% of the
  reference. Category counts may differ by no more than 25%.
- Effort and pace comparisons require completed sessions and an explicitly true
  comparable-conditions flag. Missing values remain missing.
- The recent difference and the later difference must both cross the same
  directional threshold relative to reference: 1.5 effort points, 1 fatigue
  point, 0.2 completion fraction or 0.05 pace ratio.
- Session IDs and local days are unique; future/assessed-day records, unknown
  fields and non-finite numbers are rejected. The API accepts at most 60 sessions.
- A recorded pain/discomfort skip routes to caution before any model call and
  cannot authorize this plan adjustment.

These sample sizes, comparison tolerances and difference thresholds are product
heuristics, not statistical significance tests or clinically validated cutoffs.
The data is observational, small and authored for the demo. Checking a later
period reduces one form of overfitting, but does not establish causation,
equivalence, physiological validity or injury prevention. Means can hide variation,
and changes in completed workload, illness and environment can still confound
the result. Repeated evaluation against the same synthetic history is software
acceptance, not a prospective runner study.

## Review authority

A verified association alone does not authorize a reduction. The current review
requires worsening next-day fatigue plus a separately verified worsening effort,
pace or recovery-related completion measure. Prescriptions must be comparable.
The last completed week must have known outcomes, known duration for completed
workouts, at least three planned sessions, no schedule/unknown misses, fewer than
80% completed sessions and at least two recorded low-recovery session days.

Only then is its computed completed-week evidence passed to the existing
`proposeWeeklyRecalibration` function. That rule owns the scale, duration floors
and eligible workouts. Each proposal uses only the first feasible priority in
this order, preserving speed workouts and long runs whenever easy-run changes
are available:

1. **Easy-run pace or mileage.** Shorten easy runs and, where a slower easy pace
   already exists in the week, ease faster easy targets toward that reference.
   Speed workouts and long runs remain exactly unchanged.
2. **Long-run pace.** If no easy-run adjustment is available, ease long-run pace
   toward the existing easy reference while retaining its full mileage. Speed
   workouts stay unchanged. A pace-only change can increase the duration estimate:
   the same distance takes longer at a slower pace.
3. **Speed-workout pace or mileage.** If the first two options are unavailable,
   ease tempo/interval pace or reduce mileage, keeping the original workout type.
   A slower speed target is capped halfway toward the easy reference, so it stays
   faster than that reference rather than silently becoming an easy run. Long runs
   stay unchanged. The week model has no interval-repetition structure, so the
   rule does not pretend to edit hard-work reps.
4. **Long-run mileage, last.** Only if the earlier options are unavailable and
   at least three low-recovery days are recorded, shorten long-run mileage at its
   existing pace. Low completion alone cannot trigger this last step.

Shortening uses a nominal 10% duration reduction, or 15% with fewer than 60% of
sessions completed or at least three low-recovery days. Pace relaxation is capped
at 3% or 5% more minutes per mile under those same criteria, and never goes beyond
the existing reference. Without an easy-run pace reference, pace changes are
unavailable; mileage changes remain possible. Missing, non-positive or non-finite
workout pace, duration or distance prevents a confirmable proposal.

Workout types, days and phase labels stay fixed. Entire race weeks, including any
week containing a race workout, are protected. Shortening floors are 20 minutes
for easy runs, 25 for tempo/interval sessions and 45 for long runs. The shortening
step cannot extend an already-shorter workout. Duration rounds to five minutes and
distance to half miles; mileage and prescribed speed never increase. Duration can
increase for a pace-only adjustment and is shown explicitly in the review.

The actual sample uses priority 1: 255 to 245 minutes and 27 to 26 miles:

| Workout | Before | After | Target pace |
| --- | --- | --- | --- |
| Monday easy | 45 min / 4.5 mi | 40 min / 4 mi | 9:46/mi, unchanged |
| Wednesday intervals | 45 min / 5.5 mi | Unchanged | 7:56/mi, unchanged |
| Friday easy | 45 min / 4.5 mi | 40 min / 4 mi | 9:46/mi, unchanged |
| Sunday long run | 120 min / 12.5 mi | Unchanged | 9:31/mi, unchanged |

The Insights review panel names the selected priority and shows the type, duration,
distance, pace and reason for each change. A feasible earlier step does not prove
that recovery will be adequate: these are ordered, bounded alternatives, not a
validated physiological-load optimization. Scales, floors, reference bounds and
the persistence cutoff are prototype product choices, not clinical prescriptions.
Rounding means actual cuts differ from nominal scales.

Confirmation rebuilds the proposal against the current response and current
target week and compares it with the displayed preview. Stale or altered previews
are rejected. The current week and all weeks after the target week are preserved.
Insights is the sole weekly-review entry point. The applied evidence signature
prevents repeated adjustments from the same evidence. Refreshing analysis and
applying the long-run preference do not erase that protection. Reset restores
the full isolated sample.

This bounded next-week adjustment is not an individualized treatment or a claim
that any remaining workout is appropriate for every recovery concern. Persistent
or concerning symptoms require separate assessment; the demo does not replace it.

## Model and failure behavior

The fixed recruiter demo now serves real precomputed model results from a
versioned exact-sample artifact, with no live model dependency during a visit.
Generation and verification use this same discovery pipeline. Source details
identify precomputed delivery, model and timestamp; changed inputs fail closed.
The following live behavior applies to general API requests and offline model
evaluation, not the fixed demo's Analyze/Refresh interaction.

`DISCOVERY_OLLAMA_MODEL=qwen3:8b` selects the local discovery model. Intake and
the long-run selector continue using their existing model settings. Both installed
8B models were tested: Qwen produced the supported result in about six seconds
once resident; Llama 3.1 8B took about fourteen seconds. Llama 3.2 3B produced empty
or contradictory/invalid comparisons in this test and was not selected.

Discovery uses a 384-token structured response and a 15-second request deadline.
Optional startup warmup has a separate 60-second budget and 20-minute residency;
failure is non-fatal. Cold or contended requests can still time out. They return
`unavailable` without a substitute finding or plan action. Flat, unsupported or
non-replicating comparisons return `no_finding`. A model proposing a comparison
does not make that comparison true.

Authenticated API requests now reuse exact-context validated model comparisons
in an owner-scoped, bounded one-hour process cache. Evidence and review eligibility
are recomputed on hits; history/model/verifier changes invalidate the entry. No
plan action is cached. Groq GPT-OSS support is available for evaluation, with a
separate completion budget for reasoning tokens. Initial live testing passed four
of five distinct cases but found an improving-history structured-output failure
and quota limits, so the cached demo's model selection is unchanged.
See [Insights caching](INSIGHTS_CACHING.md) for the benchmark, provenance, deletion
and single-worker deployment limits.

In the live sample, Qwen proposed effort, fatigue and a pace comparison. The
verifier retained effort/fatigue and discarded pace. Flat histories produced no
finding; reversed histories did not enable easing; trends contradicted by later
outcomes were rejected. Source and rejection metadata remain inspectable.

## Data and validation boundary

The demo uses one canonical 24-session, six-week history. The six long-run
outcomes are projected from that same history, avoiding contradictory records
between Insights cards. Target effort, actual duration/distance and next-day
fatigue are explicitly synthetic fields. No new production collection or trained
runner-specific prediction is claimed. The consented-outcome and model-learning
roadmap remains separate.

The endpoint uses the existing authentication dependency. Requests contain no
identity, raw wearable samples or free-text notes and do not persist a history.
The fixed demo reads only its synthetic artifact. API response parsing enforces bounded
fields, unique evidence IDs, valid counts, source/state boundaries and review
eligibility. Public deployment still needs its own isolation and usage controls.

## Checks

```bash
cd frontend
npm run discovery:check
npm run demo:check
cd ../backend
python -m evals.training_discovery_smoke
python -m evals.training_discovery_live
python -m evals.insights_cache_smoke
python -m evals.generate_demo_ai_cache --verify
```

Use a Python 3.12 environment with backend requirements. The live check requires
the configured local API and discovery model; it sends synthetic requests only
and never confirms plan changes. It checks repeated supported histories, flat
data, improving response and disagreement in later records. Offline tests also
cover authentication, disabled mode, missing fields, invalid queries, discomfort,
immutability and stale/tampered frontend confirmation.