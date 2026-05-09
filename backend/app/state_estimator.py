"""Estimate the athlete's recovery state from biometrics and context."""

from .types import Biometrics, TrainingContext


# Thresholds (kept simple and tunable)
LOW_HRV_RATIO = 0.85       # HRV below 85% of baseline = low
VERY_LOW_HRV_RATIO = 0.70  # HRV below 70% of baseline = very low
POOR_SLEEP_HOURS = 6.0     # < 6h = poor sleep
HIGH_RESTING_HR = 70.0     # informational signal only
HIGH_FATIGUE_LEVEL = 4     # 1..5 scale; ≥4 = "Tired" or worse
HIGH_SORENESS_LEVEL = 4    # 1..5 scale; ≥4 = "Sore" or worse

# Friendly labels for the 1–5 self-report scales (mirrors the Recovery
# page UI). Used purely to make `key_factors` readable.
_FATIGUE_LABELS = {1: "Fresh", 2: "Good", 3: "Average", 4: "Tired", 5: "Wiped"}
_SORENESS_LABELS = {1: "None", 2: "Mild", 3: "Moderate", 4: "Sore", 5: "Very sore"}


def estimate_state(biometrics: Biometrics, training_context: TrainingContext):
    """Classify recovery state and compute a 0-1 recovery score.

    Returns a tuple (state, recovery_score, key_factors).

    The optional self-reports `fatigue_level` and `soreness_level` (1–5)
    contribute to both the recovery score (via re-weighted blending)
    and the qualitative state classification. Without them, behavior
    matches the original HRV+sleep model exactly.
    """
    hrv_ratio = biometrics.hrv / biometrics.hrv_baseline if biometrics.hrv_baseline else 1.0
    sleep = biometrics.sleep_hours
    fatigue = biometrics.fatigue_level
    soreness = biometrics.soreness_level

    low_hrv = hrv_ratio < LOW_HRV_RATIO
    very_low_hrv = hrv_ratio < VERY_LOW_HRV_RATIO
    poor_sleep = sleep < POOR_SLEEP_HOURS
    high_fatigue = fatigue is not None and fatigue >= HIGH_FATIGUE_LEVEL
    very_high_fatigue = fatigue is not None and fatigue >= 5
    high_soreness = soreness is not None and soreness >= HIGH_SORENESS_LEVEL

    key_factors = []
    if very_low_hrv:
        key_factors.append(f"HRV well below baseline ({hrv_ratio:.0%})")
    elif low_hrv:
        key_factors.append(f"HRV below baseline ({hrv_ratio:.0%})")
    if poor_sleep:
        key_factors.append(f"Poor sleep ({sleep:.1f}h)")
    if biometrics.resting_hr > HIGH_RESTING_HR:
        key_factors.append(f"Elevated resting HR ({biometrics.resting_hr:.0f} bpm)")
    if high_fatigue:
        key_factors.append(f"High self-reported fatigue ({_FATIGUE_LABELS.get(fatigue, fatigue)})")
    if high_soreness:
        key_factors.append(f"High self-reported soreness ({_SORENESS_LABELS.get(soreness, soreness)})")

    # Classify state. Self-reports can promote a state on their own:
    # very high fatigue paired with any other negative signal is enough
    # to declare at-risk; high fatigue or soreness alone is enough to
    # declare fatigued.
    if very_low_hrv and poor_sleep:
        state = "at_risk"
    elif very_high_fatigue and (low_hrv or poor_sleep or high_soreness):
        state = "at_risk"
    elif low_hrv or poor_sleep or high_fatigue or high_soreness:
        state = "fatigued"
    else:
        state = "recovered"
        if not key_factors:
            key_factors.append("HRV, sleep, and self-reports within normal range")

    # Recovery score: weighted blend of HRV ratio, sleep adequacy, and
    # (when present) self-reports. Re-weight on the fly so the score
    # scale stays comparable whether or not the self-reports were
    # provided.
    hrv_component = max(0.0, min(1.0, hrv_ratio))
    sleep_component = max(0.0, min(1.0, sleep / 8.0))
    components = [(hrv_component, 0.6), (sleep_component, 0.4)]
    if fatigue is not None:
        # Map 1–5 to 1.0–0.0; 1=Fresh→1.0, 5=Wiped→0.0.
        fatigue_component = max(0.0, min(1.0, (5 - fatigue) / 4))
        components.append((fatigue_component, 0.20))
    if soreness is not None:
        soreness_component = max(0.0, min(1.0, (5 - soreness) / 4))
        components.append((soreness_component, 0.10))
    total_weight = sum(w for _, w in components)
    recovery_score = round(
        sum(c * w for c, w in components) / total_weight, 3
    )
    recovery_score = max(0.0, min(1.0, recovery_score))

    return state, recovery_score, key_factors


def _test():
    """Quick sanity tests for three representative scenarios."""
    # 1) Recovered: HRV near baseline, good sleep
    bio = Biometrics(hrv=65, hrv_baseline=65, sleep_hours=8.0, resting_hr=58)
    ctx = TrainingContext(planned_workout="tempo run", recent_workouts=["easy", "rest"])
    print("recovered ->", estimate_state(bio, ctx))

    # 2) Fatigued: low HRV OR poor sleep
    bio = Biometrics(hrv=52, hrv_baseline=65, sleep_hours=6.5, resting_hr=62)
    ctx = TrainingContext(planned_workout="intervals", recent_workouts=["long", "tempo"])
    print("fatigued  ->", estimate_state(bio, ctx))

    # 3) At-risk: very low HRV AND poor sleep
    bio = Biometrics(hrv=40, hrv_baseline=65, sleep_hours=4.5, resting_hr=74)
    ctx = TrainingContext(planned_workout="intervals", recent_workouts=["intervals", "long"])
    print("at_risk   ->", estimate_state(bio, ctx))


if __name__ == "__main__":
    _test()
