// Build a calendar-aware training plan covering ALL weeks.
//
// This is the central function that ties together:
//   - The deterministic base plan from `generateTrainingPlan(goal)`
//   - Per-day calendar availability fetched from `/availability/week`
//   - Travel events from `/travel`
//
// Result is the full plan with each week independently adjusted, plus
// per-week summaries of what changed and why. Both the dashboard (for
// "this week") and the plan page (for the long-range view) render from
// the saved output of this function.

import {
  adjustPlanForWeek,
  type AdjustedPlanWeek,
  type CalendarAvailability,
  type DayLabel,
  type EasyOnlyDay,
  type WorkoutAdjustment,
} from "./planAdjuster";
import type { PlanWeek } from "./planGenerator";
import type { DayAvailability, TravelEvent } from "./planRefresh";
import type { SavedEasyOnlyDay } from "./storage";

// --- Public types -----------------------------------------------------------

export type WeekChange = {
  /** 0-indexed week within the plan. */
  weekIndex: number;
  /** Adjustments returned by adjustPlanForWeek. */
  adjustments: WorkoutAdjustment[];
  /** Easy-only days flagged for travel inside this week. */
  easyOnlyDays: EasyOnlyDay[];
};

export type CalendarAwarePlan = {
  /** Adjusted plan weeks, week 0 = `planStart`'s Monday. */
  weeks: PlanWeek[];
  /** Per-week change summaries. */
  perWeek: WeekChange[];
  /** Top-level reasoning bullets (with [W{n}] prefix when multi-week). */
  reasoning: string[];
  /** Easy-only days across all weeks, with weekIndex attached. */
  easyOnlyDays: SavedEasyOnlyDay[];
  /** True when at least one workout differs from the base plan. */
  hasChanges: boolean;
  /** Total number of adjustments across the plan. */
  totalChanges: number;
};

// --- Public API -------------------------------------------------------------

/**
 * Bucket a flat per-day availability array into per-week arrays.
 *
 * The backend can return up to 120 days at a time; this helper splits them
 * into 7-day windows aligned with `planStart` (Monday of week 0). Missing
 * days default to a "fully free" entry so the adjuster still has something
 * to work with — better than dropping the week silently.
 */
export function bucketDaysByWeek(
  days: DayAvailability[],
  planStart: Date,
  weekCount: number
): DayAvailability[][] {
  // Index by ISO date for O(1) lookup.
  const byDate = new Map<string, DayAvailability>();
  for (const d of days) byDate.set(d.date, d);

  const out: DayAvailability[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const weekStart = addDays(planStart, w * 7);
    const week: DayAvailability[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const iso = isoDate(d);
      const found = byDate.get(iso);
      if (found) {
        week.push(found);
      } else {
        // Far-future day with no calendar data — assume the user is free
        // for the full 6am-10pm window (16 hours = 960 min).
        week.push({
          date: iso,
          day: dayLabelFromDate(d),
          minutes: 960,
        });
      }
    }
    out.push(week);
  }
  return out;
}

/**
 * Run the calendar-aware adjustment pipeline for the entire plan.
 *
 * @param basePlan         Output of `generateTrainingPlan(goal)`.
 * @param weekAvailabilities  One availability array per week, in order.
 *                            Use `bucketDaysByWeek` to build this.
 * @param travel            Travel events from `/travel`.
 * @param planStart         Monday of week 0 (typically `startOfWeek()`).
 */
