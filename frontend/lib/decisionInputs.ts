import type { ManualReadiness, ReadinessBaselines } from "./readinessStorage";
import type { Biometrics } from "./scenarios";

/**
 * Overlay today's manual readiness onto the demo/default biometric shape.
 *
 * HRV is only meaningful relative to a baseline. When the runner has a
 * rolling personal baseline, the Dashboard must send that same baseline used
 * by the Recovery page; the scenario baseline is only a last-resort fallback.
 */
export function applyManualReadiness(
  base: Biometrics,
  readiness: ManualReadiness | null | undefined,
  baselines: ReadinessBaselines | null | undefined,
): Biometrics {
  if (!readiness) return { ...base };
  return {
    hrv: readiness.hrv ?? base.hrv,
    hrv_baseline: baselines?.hrv ?? base.hrv_baseline,
    sleep_hours: readiness.sleep_hours ?? base.sleep_hours,
    resting_hr: readiness.resting_hr ?? base.resting_hr,
    fatigue_level: readiness.fatigue_level ?? base.fatigue_level,
    soreness_level: readiness.soreness_level ?? base.soreness_level,
  };
}
