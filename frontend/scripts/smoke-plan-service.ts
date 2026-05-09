// Smoke test: full multi-week calendar-aware plan generation.
//
// Exercises:
//   1. Initial generation with no calendar conflicts -> plan === base
//   2. Travel block in week 2 -> easy-only window applied to that week only
//   3. Slammed week 1 + busy week 3 -> per-week reasoning correctly tagged
//
// Run with:
//   npx tsx scripts/smoke-plan-service.ts

import {
  bucketDaysByWeek,
  buildCalendarAwarePlan,
  weeksDiffer,
} from "../lib/planService";
import type { DayAvailability, TravelEvent } from "../lib/planRefresh";
import type { PlanWeek } from "../lib/planGenerator";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function dayLabel(d: Date): DayAvailability["day"] {
  return DAY_LABELS[d.getDay()] as DayAvailability["day"];
}

// Build a 4-week deterministic toy plan: 4 workouts/week.
function makeBasePlan(): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (let i = 0; i < 4; i++) {
    weeks.push({
      weekNumber: i + 1,
      phase: "build",
      workouts: [
        {
          day: "Mon",
          type: "easy",
          distance: 6.0,
          duration: 50,
          pace: 8.5,
        },
        {
          day: "Wed",
          type: "intervals",
          distance: 5.0,
          duration: 35,
          pace: 7.0,
        },
        {
          day: "Fri",
          type: "easy",
          distance: 6.0,
          duration: 50,
          pace: 8.5,
        },
        {
          day: "Sun",
          type: "long run",
          distance: 9.0 + i * 0.5,
          duration: 75 + i * 5,
          pace: 8.5,
        },
      ],
    });
  }
  return weeks;
}

// Build a flat day array that says "everything is wide open" for `weeks` weeks.
function openDays(planStart: Date, weeks: number): DayAvailability[] {
  const out: DayAvailability[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(planStart, i);
    out.push({ date: isoDate(d), day: dayLabel(d), minutes: 600 });
  }
  return out;
}

// Make Wednesday of the given week index slammed (15 min).
function slamWedOfWeek(
  days: DayAvailability[],
  planStart: Date,
  weekIdx: number
) {
  const wed = addDays(planStart, weekIdx * 7 + 2); // Mon=+0, Wed=+2
  const iso = isoDate(wed);
  const found = days.find((x) => x.date === iso);
  if (found) found.minutes = 15;
}

// Fixed plan start = Monday May 4, 2026 for determinism.
const planStart = new Date(2026, 4, 4);
console.assert(planStart.getDay() === 1, "planStart must be a Monday");

// Scenario 1: open calendar, no travel -> plan unchanged
{
  const base = makeBasePlan();
  const days = openDays(planStart, 4);
  const buckets = bucketDaysByWeek(days, planStart, base.length);
  const travel: TravelEvent[] = [];
  const result = buildCalendarAwarePlan(base, buckets, travel, planStart);
  console.log("=== Scenario 1: open calendar ===");
  console.log("hasChanges:", result.hasChanges);
  console.log("totalChanges:", result.totalChanges);
  console.log(
    "weeksDiffer week 0:",
    weeksDiffer(base[0], result.weeks[0])
  );
  console.log("");
}

// Scenario 2: travel in week 2 (May 13-15 = Wed/Thu/Fri of week 2)
{
  const base = makeBasePlan();
  const days = openDays(planStart, 4);
  const buckets = bucketDaysByWeek(days, planStart, base.length);
  // Travel: Wed May 13 -> Sat May 16 exclusive (so trip = Wed/Thu/Fri),
  // with +2-day post-arrival buffer covering Sat + Sun.
  const travel: TravelEvent[] = [
    {
      start: "2026-05-13",
      end: "2026-05-16",
      title: "Conference in Boston",
      all_day: true,
    },
  ];
  const result = buildCalendarAwarePlan(base, buckets, travel, planStart);
  console.log("=== Scenario 2: travel in week 2 ===");
  console.log("hasChanges:", result.hasChanges);
  console.log("totalChanges:", result.totalChanges);
  console.log("Easy-only days (with weekIndex):");
  for (const d of result.easyOnlyDays) {
    console.log(`  W${d.weekIndex + 1} ${d.day}: ${d.reason}`);
  }
  console.log("Reasoning bullets:");
  for (const r of result.reasoning) console.log(`  - ${r}`);
  console.log("Week 1 (no travel) workouts:");
  for (const w of result.weeks[0].workouts) {
    console.log(`  ${w.day} ${w.type}  ${w.distance.toFixed(1)} mi`);
  }
  console.log("Week 2 (with travel) workouts:");
  for (const w of result.weeks[1].workouts) {
    console.log(`  ${w.day} ${w.type}  ${w.distance.toFixed(1)} mi`);
  }
  console.log("");
}

// Scenario 3: slammed Wed in weeks 1 and 3 + travel in week 2
{
  const base = makeBasePlan();
  const days = openDays(planStart, 4);
  slamWedOfWeek(days, planStart, 0); // week 1
  slamWedOfWeek(days, planStart, 2); // week 3
  const buckets = bucketDaysByWeek(days, planStart, base.length);
  const travel: TravelEvent[] = [
    {
      start: "2026-05-13",
      end: "2026-05-15",
      title: "Trip to NYC",
      all_day: true,
    },
  ];
  const result = buildCalendarAwarePlan(base, buckets, travel, planStart);
  console.log("=== Scenario 3: slammed wks 1 & 3 + travel wk 2 ===");
  console.log("hasChanges:", result.hasChanges);
  console.log("totalChanges:", result.totalChanges);
  console.log("Reasoning bullets (note [W{n}] prefix):");
  for (const r of result.reasoning) console.log(`  - ${r}`);
  console.log(
    "weeksDiffer week 0:",
    weeksDiffer(base[0], result.weeks[0])
  );
  console.log(
    "weeksDiffer week 1:",
    weeksDiffer(base[1], result.weeks[1])
  );
  console.log(
    "weeksDiffer week 2:",
    weeksDiffer(base[2], result.weeks[2])
  );
  console.log(
    "weeksDiffer week 3:",
    weeksDiffer(base[3], result.weeks[3])
  );
  console.log("");
}

// Scenario 4: bucketing sanity check
{
  const days = openDays(planStart, 4);
  const buckets = bucketDaysByWeek(days, planStart, 4);
  console.log("=== Scenario 4: bucketDaysByWeek ===");
  console.log("Buckets:", buckets.length, "weeks");
  for (let i = 0; i < buckets.length; i++) {
    const week = buckets[i];
    console.log(
      `  Week ${i + 1}: ${week.length} days, first=${week[0].date} last=${
        week[6].date
      }`
    );
  }
  // Verify missing days fill in with the open-window default (960 min)
  const sparse = days.slice(0, 10); // only 10 days of data for a 4-week plan
  const sparseBuckets = bucketDaysByWeek(sparse, planStart, 4);
  const fakeFill = sparseBuckets[3].every((d) => d.minutes === 960);
  console.log("Far-future week defaults to 960-min entries:", fakeFill);
}
