// Derive a structured, runner-friendly view of today's workout from the
// stored Goal + generated training plan, optionally adjusted by a backend
// recommendation (proceed / modify / rest).
//
// Today's workout is found by mapping the current weekday to the plan's
// templates. The active week is chosen from the saved plan's `planStart`
// (ISO date) if provided; otherwise we fall back to week 1.

import { getTrainingPacesAtProgress, type TrainingPaces } from "./paceCalculator";
import type { PlanWeek, Workout, WorkoutType } from "./planGenerator";
import type { Goal } from "./types";

export type SegmentKind =
  | "warm-up"
  | "main"
  | "cool-down"
  | "easy"
  | "long run"
  | "race";

export type WorkoutSegment = {
  kind: SegmentKind;
  label: string;
  /** Distance in miles, rounded to the nearest 0.1. */
  distance: number;
  /** Pace in min/mi (decimal). */
  pace: number;
  /** Duration in minutes, rounded to the nearest minute. */
  duration: number;
  /** Optional human-friendly note (e.g., "4–6 × 800m hard"). */
  note?: string;
};

export type TodaysWorkout = {
  /** "rest" if today is an off-day or the recommendation says rest. */
  type: WorkoutType | "rest";
  segments: WorkoutSegment[];
  totalDistance: number;
  totalDuration: number;
  /** Brief summary shown as a headline. */
  headline: string;
  /** Optional contextual note (e.g., "Modified to fit 30 min window"). */
  note?: string;
};

export type RecommendationAction = {
  name: string; // "proceed" | "modify" | "rest" | other
  intensity_modifier: number;
  duration_modifier: number;
};

const DAY_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Today's day-of-week label as used in plan templates. */
export function todayDayLabel(now: Date = new Date()): string {
  return DAY_OF_WEEK[now.getDay()];
}

/**
 * Build today's workout breakdown.
 *
 * @param goal         The user's training goal (from localStorage)
 * @param plan         The generated training plan (or omit to regenerate)
 * @param action       Optional recommendation action to apply
 * @param now          Override "today" for tests
 * @param options      Optional source-of-truth for which plan week is "this
 *                     week". Pass `planStart` (ISO date string or Date) so
 *                     pace progression and template selection track the
 *                     real elapsed time since the plan started. A direct
 *                     `weekIndex` overrides `planStart` and is mainly for
 *                     tests.
 */
export function getTodaysWorkout(
  goal: Goal,
  plan?: PlanWeek[],
  action?: RecommendationAction,
  now: Date = new Date(),
  options?: { planStart?: string | Date; weekIndex?: number }
): TodaysWorkout {
  const weeks = plan ?? [];

  const resolvedWeekIndex = resolveWeekIndex(weeks.length, now, options);
  const week = weeks[resolvedWeekIndex];

  // Recommendation says rest → short-circuit, regardless of plan.
  if (action?.name === "rest") {
    return restWorkout("Rest day · light mobility or easy walk only");
  }

  if (!week) {
    return restWorkout("Rest day");
  }

  const dayLabel = todayDayLabel(now);
  const planned = week.workouts.find((w) => w.day === dayLabel);

  if (!planned) {
    return restWorkout("Rest day · no workout scheduled");
  }

  // Pull all four paces for this point in the plan so warm-up/cool-down can
  // use easy pace regardless of the main set's type.
  const progress =
    weeks.length > 1 ? resolvedWeekIndex / (weeks.length - 1) : 0;
  const paces = getTrainingPacesAtProgress(
    goal.race_distance ?? "5k",
    goal.current_prs,
    goal.experience_level,
    progress
  );

  const adjusted = applyAction(planned, action);
  const segments = decompose(adjusted, paces);
  const totalDistance =
    Math.round(segments.reduce((s, x) => s + x.distance, 0) * 10) / 10;
  const totalDuration = segments.reduce((s, x) => s + x.duration, 0);

  let note: string | undefined;
  if (action?.name === "modify") {
    note = "Modified · reduced volume to match today's readiness";
  }

  return {
    type: adjusted.type,
    segments,
    totalDistance,
    totalDuration,
    headline: headlineFor(adjusted.type),
    note,
  };
}

// --- Helpers ---------------------------------------------------------------

/**
 * Pick the "current" week of the plan.
 *
 * Resolution order (first match wins):
 *   1. Explicit `weekIndex` from caller (tests, manual override).
 *   2. `planStart` ISO string/Date — number of complete weeks elapsed.
 *   3. Default to week 0.
 *
 * The result is clamped to a valid index in `[0, totalWeeks - 1]`. If the
 * plan is empty we return 0 and let the caller treat it as a rest day.
 */
