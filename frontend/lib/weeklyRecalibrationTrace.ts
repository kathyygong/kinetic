// Build the recalibration trace payload sent to `POST /weekly-reasoning`.
//
// The backend reasoner only explains what already happened — it never
// changes the plan. So we hand it a structured "before / after" view of
// the current week, derived from:
//
//   - The deterministic base plan from `generateTrainingPlan(goal)`
//   - The saved calendar-aware plan from `SavedPlan.weeks[0]`
//   - Reasoning strings + easy-only days from the same `SavedPlan`
//   - A short rolling readiness summary from `readinessStorage`
//
// The resulting trace has stable keys matching the backend's spec
// (original_week_plan, adjusted_week_plan, calendar_changes,
// recovery_trends, preserved_workouts, modified_workouts,
// dropped_workouts). All values come from real local state — nothing is
// invented.

import type { PlanWeek, Workout } from "./planGenerator";
import type { SavedEasyOnlyDay } from "./storage";
import {
  getReadinessBaselines,
  getReadinessLog,
  isoDateKey,
  type ManualReadiness,
} from "./readinessStorage";

// --- Public types -----------------------------------------------------------

export type WorkoutLabel = {
  day: string;
  name: string;
};

export type WorkoutChange = WorkoutLabel & {
  /** Optional adjuster-provided reason. */
  reason?: string;
};

export type WeeklyRecalibrationTrace = {
  original_week_plan: WorkoutLabel[];
  adjusted_week_plan: WorkoutLabel[];
  calendar_changes: string[];
  recovery_trends: string[];
  preserved_workouts: WorkoutLabel[];
  modified_workouts: WorkoutChange[];
  dropped_workouts: WorkoutLabel[];
};

export type BuildTraceInput = {
  originalWeek: PlanWeek;
  adjustedWeek: PlanWeek;
  /** SavedPlan.reasoning bullets ("Tue · shortened — Calendar only…"). */
  reasoning: string[];
  /** Easy-only days for the current (week 0) of the saved plan. */
  easyOnlyDays: SavedEasyOnlyDay[];
  /** Optional override; defaults to deriving from local readiness log. */
  recoveryTrends?: string[];
};

// --- Public API -------------------------------------------------------------

/**
 * Build the recalibration trace for the current week.
 *
 * Diffs the deterministic base week against the calendar-aware adjusted
 * week, classifies each day's workout as preserved / modified / dropped,
 * and attaches calendar context plus a short readiness summary.
 */
export function buildWeeklyRecalibrationTrace(
  input: BuildTraceInput,
): WeeklyRecalibrationTrace {
  const { originalWeek, adjustedWeek, reasoning, easyOnlyDays } = input;

  // Index workouts by day for O(1) lookup. PlanWeek already enforces
  // one workout per day, so we don't need to handle collisions.
  const originalByDay = new Map<string, Workout>();
  for (const w of originalWeek.workouts) originalByDay.set(w.day, w);
  const adjustedByDay = new Map<string, Workout>();
  for (const w of adjustedWeek.workouts) adjustedByDay.set(w.day, w);

  // Pull reasons keyed by `Day · action` so we can attach them to the
  // matching modified entry. The string format produced by planService
  // is `"Tue · shortened — …reason…"`.
  const reasonsByDay = parseReasonsByDay(reasoning);

  const preserved: WorkoutLabel[] = [];
  const modified: WorkoutChange[] = [];
  const dropped: WorkoutLabel[] = [];

  // Walk every day that appears in EITHER plan so we catch drops and
  // additions (additions are rare today but easy to support).
  const allDays = new Set<string>([
    ...originalByDay.keys(),
    ...adjustedByDay.keys(),
  ]);

  for (const day of allDays) {
    const orig = originalByDay.get(day);
    const adj = adjustedByDay.get(day);

    if (orig && !adj) {
      dropped.push({ day, name: workoutName(orig) });
      continue;
    }
    if (!orig && adj) {
      // Net-new workout (rare). Treat as a modification with a synthetic
      // reason so the explainer can mention it.
      modified.push({
        day,
        name: `(added) ${workoutName(adj)}`,
        reason: reasonsByDay.get(day),
      });
      continue;
    }
    if (orig && adj) {
      if (workoutsEqual(orig, adj)) {
        preserved.push({ day, name: workoutName(orig) });
      } else {
        modified.push({
          day,
          name: `${workoutName(orig)} → ${workoutName(adj)}`,
          reason: reasonsByDay.get(day),
        });
      }
    }
  }

  return {
    original_week_plan: originalWeek.workouts.map((w) => ({
      day: w.day,
      name: workoutName(w),
    })),
    adjusted_week_plan: adjustedWeek.workouts.map((w) => ({
      day: w.day,
      name: workoutName(w),
    })),
    calendar_changes: easyOnlyDays.map((d) => `${d.day}: ${d.reason}`),
    recovery_trends:
      input.recoveryTrends ?? buildRecoveryTrendsFromStorage(),
    preserved_workouts: sortByDayOfWeek(preserved),
    modified_workouts: sortByDayOfWeek(modified) as WorkoutChange[],
    dropped_workouts: sortByDayOfWeek(dropped),
  };
}

