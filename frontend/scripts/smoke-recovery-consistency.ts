import { applyManualReadiness } from "../lib/decisionInputs";
import {
  classifyRecoveryState,
  computeRecoveryScore01,
} from "../lib/recoveryScore";
import type { ManualReadiness, ReadinessBaselines } from "../lib/readinessStorage";
import { scenarios } from "../lib/scenarios";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const readiness: ManualReadiness = {
  date: "2026-06-29",
  updated_at: "2026-06-29T12:00:00.000Z",
  hrv: 51,
  sleep_hours: 6.8,
  resting_hr: 51,
  fatigue_level: 3,
  soreness_level: 2,
};
const baselines: ReadinessBaselines = {
  hrv: 53.6,
  sleep_hours: 7.18,
  resting_hr: 49.2,
};

const requestBiometrics = applyManualReadiness(
  scenarios[0].biometrics,
  readiness,
  baselines,
);
expect(
  requestBiometrics.hrv_baseline === baselines.hrv,
  "Dashboard request must use the same rolling HRV baseline as Recovery",
);

const recoveryScore = computeRecoveryScore01(readiness, baselines);
expect(
  recoveryScore !== null && Math.round(recoveryScore * 100) === 84,
  "seeded readings should produce the canonical 84/100 score",
);
expect(
  classifyRecoveryState(readiness, baselines) === "recovered",
  "seeded readings should classify as recovered",
);

const backendEquivalent = scoreBackendInput(requestBiometrics);
expect(
  Math.round(backendEquivalent.score * 100) === 84,
  "backend request inputs must produce the same rounded score",
);
expect(
  backendEquivalent.state === "recovered",
  "backend request inputs must produce the same recovery state",
);

const fallback = applyManualReadiness(
  scenarios[0].biometrics,
  readiness,
  {},
);
expect(
  fallback.hrv_baseline === scenarios[0].biometrics.hrv_baseline,
  "scenario baseline remains the safe fallback when history is absent",
);

console.log(
  "OK - Dashboard and Recovery share the same HRV baseline, score, and state",
);

function scoreBackendInput(
  biometrics: ReturnType<typeof applyManualReadiness>,
) {
  const hrvRatio = biometrics.hrv / biometrics.hrv_baseline;
  const lowHrv = hrvRatio < 0.85;
  const poorSleep = biometrics.sleep_hours < 6;
  const highFatigue = (biometrics.fatigue_level ?? 0) >= 4;
  const highSoreness = (biometrics.soreness_level ?? 0) >= 4;
  const components = [
    { value: clamp01(hrvRatio), weight: 0.6 },
    { value: clamp01(biometrics.sleep_hours / 8), weight: 0.4 },
  ];
  if (biometrics.fatigue_level !== undefined) {
    components.push({
      value: clamp01((5 - biometrics.fatigue_level) / 4),
      weight: 0.2,
    });
  }
  if (biometrics.soreness_level !== undefined) {
    components.push({
      value: clamp01((5 - biometrics.soreness_level) / 4),
      weight: 0.1,
    });
  }
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const score =
    components.reduce(
      (sum, item) => sum + item.value * item.weight,
      0,
    ) / totalWeight;
  return {
    score,
    state:
      lowHrv || poorSleep || highFatigue || highSoreness
        ? "fatigued"
        : "recovered",
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
