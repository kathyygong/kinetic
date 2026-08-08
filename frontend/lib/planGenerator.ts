// Legacy deterministic fixture/demo generator for Kinetic.
//
// Production web plan creation uses authenticated mobile-plan-generation.v1.
// Keep this pure implementation only for smoke fixtures and synthetic demo
// seeding until those test helpers are migrated or retired.
//
// Input: a Goal (see lib/types.ts).
// Output: an array of weeks, each with 3–5 workouts.
//
// Rules:
//   - 4–6 weeks total (derived from target_date, clamped).
//   - 3–5 workouts per week (driven by experience_level).
//   - Every week has at least one long run and one quality workout
//     (tempo or intervals, alternated across weeks).
//   - Volume increases ~10% per week.
//   - Per-workout pace comes from `getTrainingPaces` in `paceCalculator`.
//   - Per-workout distance is allocated from weekly mileage (estimated
//     from experience_level if not provided).
//   - Duration = distance × pace.
//
// All distances in miles, paces in minutes per mile.
// No randomness — same goal in, same plan out.

import {
  getTrainingPacesAtProgress,
  type TrainingPaces,
} from "./paceCalculator";
import type { DayOfWeek, ExperienceLevel, Goal, RaceDistance } from "./types";

// --- Public types -----------------------------------------------------------

export type WorkoutType =
  | "easy"
  | "tempo"
  | "intervals"
  | "long run"
  | "race";

export type WeekPhase = "build" | "recovery" | "taper" | "race";

export type Workout = {
  day: string;
  type: WorkoutType;
  /** Distance in miles, rounded to the nearest 0.5. */
  distance: number;
  /** Target pace in minutes per mile (decimal, e.g. 8.5 = 8:30/mi). */
  pace: number;
  /** Duration in minutes, rounded to the nearest 5. */
  duration: number;
};

export type PlanWeek = {
  weekNumber: number;
  phase: WeekPhase;
  workouts: Workout[];
};

// --- Tunables ---------------------------------------------------------------

const MIN_WEEKS = 4;
const MAX_WEEKS = 20; // long enough for a marathon block
const WEEKLY_GROWTH = 0.1; // +10% volume per week, capped per-race below.

/**
 * Per-race ceiling on how far the weekly volume is allowed to grow above
 * the runner's reported base. Marathon and half-marathon builds need a
 * larger ramp than 5k/10k blocks because peak weekly mileage drives
 * long-run capacity, which in turn caps the long run (see
 * `LONG_RUN_VOLUME_CAP` below). The +10%/week growth still applies; this
 * just sets the ceiling each plan asymptotes toward.
 */
const MAX_GROWTH: Record<RaceDistance, number> = {
  "5k": 1.5,
  "10k": 1.5,
  half: 1.6,
  marathon: 1.8,
};

/**
 * Race-specific safety cap on long-run length, expressed as a fraction
 * of peak weekly volume. The standard “no more than ~35% of weekly
 * mileage” advice fits 5k/10k builds well, but marathon training
 * routinely runs the long run at ~50% of weekly volume during the peak
 * three weeks (e.g. a 20-mile long run on a 40-mile week). Using a
 * single global value either underbuilds marathoners or overbuilds
 * 5k runners — this map captures the difference.
 */
const LONG_RUN_VOLUME_CAP: Record<RaceDistance, number> = {
  "5k": 0.30,
  "10k": 0.30,
  half: 0.40,
  marathon: 0.50,
};

/**
 * Minimum weekly base required for the plan to make physiological sense
 * for a given race distance. If the runner reports a lower volume we
 * silently raise the base up to this floor — the plan still ramps from
 * `weeklyMilesBase` to `weeklyMilesBase * MAX_GROWTH`, but starts at a
 * volume that can actually support race-specific long runs by peak.
 * Marathon training, in particular, is unsafe to attempt off a 15 mi/wk
 * base; raising the floor is the difference between a generic plan
 * with a marathon label and an actual marathon build.
 */