/**
 * Cheap predicate for the "is there anything to explain?" check. We
 * intentionally only consider modifications and drops as "changes":
 * preserving every workout is the no-recalibration case, even when the
 * easyOnlyDays list is non-empty (the trace will note them but there's
 * nothing for the UI to surface as an adaptation).
 */
export function hasRecalibrationChanges(
  trace: WeeklyRecalibrationTrace,
): boolean {
  return (
    trace.modified_workouts.length > 0 || trace.dropped_workouts.length > 0
  );
}

// --- Helpers ----------------------------------------------------------------

const DAY_ORDER: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function sortByDayOfWeek<T extends { day: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99),
  );
}

/**
 * Render a workout into a short human label like "Tempo · 6 mi · 45 min".
 * Rest days fall back to "Rest".
 */
function workoutName(w: Workout): string {
  const parts: string[] = [];
  parts.push(prettyType(w.type));
  if (w.distance > 0) parts.push(`${roundTenth(w.distance)} mi`);
  if (w.duration > 0) parts.push(`${Math.round(w.duration)} min`);
  return parts.join(" · ");
}

function prettyType(t: string): string {
  // "long run" is already two words; capitalise each. Others are
  // single tokens.
  return t
    .split(" ")
    .map((s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Two workouts are "equal" when their type, distance and duration are
 * indistinguishable to the runner. The thresholds match planService's
 * `weeksDiffer` so we classify days the same way the dashboard does.
 */
function workoutsEqual(a: Workout, b: Workout): boolean {
  if (a.type !== b.type) return false;
  if (Math.abs(a.duration - b.duration) > 0.5) return false;
  if (Math.abs(a.distance - b.distance) > 0.05) return false;
  return true;
}

/**
 * Parse the saved-plan reasoning bullets into a day -> reason map.
 *
 * Source format: `"Tue · shortened — Calendar only has 30 min on Tue"`
 * (single-week) or `"[W1] Tue · shortened — …"` (multi-week). We don't
 * need the week prefix for the current week because the page always
 * passes week 0's reasoning here.
 */
function parseReasonsByDay(lines: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines) {
    // Strip optional [Wn] prefix.
    const stripped = line.replace(/^\[W\d+\]\s*/, "");
    const dashIdx = stripped.indexOf("—");
    if (dashIdx === -1) continue;
    const left = stripped.slice(0, dashIdx).trim();
    const right = stripped.slice(dashIdx + 1).trim();
    // `left` is "Tue · shortened"; we only care about the day.
    const day = left.split("·")[0].trim();
    if (!day) continue;
    // First reason wins; the adjuster typically emits one line per day.
    if (!out.has(day)) out.set(day, right);
  }
  return out;
}

/**
 * Compare the last 3 days of readiness entries against the rolling
 * 30-day baseline and emit a couple of plain-English trend lines.
 *
 * Stays conservative: we only mention a metric when (a) the user has
 * enough recent entries to compare, and (b) the deviation is large
 * enough to be meaningful. Returns `[]` when there's nothing to say,
 * which the backend treats as "no recovery context" and the explainer
 * falls back to talking about calendar changes only.
 */
function buildRecoveryTrendsFromStorage(): string[] {
  if (typeof window === "undefined") return [];

  const log = getReadinessLog();
  const baselines = getReadinessBaselines(30, log);
  const recent = lastNEntries(log, 3);
  if (recent.length === 0) return [];

  const trends: string[] = [];

  // HRV trending below baseline → fatigue signal.
  if (baselines.hrv !== undefined) {
    const recentHrv = recent
      .map((e) => e.hrv)
      .filter((v): v is number => typeof v === "number");
    if (recentHrv.length >= 2) {
      const avg = mean(recentHrv);
      const deviation = avg - baselines.hrv;
      if (deviation <= -3) {
        trends.push(
          `HRV trending below baseline (${Math.round(avg)} vs ${Math.round(
            baselines.hrv,
          )} avg)`,
        );
      } else if (deviation >= 3) {
        trends.push(
          `HRV trending above baseline (${Math.round(avg)} vs ${Math.round(
            baselines.hrv,
          )} avg)`,
        );
      }
    }
  }

  // Short sleep is a strong recalibration driver.
  if (baselines.sleep_hours !== undefined) {
    const recentSleep = recent
      .map((e) => e.sleep_hours)
      .filter((v): v is number => typeof v === "number");
    if (recentSleep.length >= 2) {
      const avg = mean(recentSleep);
      if (avg < baselines.sleep_hours - 0.5) {
        trends.push(
          `Sleep averaging ${avg.toFixed(1)}h, below ${baselines.sleep_hours.toFixed(1)}h baseline`,
        );
      }
    }
  }

  // Elevated fatigue / soreness self-reports.
  const recentFatigue: number[] = recent
    .map((e) => e.fatigue_level)
    .filter((v): v is NonNullable<typeof v> => v !== undefined);
  if (recentFatigue.length >= 2 && mean(recentFatigue) >= 4) {
    trends.push("Self-reported fatigue elevated over the last few days");
  }

  return trends;
}

function lastNEntries(
  log: ReturnType<typeof getReadinessLog>,
  n: number,
): ManualReadiness[] {
  const today = isoDateKey();
  return Object.values(log.entries)
    .filter((e) => e.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n);
}

function mean(arr: number[]): number {
  let s = 0;
  for (const n of arr) s += n;
  return s / arr.length;
}
