// Persistent workout log + mid-plan progress derivation.
//
// Stores an entry per workout the runner has acted on (accepted or
// skipped) so the Plan page can show meaningful "build so far" stats
// across sessions. Tied to the saved plan via `goalSig` — when the
// goal changes the log is automatically reset so stale entries don't
// pollute a new plan.
//
// All helpers are SSR-safe (no-op when window is undefined).

import {
  generateTrainingPlan,
  type PlanWeek,
} from "./planGenerator";
import type { SavedPlan } from "./storage";
import type { Goal } from "./types";

// --- Storage primitives -----------------------------------------------------

const LOG_STORAGE_KEY = "kinetic_workout_log";

export type WorkoutLogStatus = "completed" | "skipped";

export type WorkoutLogEntry = {
  /** Plan week (1-indexed, matches `PlanWeek.weekNumber`). */
  weekNumber: number;
  /** Day label as used in the plan templates: "Mon", "Tue", ... */
  day: string;
  status: WorkoutLogStatus;
  /** ISO date the workout was scheduled for (yyyy-mm-dd). */
  scheduledDate: string;
  /** ISO timestamp when the runner logged this entry. */
  loggedAt: string;
  /**
   * Whether the runner accepted the decision engine's recovery-aware
   * adjustment for this slot. Optional for backward compatibility with
   * entries logged before the two-step confirmation flow shipped.
   *  - `true`  → ran the engine-adjusted workout
   *  - `false` → kept the original plan workout
   *  - `undefined` → unknown (legacy entry)
   */
  acceptedAdjustment?: boolean;
};

type WorkoutLog = {
  /** `goalSignature(goal)` from `lib/storage` — invalidates on goal change. */
  goalSig: string;
  entries: WorkoutLogEntry[];
};

/** Stable id for a workout slot in the plan. */
export function workoutKey(weekNumber: number, day: string): string {
  return `${weekNumber}:${day}`;
}

/**
 * Read the workout log for the given goal signature. If the stored log
 * was saved against a different goal, returns an empty array — callers
 * should treat that as "fresh start". The on-disk log is left in place
 * until the next write, which clears it.
 */
export function getWorkoutLog(goalSig: string): WorkoutLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkoutLog;
    if (!parsed || parsed.goalSig !== goalSig) return [];
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * Append or replace an entry for the given (week, day) slot. Idempotent
 * — re-logging the same slot updates the prior entry rather than
 * duplicating it.
 */
export function logWorkout(
  goalSig: string,
  entry: WorkoutLogEntry,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getWorkoutLog(goalSig);
    const key = workoutKey(entry.weekNumber, entry.day);
    const next = existing.filter(
      (e) => workoutKey(e.weekNumber, e.day) !== key,
    );
    next.push(entry);
    const log: WorkoutLog = { goalSig, entries: next };
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // ignore quota / private-mode errors
  }
}