const MIN_WEEKLY_MILES_BY_RACE: Record<RaceDistance, number> = {
  "5k": 0,
  "10k": 0,
  half: 18,
  marathon: 25,
};

/**
 * Recovery (down) weeks: every Nth week during the build phase scales
 * volume back to allow adaptation. Only applied when the plan is long
 * enough (>= 6 weeks) and the week is not in the taper window.
 */
const DOWN_WEEK_INTERVAL = 4;
const DOWN_WEEK_MULTIPLIER = 0.8;
const DOWN_WEEK_MIN_PLAN_LENGTH = 6;

/**
 * Taper: per-race-distance volume multipliers for the final N weeks of the
 * plan. The last entry is race week. Indexed from earliest taper week to
 * race week, so taperSchedule[taperSchedule.length - 1] = race week.
 */
const TAPER_SCHEDULE: Record<RaceDistance, number[]> = {
  "5k": [0.7],
  "10k": [0.7],
  half: [0.85, 0.6],
  marathon: [0.8, 0.65, 0.5],
};

/** Cap on a single long run, in miles, by race distance. */
const LONG_RUN_MAX_MILES: Record<RaceDistance, number> = {
  "5k": 8,
  "10k": 10,
  half: 14,
  marathon: 22,
};

/**
 * Number of weeks before race day where the long run peaks. The long run
 * grows from a sane starting value to LONG_RUN_MAX_MILES at this offset,
 * then steps down through the taper.
 */
const LONG_RUN_PEAK_OFFSET: Record<RaceDistance, number> = {
  "5k": 1,
  "10k": 1,
  half: 2,
  marathon: 3,
};

/** Race-week workout. Distances in miles. */
const RACE_DAY_DISTANCE: Record<RaceDistance, number> = {
  "5k": 3.1,
  "10k": 6.2,
  half: 13.1,
  marathon: 26.2,
};

/** How many workouts per week we schedule for each experience level. */
const WORKOUTS_PER_WEEK: Record<ExperienceLevel, 3 | 4 | 5> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

/** Weekly mileage fallback (miles) when the user hasn't reported one. */
const ESTIMATED_WEEKLY_MILES: Record<ExperienceLevel, number> = {
  beginner: 15,
  intermediate: 25,
  advanced: 40,
};

/**
 * Share of weekly mileage allocated to each non-easy workout. The remainder
 * is distributed evenly across the easy days.
 */
const LONG_RUN_SHARE = 0.3;
const QUALITY_SHARE = 0.2;

/**
 * Race-specific long-run multiplier. Marathon training emphasizes the long
 * run; 5k training de-emphasizes it.
 */
const LONG_RUN_BUMP: Record<RaceDistance, number> = {
  "5k": 0.85,
  "10k": 1.0,
  half: 1.1,
  marathon: 1.25,
};

/**
 * Weekly templates: which days run, and what type each is.
 * "quality" is replaced per-week with either "tempo" or "intervals".
 */
const TEMPLATES: Record<3 | 4 | 5, Array<{ day: string; type: WorkoutType | "quality" }>> = {
  3: [
    { day: "Tue", type: "easy" },
    { day: "Thu", type: "quality" },
    { day: "Sun", type: "long run" },
  ],
  4: [
    { day: "Mon", type: "easy" },
    { day: "Wed", type: "quality" },
    { day: "Fri", type: "easy" },
    { day: "Sun", type: "long run" },
  ],
  5: [
    { day: "Mon", type: "easy" },
    { day: "Tue", type: "quality" },
    { day: "Thu", type: "easy" },
    { day: "Fri", type: "easy" },
    { day: "Sun", type: "long run" },
  ],
};