function resolveWeekIndex(
  totalWeeks: number,
  now: Date,
  options?: { planStart?: string | Date; weekIndex?: number }
): number {
  if (totalWeeks <= 0) return 0;
  const maxIdx = totalWeeks - 1;

  if (options?.weekIndex !== undefined && Number.isFinite(options.weekIndex)) {
    return clamp(Math.trunc(options.weekIndex), 0, maxIdx);
  }

  if (options?.planStart) {
    const start =
      typeof options.planStart === "string"
        ? new Date(options.planStart)
        : options.planStart;
    if (!Number.isNaN(start.getTime())) {
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const elapsed = Math.floor((now.getTime() - start.getTime()) / msPerWeek);
      return clamp(elapsed, 0, maxIdx);
    }
  }

  return 0;
}

function restWorkout(headline: string): TodaysWorkout {
  return {
    type: "rest",
    segments: [],
    totalDistance: 0,
    totalDuration: 0,
    headline,
  };
}

function headlineFor(type: WorkoutType): string {
  switch (type) {
    case "easy":
      return "Easy run";
    case "tempo":
      return "Tempo run";
    case "intervals":
      return "Interval session";
    case "long run":
      return "Long run";
    case "race":
      return "Race day";
  }
}

/** Apply a recommendation action to the planned workout (distance only). */
function applyAction(
  planned: Workout,
  action: RecommendationAction | undefined
): Workout {
  if (!action || action.name === "proceed") return planned;
  if (action.name === "modify") {
    const dur = clamp(action.duration_modifier, 0.3, 1);
    const distance = roundHalfMile(planned.distance * dur);
    const duration = Math.round(distance * planned.pace);
    return { ...planned, distance, duration };
  }
  return planned;
}

/**
 * Decompose a workout into runner-facing segments. Tempo and interval
 * workouts get a warm-up + main + cool-down structure at easy pace; easy
 * and long runs are a single segment.
 */
function decompose(workout: Workout, paces: TrainingPaces): WorkoutSegment[] {
  const { type, distance, pace } = workout;

  if (type === "race") {
    return [
      {
        kind: "race",
        label: "Race",
        distance: roundTenth(distance),
        pace,
        duration: Math.round(distance * pace),
      },
    ];
  }

  if (type === "easy") {
    return [
      {
        kind: "easy",
        label: "Easy run",
        distance: roundTenth(distance),
        pace,
        duration: Math.round(distance * pace),
      },
    ];
  }

  if (type === "long run") {
    return [
      {
        kind: "long run",
        label: "Long run",
        distance: roundTenth(distance),
        pace,
        duration: Math.round(distance * pace),
      },
    ];
  }

  // tempo / intervals: warm-up + main + cool-down at easy pace.
  // Warm-up and cool-down are 1 mi each; if the workout is too short to
  // accommodate that, collapse to a single block.
  const WARMUP_MILES = 1;
  const COOLDOWN_MILES = 1;
  const main = distance - WARMUP_MILES - COOLDOWN_MILES;

  if (main < 1) {
    return [
      {
        kind: "main",
        label: type === "tempo" ? "Tempo" : "Intervals",
        distance: roundTenth(distance),
        pace,
        duration: Math.round(distance * pace),
        note: type === "intervals" ? "include short hard pickups" : undefined,
      },
    ];
  }

  const warmup: WorkoutSegment = {
    kind: "warm-up",
    label: "Warm-up",
    distance: WARMUP_MILES,
    pace: paces.easy,
    duration: Math.round(WARMUP_MILES * paces.easy),
  };
  const cooldown: WorkoutSegment = {
    kind: "cool-down",
    label: "Cool-down",
    distance: COOLDOWN_MILES,
    pace: paces.easy,
    duration: Math.round(COOLDOWN_MILES * paces.easy),
  };

  if (type === "tempo") {
    const mainSeg: WorkoutSegment = {
      kind: "main",
      label: "Tempo",
      distance: roundTenth(main),
      pace,
      duration: Math.round(main * pace),
      note: "comfortably hard, sustained effort",
    };
    return [warmup, mainSeg, cooldown];
  }

  // intervals
  const reps = pickReps(main);
  const repMiles = roundTenth(main / reps);
  const mainSeg: WorkoutSegment = {
    kind: "main",
    label: "Intervals",
    distance: roundTenth(main),
    pace,
    duration: Math.round(main * pace),
    note: `${reps} × ${(repMiles * 1609).toFixed(0)}m hard, jog recovery`,
  };
  return [warmup, mainSeg, cooldown];
}

function pickReps(mainMiles: number): number {
  // 4-8 reps, sized so each rep is 0.25-0.6 mi (~400-1000m).
  if (mainMiles < 1.5) return 4;
  if (mainMiles < 2.5) return 5;
  if (mainMiles < 3.5) return 6;
  if (mainMiles < 4.5) return 7;
  return 8;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function roundHalfMile(n: number): number {
  return Math.max(0.5, Math.round(n * 2) / 2);
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}
