// Orchestrate calendar-aware plan adjustment with a runner-friendly
// reasoning summary.
//
// Inputs:
//   - The user's plan week (from generateTrainingPlan)
//   - Per-day calendar availability (from /availability/week)
//   - Travel events (from /travel)
//
// Outputs:
//   - The adjusted week (via adjustPlanForWeek)
//   - A natural-language reasoning summary explaining WHY each change
//     was made, suitable for surfacing in the suggestion card on the
//     dashboard.

import {
  adjustPlanForWeek,
  type AdjustedPlanWeek,
  type CalendarAvailability,
  type DayLabel,
  type EasyOnlyDay,
} from "./planAdjuster";
import { dayLabel, startOfWeek } from "./scheduling";
import type { PlanWeek } from "./planGenerator";

// --- Public types -----------------------------------------------------------

export type TravelEvent = {
  /** ISO date YYYY-MM-DD. Inclusive. */
  start: string;
  /** ISO date YYYY-MM-DD. Exclusive (Google convention). */
  end: string;
  title: string;
  all_day: boolean;
};

export type DayAvailability = {
  date: string; // YYYY-MM-DD
  day: DayLabel;
  minutes: number;
};

export type RefreshResult = {
  adjusted: AdjustedPlanWeek;
  /** True when at least one workout changed vs. the original week. */
  hasChanges: boolean;
  /** Top-line headline for the suggestion card. */
  headline: string;
  /** Bullet-point reasoning lines for the suggestion card. */
  reasoning: string[];
  /** Easy-only days flagged from travel detection. */
  easyOnlyDays: EasyOnlyDay[];
};

// --- Public API -------------------------------------------------------------

/**
 * Run the calendar-aware adjustment pipeline for a single training week.
 *
 * @param week        The plan week to adjust (typically week 1 = "this week").
 * @param weekAvail   Per-day available minutes for the same week, from
 *                    `/availability/week`.
 * @param travel      Travel events from `/travel`.
 * @param weekStart   Monday of the week being adjusted (defaults to current
 *                    week's Monday).
 */
export function refreshWeekWithCalendar(
  week: PlanWeek,
  weekAvail: DayAvailability[],
  travel: TravelEvent[],
  weekStart: Date = startOfWeek()
): RefreshResult {
  const availability = buildAvailabilityMap(weekAvail);
  const easyOnlyDays = buildEasyOnlyDays(travel, weekStart);
  const adjusted = adjustPlanForWeek(week, availability, easyOnlyDays);

  const hasChanges = adjusted.adjustments.length > 0;
  const reasoning = summarize(adjusted.adjustments);
  const headline = hasChanges
    ? `${adjusted.adjustments.length} suggested change${
        adjusted.adjustments.length === 1 ? "" : "s"
      } for this week`
    : "No changes — your plan fits this week";

  return {
    adjusted,
    hasChanges,
    headline,
    reasoning,
    easyOnlyDays,
  };
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
 * Convert travel events into a set of "easy-only" day labels for the
 * given week. The rule is "first 48 hours after arrival back home" plus
 * the day of arrival itself, so the user gets a recovery buffer before
 * resuming hard efforts.
 *
 * Concretely: a travel block from Mon-Fri (Google's exclusive end = Fri)
 * means the user arrives back Fri morning, so Fri + Sat + Sun (3 days
 * covering ~48h) are easy-only. We also flag the entire travel duration
 * itself, since training in transit / new destinations is unpredictable.
 */
function buildEasyOnlyDays(
  travel: TravelEvent[],
  weekStart: Date
): EasyOnlyDay[] {
  const out = new Map<DayLabel, string>();
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push(d);
  }

  for (const t of travel) {
    const start = parseIso(t.start);
    const endExclusive = parseIso(t.end); // Google convention
    // Easy-only window covers travel + ~48h after arrival back.
    const windowEnd = new Date(endExclusive);
    windowEnd.setDate(windowEnd.getDate() + 2); // +2 days after return

    for (const d of weekDays) {
      if (d >= start && d < windowEnd) {
        const label = dayLabel(d);
        const reason = buildTravelReason(t, d, endExclusive);
        // First reason wins; don't overwrite if multiple trips overlap.
        if (!out.has(label)) out.set(label, reason);
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
  if (d < endExclusive) {
    return `Travel: ${title}`;
  }
  // Within 48h of returning home.
  return `Recovery from travel: ${title}`;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function summarize(
  adjustments: AdjustedPlanWeek["adjustments"]
): string[] {
  if (adjustments.length === 0) return [];
  // The reason on each adjustment is already runner-friendly; surface
  // them directly with a leading day + action prefix for scannability.
  return adjustments.map((a) => {
    const prefix = `${a.day} · ${a.action}`;
    return `${prefix} — ${a.reason}`;
  });
}
