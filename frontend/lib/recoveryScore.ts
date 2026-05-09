/**
 * Single source of truth for the user-facing recovery score AND state.
 *
 * Goal of this module: a runner should never see a "recovered 79" or
 * "fatigued 80" — the number on the ring and the label below it must
 * always tell the same story. We achieve that with a two-step pipeline:
 *
 *  1. Compute a weighted blend of every logged signal (HRV / sleep /
 *     fatigue / soreness) — same weights and component formulas as the
 *     backend's `state_estimator.estimate_state`.
 *
 *  2. If any single signal trips a "fatigued" or "at-risk" flag, CAP
 *     the blended score so it cannot escape its band. The state is
 *     then derived from the capped score using fixed band thresholds.
 *     Because both come out of the same number, the score range and
 *     the state label can never disagree.
 *
 * The bands (mirrored in any UI that renders them):
 *
 *     Score 80–100  → recovered  (emerald ring)
 *     Score 50–79   → fatigued   (amber ring)
 *     Score  0–49   → at risk    (amber ring, more cautious copy)
 *
 * Inputs:
 *  - `readiness`  : today's manually-logged values. Any field may be
 *                   absent — components without data are dropped from
 *                   the blend rather than backfilled with defaults.
 *  - `baselines`  : the user's rolling 30-day averages. We use
 *                   `baselines.hrv` as the personal HRV baseline; HRV
 *                   is only meaningful as a *ratio* against a baseline,
 *                   so without one we drop the HRV component entirely.
 *
 * Returns `null` when there's no data to score from at all (used by
 * the dashboard's recovery card to render the empty state).
 */

import type { ManualReadiness, ReadinessBaselines } from "./readinessStorage";

// ---------------------------------------------------------------------------
// Component thresholds (must mirror `backend/app/state_estimator.py`).
// ---------------------------------------------------------------------------

const HRV_LOW_RATIO = 0.85;
const HRV_VERY_LOW_RATIO = 0.7;
const POOR_SLEEP_HOURS = 6.0;
const HIGH_FATIGUE_LEVEL = 4;
const VERY_HIGH_FATIGUE_LEVEL = 5;
const HIGH_SORENESS_LEVEL = 4;

// Sleep target — backend uses 8h as the "1.0" mark via `sleep / 8.0`.
const SLEEP_TARGET_HOURS = 8.0;

// Component weights — identical to the backend.
const W_HRV = 0.6;
const W_SLEEP = 0.4;
const W_FATIGUE = 0.2;
const W_SORENESS = 0.1;

// ---------------------------------------------------------------------------
// Score bands — the public contract between score and state. Exported
// so UI captions / tooltips can render the same numbers the engine uses.
// ---------------------------------------------------------------------------

/** Score >= this (0–1 scale) is "recovered". 0.80 ⇒ 80/100. */
export const RECOVERED_THRESHOLD_01 = 0.8;

/** Score >= this and < RECOVERED_THRESHOLD_01 is "fatigued". 0.50 ⇒ 50/100. */
export const FATIGUED_THRESHOLD_01 = 0.5;

// Caps applied when component flags trip — they pull the blend down
// into the matching band so the score never lies about the state. The
// caps sit just below the band boundary so a fatigued runner sees a
// score in [50, 79] and an at-risk runner sees [0, 49].
const FATIGUED_CAP_01 = RECOVERED_THRESHOLD_01 - 0.01; // 0.79
const AT_RISK_CAP_01 = FATIGUED_THRESHOLD_01 - 0.01; // 0.49

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface ComponentFlags {
  /** Any single "yellow flag" tripped (HRV low / sleep poor / fatigue/soreness ≥ 4). */
  fatigued: boolean;
  /** Severe combination — caller should treat as the most cautious tier. */
  atRisk: boolean;
}

/**
 * Compute the per-component flags using the same logic as the backend.
 * Returned even when no signal is logged (all false) — caller decides
 * whether to surface anything.
 */
