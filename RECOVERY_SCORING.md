# Recovery scoring

September 11, 2026. An evidence-informed training indicator, not a clinically
validated measure, a probability of injury, or a percentage of physiological
recovery. The score and workout limits remain deterministic. No LLM chooses
weights, diagnoses a cause, or overrides training safeguards.

## Evidence and limits

- Quer et al. (2020), [92,457-adult longitudinal RHR study](https://doi.org/10.1371/journal.pone.0227709):
  personal RHR ranges vary substantially. The investigators identified unusual
  elevations exceeding two standard deviations above the previous 20 readings,
  persisting across three consecutive readings in five days. This was an
  observational anomaly definition, not a validated fatigue threshold or a
  prescription to restrict training.
- Buchheit (2014), [athlete heart-rate monitoring review](https://doi.org/10.3389/fphys.2014.00073):
  interpret changes against within-athlete variability, measurement error,
  training context and repeated observations. RHR and HRV overlap in the
  information they convey and should not be treated as independent diagnoses.
- Bellenger et al. (2016), [systematic review and meta-analysis](https://doi.org/10.1007/s40279-016-0484-2):
  autonomic changes are not unambiguous indicators of positive versus negative
  training adaptation. Higher HRV does not by itself clear a runner for hard work.
- Walsh et al., [2021 athlete sleep consensus](https://doi.org/10.1136/bjsports-2020-102025):
  sleep needs should be individualized. A habitual average is not necessarily an
  adequate target, and evidence does not establish a universal points-per-hour
  recovery formula.
- Saw et al. (2016), [systematic review of athlete monitoring](https://doi.org/10.1136/bjsports-2015-094758):
  subjective well-being remains useful alongside objective signals. Existing
  fatigue and soreness inputs are retained rather than displaced by wearables.

Kinetic imports HealthKit SDNN, while much training-guidance research uses
RMSSD. The new cardiac components compare each recorded metric with its own
history; they do not import RMSSD-specific absolute thresholds. This does not
validate the SDNN score curve. Recording conditions, device/source changes,
illness, medication, heat, alcohol and menstrual-cycle variation may affect
interpretation. A deviation identifies an unusual reading, not its cause.

## Personal reference window

- Compute means and sample standard deviations from the prior 30 local calendar
  days, excluding the assessed day and all future entries. Sparse or non-finite
  values are not replaced with invented history.
- Each cardiac component needs at least 20 valid prior readings and a finite
  standard deviation. The 30-day window and minimum count are prototype choices
  informed by longitudinal monitoring, not validated eligibility cutoffs.
- Use a minimum standard deviation of 1 ms for HRV or 1 bpm for RHR to prevent
  zero or near-zero variance from amplifying tiny changes. These are numerical
  guardrails, not claims about a device's measurement accuracy.
- For persistence, test the two most recent prior RHR readings against each
  reading's own previous 20 values. Both must exceed mean + 2 SD and fall within
  the preceding four calendar days; no intervening normal reading is skipped.
  Together with a current elevation exceeding 2 SD, this activates the stronger
  RHR curve. This is a bounded adaptation of Quer's anomaly definition, not a
  clinical classifier. Missing days cannot fabricate a streak.
- Requests carry bounded summary statistics, not raw health samples or complete
  readiness histories. `insufficient_history` distinguishes uncalibrated clients.

## Deterministic calculation

With all three objective metrics available, their relative weights are:

| Component | Weight | Formula |
| --- | ---: | --- |
| HRV | 0.40 | Deficit relative to its personal mean, in personal SD units |
| RHR | 0.20 | Elevation relative to its personal mean, in personal SD units |
| Sleep | 0.40 | Hours slept / sleep target, bounded to 0..1 |
| Fatigue, when reported | 0.20 | (5 - level) / 4, bounded to 0..1 |
| Soreness, when reported | 0.10 | (5 - level) / 4, bounded to 0..1 |

Normalize by the sum of weights for available components. With self-reports
present, 40/20/40 describes the objective sub-blend, not percentages of the
entire score. RHR and HRV share the previous 0.60 cardiac allocation; RHR is not
an extra independent penalty added after scoring.

Let `deviation = (mean - today) / max(1, SD)` for HRV and
`deviation = (today - mean) / max(1, SD)` for RHR. The component is:

```text
1 - min(0.5, max(0, deviation - 1) * slope)
```

`slope` is 0.10 normally, or 0.15 for RHR with a supported persistent elevation.
One SD or less has no penalty. Favorable readings never exceed 1. The floor of
0.5 prevents a cardiac anomaly alone from overwhelming sleep and self-reports.
For the three-metric blend, RHR alone can reduce the total by at most 10 points,
and HRV by at most 20 before the existing caution guards.

Sleep uses an explicit 7..10-hour target when supplied, otherwise an 8-hour
product default. It does not use the runner's habitual sleep average as a target.
No new settings UI or inferred sleep need is introduced by this change.

**All weights, slopes, deadbands, floors and score bands are testable product
heuristics, not coefficients established by these papers.** Statistical rarity
does not establish practical importance, fatigue, illness or readiness to race.

## Missing history and compatibility

New clients pass sample counts. Components without adequate history or valid
statistics are excluded; no RHR population cutoff is used. If RHR is excluded,
HRV retains the existing 0.60 cardiac allocation. Missing components are
renormalized rather than assigned a perfect reading. If there is no usable
signal, the frontend returns no score.

Legacy callers that send an HRV average without a sample count retain the older
ratio-based HRV component and its 85%/70% flags. That compatibility mode is not
the evidence-informed range model. Updated web, native Today and recruiter-demo
builders send summary statistics; older installed clients remain compatible.

## Caution and display consistency

- With calibrated history, HRV deficits above 2 SD activate the existing
  fatigued ceiling (79). Above 3 SD plus sleep below 6 hours activates the
  existing at-risk ceiling (49). These are prototype training precautions, not
  validated SDNN fatigue thresholds.
- Sleep below 6 hours, fatigue >= 4 or soreness >= 4 retains the fatigued ceiling.
  Fatigue = 5 plus low HRV, short sleep or high soreness retains the at-risk ceiling.
- RHR introduces no additional category cap and no new at-risk trigger. Its
  bounded component contributes to the blend, including when other signals
  also deteriorate. Normal RHR cannot remove a sleep/self-report guard.
- Backend and frontend round to three decimals, then derive state from the same
  whole-number display: 80..100 recovered, 50..79 fatigued, 0..49 at risk.
  These labels are existing product bands, not medical diagnoses.

For illustration, with HRV 50 +/- 5 ms, RHR 52 +/- 2 bpm, 20+ prior readings,
eight-hour target and no self-reports:

| Today's change | Score |
| --- | ---: |
| All at reference | 100 |
| RHR 54, otherwise unchanged | 100 |
| RHR 58, otherwise unchanged | 96 |
| RHR 58 with supported persistence | 94 |
| RHR 58 and sleep 6.5 hours | 88.5 before whole-number display |
| RHR 58, HRV 40 and sleep 6.5 hours | 84.5 before whole-number display |

The recruiter sample has 30 explicitly synthetic daily readings. Its 52 bpm RHR
and 56 ms HRV baselines and variability are computed from those readings, not
borrowed from clinical populations. Its score changes are demonstrations of
the deterministic rule, not measured runner outcomes.

## Verification and future validation

Regression checks cover prior-only history, personal variability, sparse and
invalid inputs, bounded contributions, persistence, sleep targets, safety caps,
score/state rounding, frontend/backend parity and native request compatibility.
Software tests establish implementation consistency, not physiological validity.

```bash
cd frontend
npm run recovery:check
npm run demo:check
cd ../backend
python -m evals.recovery_scoring_contract_smoke
cd ../ios/KineticCompanion
swift test --filter MobileTodayContractFixtureTests
```

Use a Python 3.12 environment with the backend requirements installed. The
parity check runs 1,733 identical TypeScript/Python cases, validates seven
out-of-range/non-finite API inputs, and checks RHR explanation provenance.

Before promoting this model beyond a prototype, review measurement comparability
and thresholds with a qualified sports-science practitioner and evaluate whether
the indicator predicts real subsequent training responses. Future personalized
training-response learning requires prospective outcomes, held-out comparisons,
uncertainty checks and deterministic safety limits; it is not implemented by this
scoring model.