// Adjust a single PlanWeek so its workouts fit the user's actual calendar
// availability for that week.
//
// Strategy (in order):
//   1. SWAP   — if a workout doesn't fit on its planned day, look for
//                another day where it can run (and shuffle a lower-priority
//                workout into the freed slot if one was there).
//   2. SHORTEN — if no swap works, reduce duration (and distance, holding
//                pace constant) down to a per-type floor so the workout
//                still has training stimulus.
//   3. DROP    — if even the floor doesn't fit and the workout is low
//                priority (easy run), drop it. Higher-priority workouts
//                (long run, tempo, intervals, race) are kept with a
//                warning rather than silently lost; the user gets a note
//                to reschedule manually.
//
// The function is a pure transform: it does not mutate the input. It
// returns the adjusted week plus an `adjustments` log explaining each
// change so the UI can surface "we moved Tuesday's tempo to Thursday".

import type { PlanWeek, Workout, WorkoutType } from "./planGenerator";

// --- Public types -----------------------------------------------------------

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type DayLabel = (typeof DAYS)[number];

/**
 * Per-day available minutes for the week. Days omitted from the map are
 * treated as having no constraint (e.g., the user didn't share that day's
 * calendar) — we won't reshuffle around an unknown day.
 */
export type CalendarAvailability = Partial<Record<DayLabel, number>>;

export type AdjustmentAction =
  | "kept"
  | "swapped"
  | "shortened"
  | "dropped"
  | "downgraded";

export type WorkoutAdjustment = {
  /** Day this adjustment applies to (final day, after any swap). */
  day: DayLabel;
  type: WorkoutType;
  action: AdjustmentAction;
  /** For "swapped": the workout's original day. */
  fromDay?: DayLabel;
  /** Original duration in minutes (set when shortened). */
  originalDuration?: number;
  /** New duration in minutes (set when shortened). */
  newDuration?: number;
  /** For "downgraded": the original workout type. */
  originalType?: WorkoutType;
  reason: string;
};

export type AdjustedPlanWeek = PlanWeek & {
  adjustments: WorkoutAdjustment[];
};

/**
 * Days the user is in a low-intensity window (e.g., the first 48 hours
 * after arriving at a travel destination). On these days, only easy
 * runs are permitted; tempo / intervals get downgraded to easy and long
 * runs get dropped (jet lag + new conditions = bad time for hard
 * efforts). Each entry includes a reason surfaced to the user.
 */
export type EasyOnlyDay = {
  day: DayLabel;
  reason: string;
};

// --- Priority + floors ------------------------------------------------------

/**
 * Higher number = harder to displace. Race day is sacrosanct; long runs
 * and quality (tempo / intervals) are the workouts the plan is built
 * around; easy runs are the buffer we cut first.
 */
const PRIORITY: Record<WorkoutType, number> = {
  race: 100,
  "long run": 80,
  tempo: 60,
  intervals: 60,
  easy: 30,
};

/**
 * Minimum duration (in minutes) we'll shorten a workout to. Below this
 * the workout stops being meaningful, so we drop it (low priority) or
 * keep it as-is and warn (high priority).
 *
 * Race day is `Infinity` so we never touch it.
 */
const MIN_DURATION: Record<WorkoutType, number> = {
  race: Number.POSITIVE_INFINITY,
  "long run": 45,
  tempo: 25,
  intervals: 25,
  easy: 20,
};

// --- Public API -------------------------------------------------------------

/**
 * Adjust a week of training to fit the user's actual calendar availability.
 *
 * @param week         The week emitted by `generateTrainingPlan`.
 * @param availability Minutes free per day (e.g., `{ Mon: 30, Tue: 90 }`).
 *                     Days not present are treated as unconstrained.
 * @param easyOnlyDays Days where only easy runs are permitted (post-travel
 *                     48h windows, active travel days). Empty by default.
 */
