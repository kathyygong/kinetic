// VDOT-style pace calculator for Kinetic.
//
// Approach (deterministic):
//   1. For TRAINING PACES: project every PR in `current_prs` to a
//      5K-equivalent time using Riegel's formula T2 = T1 * (D2/D1)^1.06,
//      take the BEST (smallest) projected 5K time, and derive paces as
//      Daniels-inspired offsets. We anchor on best fitness because
//      training intensities reflect peak aerobic capability.
//   2. For RACE PROJECTION at a distance the user hasn't raced: project
//      every available PR to the target via Riegel, then blend the
//      results with weights inversely proportional to log-distance
//      proximity. This way a slower half marathon pulls a marathon
//      projection down even when the runner has a sharp 5K — instead of
//      being silently discarded by a min().
//
// Units:
//   - Distances in miles
//   - PRs and projected race times in **seconds** (integer)
//   - Paces in minutes per mile (decimal, e.g. 8.5 means 8:30/mi)

import type { CurrentPRs, ExperienceLevel, RaceDistance } from "./types";

// --- Public types -----------------------------------------------------------

export type TrainingPaces = {
  /** Conversational easy pace. */
  easy: number;
  /** Comfortably hard, ~lactate threshold. */
  tempo: number;
  /** Short reps near vVO2max. */
  interval: number;
  /** Long-run pace; close to easy, slightly more controlled. */
  long: number;
};

export type Intensity = "low" | "moderate" | "high";

// --- Constants --------------------------------------------------------------

/** Standard race distances in miles. */
export const RACE_DISTANCE_MILES: Record<RaceDistance, number> = {
  "5k": 3.107,
  "10k": 6.214,
  half: 13.109,
  marathon: 26.219,
};

/** Riegel's exponent for cross-distance race-time projection. */
const RIEGEL_EXP = 1.06;

/**
 * Daniels-inspired training-pace offsets relative to 5K race pace,
 * in minutes per mile. Negative = faster than 5K race pace.
 *
 *   - interval ≈ vVO2max ≈ 5K race pace (slightly faster for short reps)
 *   - tempo    ≈ lactate threshold ≈ ~25–30 s/mi slower
 *   - long     ≈ aerobic, ~1:30 slower
 *   - easy     ≈ recovery aerobic, ~1:45 slower
 */
const PACE_OFFSETS_FROM_5K: TrainingPaces = {
  interval: -0.08,
  tempo: 0.5,
  long: 1.5,
  easy: 1.75,
};

/**
 * Base improvement (fraction of PR) from a typical training block,
 * driven by experience level. Beginners have more upside than advanced.
 */
const BASE_IMPROVEMENT: Record<ExperienceLevel, number> = {
  beginner: 0.045,
  intermediate: 0.035,
  advanced: 0.025,
};

/** Adjustment to the improvement fraction based on plan intensity. */
const INTENSITY_ADJUSTMENT: Record<Intensity, number> = {
  low: -0.005,
  moderate: 0,
  high: 0.005,
};

/** Spec: total projected improvement is clamped to 2–5%. */
const MIN_IMPROVEMENT = 0.02;
const MAX_IMPROVEMENT = 0.05;

// --- Internals --------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Riegel projection: convert a race time at `fromMiles` to an equivalent
 * race time at `toMiles`. Both `time` and the result share the same unit
 * (we use seconds throughout this module).
 */
function riegel(time: number, fromMiles: number, toMiles: number): number {
  return time * Math.pow(toMiles / fromMiles, RIEGEL_EXP);
}

/**
 * Best (smallest) 5K-equivalent time, in seconds, computed from all
 * available PRs. PRs that are missing or non-positive are ignored.
 * Accepts a possibly-undefined / partial PR record to tolerate older
 * goals stored before the PR schema existed.
 */
function best5KEquivalent(current_prs: Partial<CurrentPRs> | undefined): number {
  const candidates: number[] = [];
  if (current_prs) {
    for (const distance of Object.keys(RACE_DISTANCE_MILES) as RaceDistance[]) {
      const pr = current_prs[distance];
      if (typeof pr === "number" && pr > 0) {
        candidates.push(
          riegel(pr, RACE_DISTANCE_MILES[distance], RACE_DISTANCE_MILES["5k"])
        );
      }
    }
  }
  // Sensible fallback if PRs are missing/invalid: 25:00 5K = 1500 s
  // (~8:03/mi).
  if (candidates.length === 0) return 25 * 60;
  return Math.min(...candidates);
}

/**
 * Blended Riegel projection toward a target race distance, computed
 * from EVERY available PR (not just the fastest). Each PR projects to
 * the target via Riegel; the projections are then averaged with weights
 * inversely proportional to log-distance proximity to the target.
 *
 * Why blend instead of taking the best? Riegel is a one-parameter model
 * and tends to over-predict long-distance performance for runners with
 * a fast 5K but weak endurance. By weighting each PR by how close its
 * distance is to the target, a slower half marathon dominates a
 * marathon projection (1.0× the distance away in log space) over a
 * faster 5K (3× the distance away), producing a realistic answer for
 * runners with mismatched short/long fitness.
 *
 * Returns null if no usable PRs are present.
 */