// --- Helpers ----------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Round to the nearest 5 minutes, with a 5-minute floor. */
function round5(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Round to the nearest half-mile, with a 0.5-mile floor. */
function roundHalfMile(miles: number): number {
  return Math.max(0.5, Math.round(miles * 2) / 2);
}

/** Whole weeks between today and target_date, clamped to [MIN_WEEKS, MAX_WEEKS]. */
function weeksUntil(target_date: string): number {
  if (!target_date) return MIN_WEEKS;
  const target = new Date(target_date);
  if (Number.isNaN(target.getTime())) return MIN_WEEKS;
  const today = new Date();
  const ms = target.getTime() - today.getTime();
  const weeks = Math.ceil(ms / (1000 * 60 * 60 * 24 * 7));
  return clamp(weeks, MIN_WEEKS, MAX_WEEKS);
}

/** Map a `WorkoutType` to the matching key on `TrainingPaces`. */
function paceKey(type: WorkoutType): keyof TrainingPaces {
  switch (type) {
    case "easy":
      return "easy";
    case "tempo":
      return "tempo";
    case "intervals":
      return "interval";
    case "long run":
      return "long";
    case "race":
      // Race-day pace approximation; race-day workouts handle their own
      // pace lookup, but this keeps the function total.
      return "tempo";
  }
}

// --- Main -------------------------------------------------------------------

export function generateTrainingPlan(goal: Goal): PlanWeek[] {
  const totalWeeks = weeksUntil(goal.target_date);
  const perWeek = WORKOUTS_PER_WEEK[goal.experience_level];
  const template = TEMPLATES[perWeek];

  // Tolerate goals stored before the PR / race_distance schema existed.
  const raceDistance: RaceDistance = goal.race_distance ?? "5k";
  const longRunBump = LONG_RUN_BUMP[raceDistance];

  // Reported weekly base, raised to a race-appropriate floor so
  // longer-distance plans actually ramp into volume that can support
  // the requisite long runs. A runner who reports 15 mi/wk for a
  // marathon goal still gets a plan that builds from a marathon-viable
  // 25 mi/wk base — the +10%/week growth then takes it from there.
  const weeklyMilesReported =
    typeof goal.weekly_mileage === "number" && goal.weekly_mileage > 0
      ? goal.weekly_mileage
      : ESTIMATED_WEEKLY_MILES[goal.experience_level];
  const weeklyMilesBase = Math.max(
    weeklyMilesReported,
    MIN_WEEKLY_MILES_BY_RACE[raceDistance],
  );
  const maxGrowth = MAX_GROWTH[raceDistance];

  const easyCount = template.filter((t) => t.type === "easy").length;

  const taperSchedule = TAPER_SCHEDULE[raceDistance];
  const taperLength = taperSchedule.length;
  // Index of the first taper week within the plan (inclusive). If the plan
  // is shorter than the taper schedule, the entire plan tapers from week 1.
  const taperStartIdx = Math.max(0, totalWeeks - taperLength);
  const longRunCapDistance = LONG_RUN_MAX_MILES[raceDistance];
  // Safety cap: never let the long run exceed a race-appropriate
  // fraction of the user's peak weekly volume. Without this, a runner
  // training on 15-22 mi/wk would still ramp to the race-distance cap
  // (e.g. 22 mi for a marathon), which is unrealistic and unsafe.
  const longRunCapByVolume =
    weeklyMilesBase * maxGrowth * LONG_RUN_VOLUME_CAP[raceDistance];
  const longRunCap = Math.min(longRunCapDistance, longRunCapByVolume);
  const peakOffset = LONG_RUN_PEAK_OFFSET[raceDistance];
  // Index of the long-run peak week (inclusive). For very short plans this
  // can be 0; the long run still grows toward the cap from week 1.
  const peakWeekIdx = Math.max(0, totalWeeks - 1 - peakOffset);
  // Long run on week 1 — small enough to feel like a starting point, but
  // never larger than what the weekly-mileage allocation would allow.
  const longRunStart = Math.min(
    weeklyMilesBase * LONG_RUN_SHARE * longRunBump,
    longRunCap
  );

  const plan: PlanWeek[] = [];

  for (let i = 0; i < totalWeeks; i++) {
    const weekNumber = i + 1;
    const isRaceWeek = i === totalWeeks - 1;
    const isTaperWeek = i >= taperStartIdx;
    const buildWeeksRemaining = totalWeeks - taperLength;
    // A down week happens every Nth week during the build phase, but never
    // during taper, never on week 1, and only if the plan is long enough.
    const isDownWeek =
      !isTaperWeek &&
      totalWeeks >= DOWN_WEEK_MIN_PLAN_LENGTH &&
      buildWeeksRemaining >= DOWN_WEEK_INTERVAL &&
      i > 0 &&
      (i + 1) % DOWN_WEEK_INTERVAL === 0;

    const phase: WeekPhase = isRaceWeek
      ? "race"
      : isTaperWeek
        ? "taper"
        : isDownWeek
          ? "recovery"
          : "build";

    // Progress 0..1 across the plan; race week = 1.
    const progress = totalWeeks > 1 ? i / (totalWeeks - 1) : 1;
    const paces = getTrainingPacesAtProgress(
      raceDistance,
      goal.current_prs,
      goal.experience_level,
      progress
    );

    let phaseMultiplier = 1;
    if (isTaperWeek) {
      phaseMultiplier = taperSchedule[i - taperStartIdx];
    } else if (isDownWeek) {
      phaseMultiplier = DOWN_WEEK_MULTIPLIER;
    }

    const growth = Math.min(1 + WEEKLY_GROWTH * i, maxGrowth);
    const weekMiles = weeklyMilesBase * growth * phaseMultiplier;

    // Long run progression: lerp from longRunStart up to longRunCap at the
    // peak week, then apply the taper multiplier on race-week side.
    let longRunMiles: number;
    if (peakWeekIdx <= 0) {
      // Plan too short to progress — use the cap, scaled by phase.
      longRunMiles = longRunCap * (isTaperWeek ? phaseMultiplier : 1);
    } else if (i <= peakWeekIdx) {
      const t = i / peakWeekIdx; // 0..1
      longRunMiles = longRunStart + (longRunCap - longRunStart) * t;
      // Recovery weeks during the build phase pull the long run back too.
      if (isDownWeek) longRunMiles *= DOWN_WEEK_MULTIPLIER;
    } else {
      // After peak: shrink with the taper multiplier, anchored to the cap.
      longRunMiles = longRunCap * phaseMultiplier;
    }
    longRunMiles = Math.min(longRunMiles, longRunCap);

    const qualityMiles = weekMiles * QUALITY_SHARE;
    const easyTotal = Math.max(0, weekMiles - longRunMiles - qualityMiles);
    let easyMiles = easyCount > 0 ? easyTotal / easyCount : 0;

    // Sanity cap on a single easy day. With only one easy slot in a
    // beginner week (3 workouts) and a depressed long-run share (e.g.
    // LONG_RUN_BUMP['5k']=0.85), all the surplus mileage piles into the
    // single easy run and ends up larger than the long run — physiologically
    // backwards. Clamp to the smaller of: 90% of the long run (keeps the
    // long run as the week's longest workout) and 40% of weekly volume.
    // Any excess is redirected back into the long run (still subject to
    // longRunCap), so weekly volume bends rather than breaks.
    const easyDayCap = Math.min(longRunMiles * 0.9, weekMiles * 0.4);
    if (easyCount > 0 && easyMiles > easyDayCap) {
      const overflow = (easyMiles - easyDayCap) * easyCount;
      easyMiles = easyDayCap;
      longRunMiles = Math.min(longRunMiles + overflow, longRunCap);
    }

    // Alternate quality workouts week-to-week so the plan feels varied.
    const qualityType: WorkoutType = i % 2 === 0 ? "tempo" : "intervals";

    const workouts: Workout[] = template.map(({ day, type }) => {
      const resolvedType: WorkoutType = type === "quality" ? qualityType : type;

      // On race week, the long-run slot becomes the race itself.
      if (isRaceWeek && resolvedType === "long run") {
        const raceMiles = RACE_DAY_DISTANCE[raceDistance];
        const pace = paces.tempo; // race-pace approximation
        return {
          day,
          type: "race",
          distance: raceMiles,
          pace,
          duration: round5(raceMiles * pace),
        };
      }

      let rawMiles: number;
      if (resolvedType === "long run") rawMiles = longRunMiles;
      else if (resolvedType === "tempo" || resolvedType === "intervals")
        rawMiles = qualityMiles;
      else rawMiles = easyMiles;

      const distance = roundHalfMile(rawMiles);
      const pace = paces[paceKey(resolvedType)];
      const duration = round5(distance * pace);

      return { day, type: resolvedType, distance, pace, duration };
    });

    plan.push({ weekNumber, phase, workouts });
  }

  return plan;
}

// --- Preferred-day remapping ------------------------------------------------

/**
 * Day labels emitted by `generateTrainingPlan`. Index = Mon..Sun rank.
 */
const DAY_RANK: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const DAY_RANK_FOR_KEY: Record<DayOfWeek, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Remap each workout's `day` to honor the user's preferred training days.
 *
 * Strategy: greedy nearest-rank matching. For each week we sort the
 * template's days from latest to earliest (so the long run, which always
 * sits on the latest template day, picks first) and assign the closest
 * unused preferred day. This means swapping Sun for Sat in preferences
 * moves the long run to Sat while keeping mid-week workouts in place.
 *
 * If the user has fewer preferred days than the template needs, we leave
 * the plan unchanged — the template's defaults are still a valid schedule.
 * If they have more, only `template.length` of them are used.
 */