/** Drop the persisted log entirely (used when the goal changes). */
export function clearWorkoutLog(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// --- Convenience: log today's workout from saved plan -----------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Resolve the (weekNumber, day, scheduledDate) tuple for `now` against a
 * saved plan, then persist a status entry. Returns the entry that was
 * written, or null if `now` falls outside the plan window or no workout
 * is scheduled for that day.
 */
export function logTodayFromPlan(
  status: WorkoutLogStatus,
  goalSig: string,
  savedPlan: SavedPlan,
  now: Date = new Date(),
  options?: { acceptedAdjustment?: boolean },
): WorkoutLogEntry | null {
  const start = new Date(savedPlan.planStart);
  if (Number.isNaN(start.getTime())) return null;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weekIdx = Math.floor((now.getTime() - start.getTime()) / msPerWeek);
  if (weekIdx < 0 || weekIdx >= savedPlan.weeks.length) return null;

  const week = savedPlan.weeks[weekIdx];
  const day = DAY_LABELS[now.getDay()];
  const planned = week.workouts.find((w) => w.day === day);
  if (!planned) return null;

  const entry: WorkoutLogEntry = {
    weekNumber: week.weekNumber,
    day,
    status,
    scheduledDate: isoDate(now),
    loggedAt: now.toISOString(),
    ...(typeof options?.acceptedAdjustment === "boolean"
      ? { acceptedAdjustment: options.acceptedAdjustment }
      : {}),
  };
  logWorkout(goalSig, entry);
  return entry;
}

/**
 * Look up the persisted log entry (if any) for the workout slot that
 * `now` falls on within the saved plan. Returns null when `now` is
 * outside the plan window, no workout is scheduled, or no entry has
 * been logged yet for that slot. Lets the dashboard hydrate the
 * confirmation UI on page load instead of starting from "pending"
 * after a reload.
 */
export function findTodayLogEntry(
  goalSig: string,
  savedPlan: SavedPlan,
  now: Date = new Date(),
): WorkoutLogEntry | null {
  const start = new Date(savedPlan.planStart);
  if (Number.isNaN(start.getTime())) return null;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weekIdx = Math.floor((now.getTime() - start.getTime()) / msPerWeek);
  if (weekIdx < 0 || weekIdx >= savedPlan.weeks.length) return null;
  const week = savedPlan.weeks[weekIdx];
  const day = DAY_LABELS[now.getDay()];
  const planned = week.workouts.find((w) => w.day === day);
  if (!planned) return null;
  const entries = getWorkoutLog(goalSig);
  return (
    entries.find(
      (e) => e.weekNumber === week.weekNumber && e.day === day,
    ) ?? null
  );
}

// --- Adaptation detection ---------------------------------------------------

/**
 * Diff the saved (calendar-adjusted) plan against the deterministic base
 * plan we'd generate from the goal alone, and return the set of workout
 * keys that differ. A workout is "adapted" if its day's planned workout
 * has changed type / distance / duration, or if the slot itself was
 * moved (present in saved but not in base, or vice versa).
 */
export function buildAdaptationSet(
  goal: Goal,
  savedPlan: PlanWeek[],
): Set<string> {
  const base = generateTrainingPlan(goal);
  const set = new Set<string>();

  for (let i = 0; i < savedPlan.length; i++) {
    const baseWeek = base[i];
    const savedWeek = savedPlan[i];
    if (!savedWeek) continue;

    if (!baseWeek) {
      // No matching base week — treat every workout as adapted.
      for (const w of savedWeek.workouts) {
        set.add(workoutKey(savedWeek.weekNumber, w.day));
      }
      continue;
    }

    // Saved-side: changed or net-new.
    for (const w of savedWeek.workouts) {
      const baseW = baseWeek.workouts.find((x) => x.day === w.day);
      if (
        !baseW ||
        baseW.type !== w.type ||
        baseW.distance !== w.distance ||
        baseW.duration !== w.duration
      ) {
        set.add(workoutKey(savedWeek.weekNumber, w.day));
      }
    }
    // Base-side: workouts the adapter dropped or moved.
    for (const baseW of baseWeek.workouts) {
      const savedW = savedWeek.workouts.find((x) => x.day === baseW.day);
      if (!savedW) {
        set.add(workoutKey(savedWeek.weekNumber, baseW.day));
      }
    }
  }

  return set;
}

// --- Mid-plan progress ------------------------------------------------------

export type MidPlanProgress = {
  /** 0-indexed current week (clamped to plan length - 1). */
  weekIndex: number;
  /** 1-indexed for display, e.g. "Week 7 of 12". */
  weekNumber: number;
  /** Total weeks in the plan. */
  weeksTotal: number;

  /** Sum of week-1 distances, rounded. */
  startWeekMileage: number;
  /** Sum of current week's distances, rounded. */
  currentWeekMileage: number;
  /** Delta in miles (current − start), rounded. */
  mileageDelta: number;

  /** Longest single run in week 1, rounded. */
  startLongRun: number;
  /** Longest single run in the current week, rounded. */
  currentLongRun: number;
  /** Delta in miles, rounded. */
  longRunDelta: number;

  /** Workouts whose scheduled date is on or before `now`. */
  workoutsDue: number;
  /** Of those, how many are logged as completed. */
  workoutsCompleted: number;
  /** Whole-number percentage (0–100). 0 when no workouts are due yet. */
  consistencyPct: number;

  /** Completed workouts that the calendar-aware adapter modified. */
  workoutsSaved: number;
};

/**
 * Compute the runner's "build so far" snapshot. Returns null when the
 * plan is too short or `now` falls outside the plan window — the card
 * caller should hide the UI in that case.
 *
 * `plan` is the array of weeks to summarise (saved or fallback) and
 * `planStartIso` is the ISO date of week 1's Monday. The workout log
 * entries are filtered to the goal already (callers pass the result
 * of `getWorkoutLog(goalSig)`).
 */
export function buildMidPlanProgress(
  goal: Goal,
  plan: PlanWeek[],
  planStartIso: string,
  log: WorkoutLogEntry[],
  now: Date = new Date(),
): MidPlanProgress | null {
  if (plan.length < 2) return null;

  const start = new Date(planStartIso);
  if (Number.isNaN(start.getTime())) return null;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const elapsedWeeks = Math.floor(
    (now.getTime() - start.getTime()) / msPerWeek,
  );
  const weekIndex = clamp(elapsedWeeks, 0, plan.length - 1);

  // Mileage: week 1 (index 0) vs current week.
  const startWeekMileage = Math.round(weekTotalMiles(plan[0]));
  const currentWeekMileage = Math.round(weekTotalMiles(plan[weekIndex]));
  const mileageDelta = currentWeekMileage - startWeekMileage;

  // Long run: max distance among "long run" workouts in each week,
  // falling back to the longest non-race run if no long-run slot exists.
  // Race day is excluded so the build metric reflects training, not the
  // goal race itself.
  const startLongRun = Math.round(longestRunInWeek(plan[0]));
  const currentLongRun = Math.round(longestRunInWeek(plan[weekIndex]));
  const longRunDelta = currentLongRun - startLongRun;

  // Consistency: sum of workouts whose scheduled date is on or before
  // `now`. We only count workouts that have come due — future ones don't
  // bring down the percentage.
  const completedKeys = new Set<string>();
  // Workouts where the runner accepted the engine's recovery-aware
  // adjustment AND finished the session. Tracked separately from
  // calendar-adapter changes so a "saved" session can be either kind.
  const engineAcceptedKeys = new Set<string>();
  for (const e of log) {
    if (e.status === "completed") {
      const key = workoutKey(e.weekNumber, e.day);
      completedKeys.add(key);
      if (e.acceptedAdjustment === true) engineAcceptedKeys.add(key);
    }
  }
  const adaptedKeys = buildAdaptationSet(goal, plan);

  let workoutsDue = 0;
  let workoutsCompleted = 0;
  let workoutsSaved = 0;
  for (let wi = 0; wi <= weekIndex; wi++) {
    const w = plan[wi];
    for (const wk of w.workouts) {
      const due = workoutScheduledDate(start, wi, wk.day);
      if (due.getTime() > now.getTime()) continue;
      workoutsDue += 1;
      const key = workoutKey(w.weekNumber, wk.day);
      if (completedKeys.has(key)) {
        workoutsCompleted += 1;
        // A workout counts as "saved" whenever the session the runner
        // actually did was different from the deterministic base — that
        // can come from the calendar adapter (saved plan diverged from
        // base) OR the runner accepting the engine's recovery tweak.
        if (adaptedKeys.has(key) || engineAcceptedKeys.has(key)) {
          workoutsSaved += 1;
        }
      }
    }
  }

  const consistencyPct =
    workoutsDue === 0
      ? 0
      : Math.round((workoutsCompleted / workoutsDue) * 100);

  return {
    weekIndex,
    weekNumber: plan[weekIndex].weekNumber,
    weeksTotal: plan.length,
    startWeekMileage,
    currentWeekMileage,
    mileageDelta,
    startLongRun,
    currentLongRun,
    longRunDelta,
    workoutsDue,
    workoutsCompleted,
    consistencyPct,
    workoutsSaved,
  };
}

// --- Internal helpers -------------------------------------------------------

function weekTotalMiles(week: PlanWeek): number {
  return week.workouts.reduce((sum, w) => sum + w.distance, 0);
}

function longestRunInWeek(week: PlanWeek): number {
  const longRuns = week.workouts
    .filter((w) => w.type === "long run")
    .map((w) => w.distance);
  if (longRuns.length > 0) return Math.max(...longRuns);
  // Fallback: longest non-race run. Race day is excluded — the long-run
  // build is about the user's *training* long run, not the goal race.
  return Math.max(
    0,
    ...week.workouts.filter((w) => w.type !== "race").map((w) => w.distance),
  );
}

const DAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Resolve (planStart, weekIndex, dayLabel) → calendar Date. */
function workoutScheduledDate(
  planStart: Date,
  weekIndex: number,
  dayLabel: string,
): Date {
  const offset = DAY_INDEX[dayLabel] ?? 0;
  const d = new Date(planStart);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + weekIndex * 7 + offset);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// --- Adaptive aggressiveness ------------------------------------------------

/**
 * How much weight to give recent history when computing acceptance rate.
 * 14 days ≈ two weeks of training, which is long enough to smooth out a
 * single bad-data day but short enough to react when habits change
 * (e.g., an injured runner suddenly starts accepting every easing).
 */
const ADJUSTMENT_LOOKBACK_ENTRIES = 14;

/**
 * Minimum number of "engine-offered an adjustment" data points before
 * we trust the acceptance rate enough to bias the engine. Below this
 * we return 0 (no bias) so a single rejection on day 2 doesn't lock the
 * engine into permanent "proceed" mode.
 */
const ADJUSTMENT_MIN_SAMPLES = 3;

/**
 * Compute how much the runner's history pulls future recommendations
 * toward the original plan. The engine offers an adjustment only on
 * "modify" / "rest" days — on those days each entry carries an
 * `acceptedAdjustment` boolean (true = ran the adjusted workout,
 * false = stuck with the original).
 *
 * Rejection rate over recent history → bias in [0, 1]:
 *   0   → user accepts (or has never been offered an adjustment) →
 *          no bias, engine behaves as designed
 *   1   → user rejected every recent adjustment → maximum bias toward
 *          the planned workout (engine still recommends adjustments
 *          when readiness is genuinely poor, but the bar is higher)
 *
 * Returns 0 when there are fewer than `ADJUSTMENT_MIN_SAMPLES` data
 * points, so new accounts and lightly-used logs never see surprise
 * "soften" behaviour.
 */
export function getAdjustmentBiasTowardOriginal(
  log: WorkoutLogEntry[],
): number {
  // Walk the log newest → oldest so the most recent decisions dominate
  // when the cap kicks in.
  const sorted = [...log].sort((a, b) =>
    a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0,
  );

  let accepted = 0;
  let rejected = 0;
  for (const e of sorted) {
    if (typeof e.acceptedAdjustment !== "boolean") continue;
    if (e.acceptedAdjustment) accepted += 1;
    else rejected += 1;
    if (accepted + rejected >= ADJUSTMENT_LOOKBACK_ENTRIES) break;
  }

  const total = accepted + rejected;
  if (total < ADJUSTMENT_MIN_SAMPLES) return 0;

  return clamp(rejected / total, 0, 1);
}