function computeFlags(
  readiness: ManualReadiness,
  baselines: ReadinessBaselines | null | undefined,
): ComponentFlags {
  let lowHrv = false;
  let veryLowHrv = false;
  if (
    typeof readiness.hrv === "number" &&
    Number.isFinite(readiness.hrv) &&
    typeof baselines?.hrv === "number" &&
    Number.isFinite(baselines.hrv) &&
    baselines.hrv > 0
  ) {
    const ratio = readiness.hrv / baselines.hrv;
    lowHrv = ratio < HRV_LOW_RATIO;
    veryLowHrv = ratio < HRV_VERY_LOW_RATIO;
  }

  const poorSleep =
    typeof readiness.sleep_hours === "number" &&
    readiness.sleep_hours < POOR_SLEEP_HOURS;

  const highFatigue =
    typeof readiness.fatigue_level === "number" &&
    readiness.fatigue_level >= HIGH_FATIGUE_LEVEL;
  const veryHighFatigue =
    typeof readiness.fatigue_level === "number" &&
    readiness.fatigue_level >= VERY_HIGH_FATIGUE_LEVEL;

  const highSoreness =
    typeof readiness.soreness_level === "number" &&
    readiness.soreness_level >= HIGH_SORENESS_LEVEL;

  // At-risk requires a *combination* of severe signals — any single
  // yellow flag alone is "fatigued", not "at risk".
  const atRisk =
    (veryLowHrv && poorSleep) ||
    (veryHighFatigue && (lowHrv || poorSleep || highSoreness));

  const fatigued = lowHrv || poorSleep || highFatigue || highSoreness;

  return { fatigued, atRisk };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Compute the [0, 1] recovery score from the runner's logged readiness
 * and personal baselines. Applies state-aware caps so that the score
 * always falls inside the band that matches the state classification.
 * Returns `null` when there's no signal to score from at all.
 */
export function computeRecoveryScore01(
  readiness: ManualReadiness | null | undefined,
  baselines: ReadinessBaselines | null | undefined,
): number | null {
  if (!readiness) return null;

  const components: Array<{ value: number; weight: number }> = [];

  // HRV — ratio against a personal baseline; both sides required.
  if (
    typeof readiness.hrv === "number" &&
    Number.isFinite(readiness.hrv) &&
    typeof baselines?.hrv === "number" &&
    Number.isFinite(baselines.hrv) &&
    baselines.hrv > 0
  ) {
    const ratio = readiness.hrv / baselines.hrv;
    components.push({ value: clamp01(ratio), weight: W_HRV });
  }

  if (
    typeof readiness.sleep_hours === "number" &&
    Number.isFinite(readiness.sleep_hours)
  ) {
    components.push({
      value: clamp01(readiness.sleep_hours / SLEEP_TARGET_HOURS),
      weight: W_SLEEP,
    });
  }

  if (
    typeof readiness.fatigue_level === "number" &&
    Number.isFinite(readiness.fatigue_level)
  ) {
    // 1=Fresh→1.0, 5=Wiped→0.0
    components.push({
      value: clamp01((5 - readiness.fatigue_level) / 4),
      weight: W_FATIGUE,
    });
  }

  if (
    typeof readiness.soreness_level === "number" &&
    Number.isFinite(readiness.soreness_level)
  ) {
    components.push({
      value: clamp01((5 - readiness.soreness_level) / 4),
      weight: W_SORENESS,
    });
  }

  if (components.length === 0) return null;

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const blended =
    components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight;

  // Apply state-aware caps so the score band agrees with the state.
  // A single yellow flag drops the runner into the "fatigued" band even
  // if the blend would otherwise read green; a severe combination
  // drops them into "at-risk".
  const flags = computeFlags(readiness, baselines);
  let score = blended;
  if (flags.atRisk) {
    score = Math.min(score, AT_RISK_CAP_01);
  } else if (flags.fatigued) {
    score = Math.min(score, FATIGUED_CAP_01);
  }
  return clamp01(score);
}

/**
 * Recovery state, derived purely from the score bands above. Always
 * agrees with `computeRecoveryScore01` by construction — the score is
 * capped before being banded, so the two helpers can never disagree.
 */
export type RecoveryState = "recovered" | "fatigued" | "at_risk";

export function classifyRecoveryState(
  readiness: ManualReadiness | null | undefined,
  baselines: ReadinessBaselines | null | undefined,
): RecoveryState | null {
  const score = computeRecoveryScore01(readiness, baselines);
  if (score === null) return null;
  if (score >= RECOVERED_THRESHOLD_01) return "recovered";
  if (score >= FATIGUED_THRESHOLD_01) return "fatigued";
  return "at_risk";
}

/**
 * Canonical state → ring tone mapping. Keeping it here means the
 * dashboard, recovery page, and any future surface always pick the
 * same colour for the same state.
 *
 *  - recovered → emerald (green): healthy, ready to train
 *  - fatigued  → amber  (yellow): caution, scale today's session
 *  - at_risk   → rose   (red):    rest is the better answer
 *  - null      → blue (neutral):  no reading yet
 */
export type RecoveryRingTone = "blue" | "emerald" | "amber" | "rose";

export function recoveryStateTone(
  state: RecoveryState | null,
): RecoveryRingTone {
  if (state === "recovered") return "emerald";
  if (state === "fatigued") return "amber";
  if (state === "at_risk") return "rose";
  return "blue";
}

