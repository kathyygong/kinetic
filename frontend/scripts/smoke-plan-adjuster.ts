// Smoke test for adjustPlanForWeek: verifies swap, shorten, and drop paths.

import { generateTrainingPlan, type PlanWeek } from "../lib/planGenerator";
import { adjustPlanForWeek, type CalendarAvailability } from "../lib/planAdjuster";
import { formatPace } from "../lib/paceCalculator";
import type { Goal } from "../lib/types";

function dump(label: string, week: PlanWeek, availability: CalendarAvailability) {
  const adjusted = adjustPlanForWeek(week, availability);
  console.log("--- " + label + " ---");
  console.log("Availability:", availability);
  console.log("Original:");
  for (const w of week.workouts) {
    console.log(
      "  " +
        w.day +
        "  " +
        w.type.padEnd(10) +
        "  " +
        w.distance.toFixed(1).padStart(4) +
        " mi @ " +
        formatPace(w.pace) +
        "  (" +
        w.duration +
        " min)"
    );
  }
  console.log("Adjusted:");
  for (const w of adjusted.workouts) {
    console.log(
      "  " +
        w.day +
        "  " +
        w.type.padEnd(10) +
        "  " +
        w.distance.toFixed(1).padStart(4) +
        " mi @ " +
        formatPace(w.pace) +
        "  (" +
        w.duration +
        " min)"
    );
  }
  console.log("Adjustments:");
  for (const a of adjusted.adjustments) {
    console.log(
      "  [" + a.action + "] " + a.day + "  " + a.type + "  - " + a.reason
    );
  }
  console.log("");
}

const marathon: Goal = {
  goal_type: "race",
  race_distance: "marathon",
  target_date: "2026-11-01",
  experience_level: "intermediate",
  current_prs: { "5k": 22, "10k": 46, half: 100, marathon: 215 },
  weekly_mileage: 25,
};

const plan = generateTrainingPlan(marathon);
const week = plan[3]; // some mid-build week with a long run

// Scenario A: lots of time, nothing to do.
dump("Plenty of time", week, {
  Mon: 60,
  Tue: 90,
  Wed: 120,
  Thu: 90,
  Fri: 60,
  Sat: 240,
  Sun: 240,
});

// Scenario B: Wednesday slammed with meetings, but Thursday is wide open
// → should swap Wed's intervals to a free day (Tue/Thu/Sat).
dump("Wed blocked, Thu free", week, {
  Mon: 60,
  Tue: 90,
  Wed: 15,
  Thu: 180,
  Fri: 60,
  Sat: 240,
  Sun: 240,
});

// Scenario C: Sunday partially blocked → long run shortened, not dropped.
dump("Long-run day half-blocked", week, {
  Mon: 60,
  Tue: 90,
  Wed: 90,
  Thu: 90,
  Fri: 60,
  Sat: 60,
  Sun: 60,
});

// Scenario D: very busy week → easy runs should drop, key workouts kept.
dump("Very busy week", week, {
  Mon: 10,
  Tue: 30,
  Wed: 15,
  Thu: 30,
  Fri: 10,
  Sat: 60,
  Sun: 30,
});

// Scenario E: every day busy and the long run can't fit anywhere
// → long run kept (can't drop) with a manual-reschedule warning.
dump("Long run can't fit anywhere", week, {
  Mon: 30,
  Tue: 30,
  Wed: 30,
  Thu: 30,
  Fri: 30,
  Sat: 30,
  Sun: 30,
});
