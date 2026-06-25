// End-to-end smoke test for calendar-aware plan refresh:
//   - generateTrainingPlan
//   - refreshWeekWithCalendar (availability + travel)
//   - reasoning surfaced via RefreshResult
//
// Doesn't hit the backend; uses synthetic availability + travel data.

import { generateTrainingPlan } from "../lib/planGenerator";
import {
  refreshWeekWithCalendar,
  type DayAvailability,
} from "../lib/planRefresh";
import type { Goal } from "../lib/types";

function dump(label: string, result: ReturnType<typeof refreshWeekWithCalendar>) {
  console.log("=== " + label + " ===");
  console.log("Headline: " + result.headline);
  if (result.easyOnlyDays.length > 0) {
    console.log(
      "Easy-only days: " +
        result.easyOnlyDays.map((d) => d.day + " (" + d.reason + ")").join(", ")
    );
  }
  console.log("Reasoning:");
  if (result.reasoning.length === 0) {
    console.log("  (none)");
  } else {
    for (const line of result.reasoning) console.log("  - " + line);
  }
  console.log("Final week workouts:");
  for (const w of result.adjusted.workouts) {
    console.log(
      "  " +
        w.day +
        " " +
        w.type.padEnd(10) +
        " " +
        w.distance.toFixed(1) +
        " mi (" +
        w.duration +
        " min)"
    );
  }
  console.log("");
}

const goal: Goal = {
  goal_type: "race",
  race_distance: "marathon",
  target_date: "2026-11-01",
  experience_level: "intermediate",
  current_prs: { "5k": 22, "10k": 46, half: 100, marathon: 215 },
  weekly_mileage: 25,
};

const plan = generateTrainingPlan(goal);
const week = plan[3]; // mid-build, has variety

// Force a known week start (Monday) so the date arithmetic is deterministic
// regardless of when you run the test.
const weekStart = new Date(2026, 4, 4); // Mon May 4 2026

// Build a "real-shape" availability: relaxed weekends, busy weekdays.
const fullAvail: DayAvailability[] = [
  { date: "2026-05-04", day: "Mon", minutes: 60 },
  { date: "2026-05-05", day: "Tue", minutes: 90 },
  { date: "2026-05-06", day: "Wed", minutes: 90 },
  { date: "2026-05-07", day: "Thu", minutes: 90 },
  { date: "2026-05-08", day: "Fri", minutes: 60 },
  { date: "2026-05-09", day: "Sat", minutes: 240 },
  { date: "2026-05-10", day: "Sun", minutes: 240 },
];

// 1) Wide-open week, no travel — should be no-op.
dump(
  "Open week, no travel",
  refreshWeekWithCalendar(week, fullAvail, [], weekStart)
);

// 2) Tight Wednesday → swap intervals to a free day.
dump(
  "Wed slammed → swap intervals",
  refreshWeekWithCalendar(
    week,
    [
      ...fullAvail.slice(0, 2),
      { date: "2026-05-06", day: "Wed", minutes: 15 },
      ...fullAvail.slice(3),
    ],
    [],
    weekStart
  )
);

// 3) Travel: business trip Wed-Fri, returns Fri morning.
//    → Wed/Thu = travel days, Fri/Sat/Sun = post-travel 48h easy-only.
//    Expectation: Wed intervals → easy, Sun long run → dropped.
dump(
  "Business trip Wed-Fri",
  refreshWeekWithCalendar(
    week,
    fullAvail,
    [
      {
        start: "2026-05-06",
        end: "2026-05-08", // exclusive: returns Fri morning
        title: "Business trip to NYC",
        all_day: true,
      },
    ],
    weekStart
  )
);

// 4) Very busy + travel: easy runs dropped, long run kept-with-warning,
//    travel windows downgrade quality work.
dump(
  "Very busy + travel",
  refreshWeekWithCalendar(
    week,
    [
      { date: "2026-05-04", day: "Mon", minutes: 10 },
      { date: "2026-05-05", day: "Tue", minutes: 30 },
      { date: "2026-05-06", day: "Wed", minutes: 15 },
      { date: "2026-05-07", day: "Thu", minutes: 30 },
      { date: "2026-05-08", day: "Fri", minutes: 10 },
      { date: "2026-05-09", day: "Sat", minutes: 60 },
      { date: "2026-05-10", day: "Sun", minutes: 30 },
    ],
    [
      {
        start: "2026-05-06",
        end: "2026-05-08",
        title: "Flight to Boston",
        all_day: false,
      },
    ],
    weekStart
  )
);