export function applyPreferredDays(
  plan: PlanWeek[],
  preferred: DayOfWeek[] | undefined | null,
): PlanWeek[] {
  if (!preferred || preferred.length === 0) return plan;
  if (plan.length === 0) return plan;

  // Each plan week shares the same template-day set, so compute the
  // mapping once and reuse it.
  const templateDays = plan[0].workouts.map((w) => DAY_RANK[w.day] ?? 0);
  if (preferred.length < templateDays.length) return plan;

  const preferredRanks = preferred
    .map((d) => DAY_RANK_FOR_KEY[d])
    .filter((r): r is number => typeof r === "number")
    .sort((a, b) => a - b);
  if (preferredRanks.length < templateDays.length) return plan;

  const dayForIndex = matchPreferredToTemplate(templateDays, preferredRanks);

  // Re-emit each week with remapped `day` labels but every other field
  // (distance, duration, pace, type, phase, weekNumber) preserved.
  return plan.map((week) => ({
    ...week,
    workouts: week.workouts.map((w, i) => ({
      ...w,
      day: rankToLabel(dayForIndex[i] ?? DAY_RANK[w.day] ?? 0),
    })),
  }));
}

/**
 * Greedy nearest-day assignment from template days to preferred days.
 * Processes template days from latest (rank 6 / Sun) to earliest so the
 * long run claims the closest preferred day first.
 *
 * Returns an array same length as `templateDays` where index `i` holds
 * the chosen preferred-day rank for `templateDays[i]`.
 */