export function buildCalendarAwarePlan(
  basePlan: PlanWeek[],
  weekAvailabilities: DayAvailability[][],
  travel: TravelEvent[],
  planStart: Date
): CalendarAwarePlan {
  const weeks: PlanWeek[] = [];
  const perWeek: WeekChange[] = [];
  const allReasoning: string[] = [];
  const allEasyOnly: SavedEasyOnlyDay[] = [];
  let total = 0;

  for (let i = 0; i < basePlan.length; i++) {
    const baseWeek = basePlan[i];
    const weekStart = addDays(planStart, i * 7);
    const weekAvail = weekAvailabilities[i] ?? [];
    const availability = buildAvailabilityMap(weekAvail);
    const easyOnlyDays = easyOnlyDaysForWeek(travel, weekStart);

    const adjusted: AdjustedPlanWeek = adjustPlanForWeek(
      baseWeek,
      availability,
      easyOnlyDays
    );

    weeks.push(stripAdjustmentsField(adjusted));
    perWeek.push({
      weekIndex: i,
      adjustments: adjusted.adjustments,
      easyOnlyDays,
    });

    for (const d of easyOnlyDays) {
      allEasyOnly.push({ weekIndex: i, day: d.day, reason: d.reason });
    }
    for (const a of adjusted.adjustments) {
      const prefix =
        basePlan.length > 1
          ? `[W${i + 1}] ${a.day} · ${a.action}`
          : `${a.day} · ${a.action}`;
      allReasoning.push(`${prefix} — ${a.reason}`);
      total += 1;
    }
  }

  return {
    weeks,
    perWeek,
    reasoning: allReasoning,
    easyOnlyDays: allEasyOnly,
    hasChanges: total > 0,
    totalChanges: total,
  };
}

/**
 * Compare two weeks of workouts. Returns true when they differ in any
 * meaningful way (added/removed day, different type, distance, duration,
 * or pace). Used by the dashboard to decide whether to surface a
 * suggestion vs. silently keep the saved plan.
 */
export function weeksDiffer(a: PlanWeek, b: PlanWeek): boolean {
  if (a.workouts.length !== b.workouts.length) return true;
  for (let i = 0; i < a.workouts.length; i++) {
    const wa = a.workouts[i];
    const wb = b.workouts[i];
    if (wa.day !== wb.day) return true;
    if (wa.type !== wb.type) return true;
    if (Math.abs(wa.duration - wb.duration) > 0.5) return true;
    if (Math.abs(wa.distance - wb.distance) > 0.05) return true;
  }
  return false;
}

// --- Helpers ----------------------------------------------------------------

function buildAvailabilityMap(
  weekAvail: DayAvailability[]
): CalendarAvailability {
  const out: CalendarAvailability = {};
  for (const a of weekAvail) {
    out[a.day] = a.minutes;
  }
  return out;
}

/**
 * Easy-only days within a single 7-day week starting at `weekStart`.
 *
 * The window covers the entire travel duration plus +2 days after Google's
 * exclusive end date — that captures the day of arrival back home plus a
 * 48-hour recovery buffer.
 */
function easyOnlyDaysForWeek(
  travel: TravelEvent[],
  weekStart: Date
): EasyOnlyDay[] {
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  const out = new Map<DayLabel, string>();
  for (const t of travel) {
    const start = parseIso(t.start);
    const endExclusive = parseIso(t.end);
    const windowEnd = addDays(endExclusive, 2);
    for (const d of weekDays) {
      if (d >= start && d < windowEnd) {
        const label = dayLabelFromDate(d);
        if (!out.has(label)) {
          out.set(label, buildTravelReason(t, d, endExclusive));
        }
      }
    }
  }

  return [...out.entries()].map(([day, reason]) => ({ day, reason }));
}

function buildTravelReason(
  t: TravelEvent,
  d: Date,
  endExclusive: Date
): string {
  const title = t.title || "travel";
  if (d < endExclusive) return `Travel: ${title}`;
  return `Recovery from travel: ${title}`;
}

/** Drop the `adjustments` field from AdjustedPlanWeek so the saved plan
 * matches the PlanWeek shape (the per-week info is kept on `perWeek`). */
function stripAdjustmentsField(w: AdjustedPlanWeek): PlanWeek {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adjustments: _adjustments, ...rest } = w;
  return rest;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayLabelFromDate(d: Date): DayLabel {
  return DAY_LABELS[d.getDay()] as DayLabel;
}