function blendedProjectionTo(
  current_prs: Partial<CurrentPRs> | undefined,
  target: RaceDistance
): number | null {
  if (!current_prs) return null;
  const targetMi = RACE_DISTANCE_MILES[target];
  let weightSum = 0;
  let weightedTime = 0;
  for (const distance of Object.keys(RACE_DISTANCE_MILES) as RaceDistance[]) {
    const pr = current_prs[distance];
    if (typeof pr !== "number" || pr <= 0) continue;
    const fromMi = RACE_DISTANCE_MILES[distance];
    const projected = riegel(pr, fromMi, targetMi);
    // Same-distance PR has logRatio == 0, so adding a small epsilon
    // keeps the weight finite without distorting the blend at other
    // distances.
    const logRatio = Math.abs(Math.log(fromMi / targetMi));
    const weight = 1 / (logRatio + 0.1);
    weightSum += weight;
    weightedTime += projected * weight;
  }
  if (weightSum === 0) return null;
  return weightedTime / weightSum;
}

// --- Public API -------------------------------------------------------------

/**
 * Compute training paces (min/mile) for a given race distance and PR set.
 * `race_distance` is accepted for API symmetry with the spec; the actual
 * paces are anchored to the user's best effective 5K-equivalent fitness,
 * which already reflects performance at every distance they've raced.
 */
export function getTrainingPaces(
  _race_distance: RaceDistance,
  current_prs: Partial<CurrentPRs> | undefined
): TrainingPaces {
  const fiveKSeconds = best5KEquivalent(current_prs);
  // Convert seconds-per-5K to minutes-per-mile.
  const fiveKPace = fiveKSeconds / 60 / RACE_DISTANCE_MILES["5k"];

  return {
    easy: round2(fiveKPace + PACE_OFFSETS_FROM_5K.easy),
    tempo: round2(fiveKPace + PACE_OFFSETS_FROM_5K.tempo),
    interval: round2(fiveKPace + PACE_OFFSETS_FROM_5K.interval),
    long: round2(fiveKPace + PACE_OFFSETS_FROM_5K.long),
  };
}

/**
 * Compute training paces at a point in the plan, interpolating between
 * the runner's *current* fitness (paces anchored to today's best 5K
 * equivalent) and *projected* fitness (paces anchored to the projected
 * 5K equivalent after a full training block).
 *
 * `progress` is 0..1, where 0 = first week and 1 = race week.
 */
export function getTrainingPacesAtProgress(
  race_distance: RaceDistance,
  current_prs: Partial<CurrentPRs> | undefined,
  experience_level: ExperienceLevel,
  progress: number,
  intensity: Intensity = "moderate"
): TrainingPaces {
  const t = clamp(progress, 0, 1);
  const improvement = clamp(
    BASE_IMPROVEMENT[experience_level] + INTENSITY_ADJUSTMENT[intensity],
    MIN_IMPROVEMENT,
    MAX_IMPROVEMENT
  );

  const currentFiveK = best5KEquivalent(current_prs);
  const projectedFiveK = currentFiveK * (1 - improvement);
  const fiveKSeconds = currentFiveK + (projectedFiveK - currentFiveK) * t;
  const fiveKPace = fiveKSeconds / 60 / RACE_DISTANCE_MILES["5k"];

  return {
    easy: round2(fiveKPace + PACE_OFFSETS_FROM_5K.easy),
    tempo: round2(fiveKPace + PACE_OFFSETS_FROM_5K.tempo),
    interval: round2(fiveKPace + PACE_OFFSETS_FROM_5K.interval),
    long: round2(fiveKPace + PACE_OFFSETS_FROM_5K.long),
  };
}

/**
 * Project a post-training race time (in **seconds**) for the target race
 * distance. The improvement is 2–5% off the user's PR, scaled by:
 *   - experience_level (beginners improve more)
 *   - intensity        (higher intensity → larger improvement)
 *
 * If the user has a PR at exactly the target distance we use it
 * directly — they've actually raced that distance, no extrapolation
 * needed. Otherwise we blend Riegel projections from every available
 * PR so that a slower half pulls a marathon projection down even when
 * the runner has a sharp 5K (vs. the previous behavior, which silently
 * picked the single fastest PR and ignored the rest).
 */
export function projectRaceTime(
  race_distance: RaceDistance,
  current_prs: Partial<CurrentPRs> | undefined,
  experience_level: ExperienceLevel,
  intensity: Intensity = "moderate"
): number {
  const improvement = clamp(
    BASE_IMPROVEMENT[experience_level] + INTENSITY_ADJUSTMENT[intensity],
    MIN_IMPROVEMENT,
    MAX_IMPROVEMENT
  );

  const targetPR = current_prs?.[race_distance];
  let baseTime: number;
  if (typeof targetPR === "number" && targetPR > 0) {
    baseTime = targetPR;
  } else {
    const blended = blendedProjectionTo(current_prs, race_distance);
    // Final fallback: no PRs at all → use the 25:00 5K-equivalent
    // default, projected to the target distance.
    baseTime =
      blended ??
      riegel(
        best5KEquivalent(current_prs),
        RACE_DISTANCE_MILES["5k"],
        RACE_DISTANCE_MILES[race_distance]
      );
  }

  return round2(baseTime * (1 - improvement));
}

/** Format a decimal pace (min/mi) as "M:SS/mi". */
export function formatPace(pace: number): string {
  const totalSec = Math.round(pace * 60);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}/mi`;
}

// --- Helpers ---------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