function matchPreferredToTemplate(
  templateDays: number[],
  preferredRanks: number[],
): number[] {
  const remaining = new Set(preferredRanks);
  const result = new Array<number>(templateDays.length);

  const order = templateDays
    .map((rank, i) => ({ rank, i }))
    .sort((a, b) => b.rank - a.rank);

  for (const { rank: tRank, i } of order) {
    let bestRank = -1;
    let bestDist = Infinity;
    for (const p of remaining) {
      const dist = Math.abs(p - tRank);
      // On ties, prefer the later day so the long run leans toward the
      // weekend when possible.
      if (dist < bestDist || (dist === bestDist && p > bestRank)) {
        bestDist = dist;
        bestRank = p;
      }
    }
    result[i] = bestRank;
    remaining.delete(bestRank);
  }

  return result;
}

function rankToLabel(rank: number): string {
  switch (rank) {
    case 0:
      return "Mon";
    case 1:
      return "Tue";
    case 2:
      return "Wed";
    case 3:
      return "Thu";
    case 4:
      return "Fri";
    case 5:
      return "Sat";
    default:
      return "Sun";
  }
}

// `formatPace` lives in `paceCalculator`. Re-export so callers that already
// import it from `planGenerator` keep working.
export { formatPace } from "./paceCalculator";
