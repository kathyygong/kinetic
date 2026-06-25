// Smoke test for the weekly recalibration trace builder.
//
// Verifies that the local diff between an original and adjusted week
// classifies workouts correctly (preserved / modified / dropped),
// attaches the reasoning string to the matching modified entry, and
// surfaces calendar context. Run with `npx tsx scripts/smoke-weekly-recalibration.ts`.

import { buildWeeklyRecalibrationTrace, hasRecalibrationChanges } from "../lib/weeklyRecalibrationTrace";
import type { PlanWeek } from "../lib/planGenerator";

const originalWeek: PlanWeek = {
  weekNumber: 1,
  phase: "build",
  workouts: [
    { day: "Mon", type: "easy", distance: 4, duration: 35, pace: 540 },
    { day: "Tue", type: "tempo", distance: 6, duration: 45, pace: 360 },
    { day: "Thu", type: "easy", distance: 4, duration: 35, pace: 540 },
    { day: "Sat", type: "long run", distance: 12, duration: 95, pace: 480 },
    { day: "Sun", type: "easy", distance: 4, duration: 35, pace: 540 },
  ],
};

const adjustedWeek: PlanWeek = {
  weekNumber: 1,
  phase: "build",
  workouts: [
    { day: "Mon", type: "easy", distance: 4, duration: 35, pace: 540 },
    { day: "Tue", type: "easy", distance: 4, duration: 30, pace: 540 },
    { day: "Thu", type: "easy", distance: 4, duration: 35, pace: 540 },
    { day: "Sat", type: "long run", distance: 10, duration: 80, pace: 480 },
    // Sun dropped due to travel
  ],
};

const trace = buildWeeklyRecalibrationTrace({
  originalWeek,
  adjustedWeek,
  reasoning: [
    "Tue · downgraded — HRV depressed; downgrade quality",
    "Sat · shortened — Lower load given recovery trend",
  ],
  easyOnlyDays: [{ day: "Sun", reason: "Travel day", weekIndex: 0 }],
  recoveryTrends: ["HRV trending below baseline (52 vs 56 avg)"],
});

console.log(JSON.stringify(trace, null, 2));
console.log();

const errors: string[] = [];

if (trace.preserved_workouts.length !== 2) {
  errors.push(`expected 2 preserved, got ${trace.preserved_workouts.length}`);
}
if (trace.modified_workouts.length !== 2) {
  errors.push(`expected 2 modified, got ${trace.modified_workouts.length}`);
}
if (trace.dropped_workouts.length !== 1) {
  errors.push(`expected 1 dropped, got ${trace.dropped_workouts.length}`);
}
const tue = trace.modified_workouts.find((w) => w.day === "Tue");
if (!tue || !tue.reason?.includes("HRV depressed")) {
  errors.push(`Tue modification missing reasoning; got ${JSON.stringify(tue)}`);
}
const sat = trace.modified_workouts.find((w) => w.day === "Sat");
if (!sat || !sat.reason?.includes("Lower load")) {
  errors.push(`Sat modification missing reasoning; got ${JSON.stringify(sat)}`);
}
if (trace.dropped_workouts[0]?.day !== "Sun") {
  errors.push(`expected Sun dropped, got ${trace.dropped_workouts[0]?.day}`);
}
if (
  !trace.calendar_changes.some((c) => c.startsWith("Sun:") && c.includes("Travel day"))
) {
  errors.push(`calendar_changes missing Sun travel; got ${JSON.stringify(trace.calendar_changes)}`);
}
if (!hasRecalibrationChanges(trace)) {
  errors.push("hasRecalibrationChanges should be true");
}

// Aligned case: identical weeks + no easy-only days = no changes
const aligned = buildWeeklyRecalibrationTrace({
  originalWeek,
  adjustedWeek: originalWeek,
  reasoning: [],
  easyOnlyDays: [],
  recoveryTrends: [],
});
if (aligned.modified_workouts.length !== 0 || aligned.dropped_workouts.length !== 0) {
  errors.push("aligned case should have zero modifications/drops");
}
if (hasRecalibrationChanges(aligned)) {
  errors.push("hasRecalibrationChanges should be false for aligned case");
}

if (errors.length > 0) {
  console.error("FAIL:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("OK — trace builder classifies preserved/modified/dropped correctly");