export function adjustPlanForWeek(
  week: PlanWeek,
  availability: CalendarAvailability,
  easyOnlyDays: EasyOnlyDay[] = []
): AdjustedPlanWeek {
  // day -> workout map (one workout per day)
  const dayMap = new Map<DayLabel, Workout>();
  for (const w of week.workouts) {
    dayMap.set(w.day as DayLabel, { ...w });
  }

  const adjustments: WorkoutAdjustment[] = [];
  const easyOnlyMap = new Map(easyOnlyDays.map((e) => [e.day, e.reason]));

  // Step 0: travel guard. Before reshuffling around availability, downgrade
  // hard workouts on easy-only days. Long runs are dropped because they
  // shouldn't be replaced by a long easy run on a travel-recovery day.
  for (const [day, w] of [...dayMap.entries()]) {
    const reason = easyOnlyMap.get(day);
    if (!reason) continue;

    if (w.type === "easy" || w.type === "race") continue;

    if (w.type === "long run") {
      dayMap.delete(day);
      adjustments.push({
        day,
        type: w.type,
        action: "dropped",
        originalType: w.type,
        reason: `${reason} — long run dropped (avoid hard efforts during travel recovery)`,
      });
      continue;
    }

    // tempo / intervals → downgrade to easy at easy pace.
    // We keep the duration but recompute distance using a conservative
    // easy-pace estimate (use the workout's pace + 1.5 min/mi as a
    // proxy for easy if we don't have a paces table here).
    const easyPace = w.pace + 1.5;
    const newDistance = roundTenth(w.duration / easyPace);
    dayMap.set(day, {
      ...w,
      type: "easy",
      pace: easyPace,
      distance: newDistance,
    });
    adjustments.push({
      day,
      type: "easy",
      action: "downgraded",
      originalType: w.type,
      reason: `${reason} — ${w.type} downgraded to easy (zone 2 only during travel recovery)`,
    });
  }

  // Step 1: try swaps for any workout that doesn't fit its planned day.
  // Process highest priority first so they get first pick of slots.
  const initialOrder = [...dayMap.entries()].sort(
    (a, b) => PRIORITY[b[1].type] - PRIORITY[a[1].type]
  );

  for (const [day, w] of initialOrder) {
    // The workout might have already moved during this loop; recheck.
    if (dayMap.get(day) !== w) continue;
    if (w.duration <= avail(availability, day)) continue;

    const target = findSwapTarget(day, w, dayMap, availability, easyOnlyMap);
    if (!target) continue;

    const occupant = dayMap.get(target);
    dayMap.set(target, { ...w, day: target });
    if (occupant) {
      dayMap.set(day, { ...occupant, day });
      adjustments.push({
        day,
        type: occupant.type,
        action: "swapped",
        fromDay: target,
        reason: `Swapped with ${w.type} on ${day} to free schedule space`,
      });
    } else {
      dayMap.delete(day);
    }
    adjustments.push({
      day: target,
      type: w.type,
      action: "swapped",
      fromDay: day,
      reason: `Only ${avail(availability, day)} min on ${day}; moved to ${target}`,
    });
  }

  // Step 2: shorten or drop workouts that still don't fit.
  for (const [day, w] of [...dayMap.entries()]) {
    const available = avail(availability, day);
    if (w.duration <= available) continue;

    const minDur = MIN_DURATION[w.type];

    if (available >= minDur && Number.isFinite(minDur)) {
      // Shorten to use the available slot. Pace is fixed, so distance
      // scales with duration.
      const newDuration = Math.round(available);
      const newDistance = roundTenth(newDuration / w.pace);
      dayMap.set(day, {
        ...w,
        duration: newDuration,
        distance: newDistance,
      });
      adjustments.push({
        day,
        type: w.type,
        action: "shortened",
        originalDuration: w.duration,
        newDuration,
        reason: `Reduced from ${w.duration} to ${newDuration} min to fit ${day} (${available} min available)`,
      });
      continue;
    }

    // Doesn't fit even at the floor. Decide drop vs keep based on priority.
    if (PRIORITY[w.type] <= PRIORITY.easy) {
      dayMap.delete(day);
      adjustments.push({
        day,
        type: w.type,
        action: "dropped",
        reason: `Only ${available} min on ${day}; dropped low-priority ${w.type} run`,
      });
    } else {
      // Keep the workout — it's too important to drop. Surface a warning
      // so the UI can prompt the user to reschedule manually.
      adjustments.push({
        day,
        type: w.type,
        action: "kept",
        reason: `Only ${available} min on ${day} — ${w.type} kept as-is, consider rescheduling manually`,
      });
    }
  }

  // Reassemble in canonical day order.
  const newWorkouts: Workout[] = [];
  for (const d of DAYS) {
    const w = dayMap.get(d);
    if (w) newWorkouts.push(w);
  }

  return {
    ...week,
    workouts: newWorkouts,
    adjustments,
  };
}

// --- Helpers ----------------------------------------------------------------

/** Available minutes for a day; unspecified days are unconstrained. */
function avail(a: CalendarAvailability, d: DayLabel): number {
  const v = a[d];
  return v == null ? Number.POSITIVE_INFINITY : v;
}

/**
 * Find the best day to move `workout` to. A target day is valid when:
 *   - it's not the original day,
 *   - the workout fits there,
 *   - any occupant of the target day has lower priority than `workout`,
 *     and that occupant fits on the original day (so we can perform a
 *     two-way swap without breaking anything).
 *
 * Among valid targets, prefer empty days, then nearer days.
 */
function findSwapTarget(
  originalDay: DayLabel,
  workout: Workout,
  dayMap: Map<DayLabel, Workout>,
  availability: CalendarAvailability,
  easyOnlyMap: Map<DayLabel, string>
): DayLabel | null {
  let best: DayLabel | null = null;
  let bestScore = -Infinity;

  for (const cand of DAYS) {
    if (cand === originalDay) continue;
    if (workout.duration > avail(availability, cand)) continue;

    // Don't move a hard workout onto a travel / easy-only day.
    if (easyOnlyMap.has(cand) && workout.type !== "easy") continue;

    const occupant = dayMap.get(cand);
    if (occupant) {
      // Don't displace a workout of equal or higher priority.
      if (PRIORITY[occupant.type] >= PRIORITY[workout.type]) continue;
      // The occupant must fit on the original day after the swap.
      if (occupant.duration > avail(availability, originalDay)) continue;
      // Don't move a hard occupant onto a travel-day origin either.
      if (easyOnlyMap.has(originalDay) && occupant.type !== "easy") continue;
    }

    // Score: prefer empty days, then the closest day to the original.
    const score = (occupant ? 0 : 100) - dayDistance(originalDay, cand);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best;
}

function dayDistance(a: DayLabel, b: DayLabel): number {
  return Math.abs(DAYS.indexOf(a) - DAYS.indexOf(b));
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}
