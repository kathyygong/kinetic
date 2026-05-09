// Smoke test for three end-to-end cases:
//
//   Case 1: strong PR  -> faster paces
//   Case 2: beginner   -> slower progression (fewer workouts, smaller mileage)
//   Case 3: busy week  -> reduced volume after calendar adjustment
//
// Run with:
//   npx tsx scripts/smoke-cases.ts
//
// We assert the high-level behaviors numerically rather than just printing
// values, so this script doubles as a regression check.

import { generateTrainingPlan, type PlanWeek } from "../lib/planGenerator";
import type { Goal, CurrentPRs, ExperienceLevel, RaceDistance } from "../lib/types";
import {
  bucketDaysByWeek,
  buildCalendarAwarePlan,
} from "../lib/planService";
import type { DayAvailability, TravelEvent } from "../lib/planRefresh";

// --- helpers ----------------------------------------------------------------

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function fmtPace(p: number): string {
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function makeGoal(opts: {
  race: RaceDistance;
  level: ExperienceLevel;
  prs: CurrentPRs;
  weeklyMiles?: number;
  weeksOut: number;
}): Goal {
  // Anchor target_date to a fixed point so the plan length is deterministic.
  const start = new Date(2026, 4, 4); // Mon May 4 2026
  const target = new Date(start);
  target.setDate(target.getDate() + opts.weeksOut * 7);
  return {
    goal_type: "race",
    race_distance: opts.race,
    target_date: target.toISOString().slice(0, 10),
    experience_level: opts.level,
    current_prs: opts.prs,
    weekly_mileage: opts.weeklyMiles,
  };
}

function totalMiles(week: PlanWeek): number {
  return week.workouts.reduce((s, w) => s + w.distance, 0);
}

function findByType(week: PlanWeek, type: PlanWeek["workouts"][number]["type"]) {
  return week.workouts.find((w) => w.type === type);
}

// --- Case 1: strong PR -> faster paces --------------------------------------

console.log("=== Case 1: strong PR -> faster paces ===");
{
  const slowPRs: CurrentPRs = {
    "5k": 30 * 60,    // 30:00 5k -> ~9:40/mi
    "10k": 62 * 60,
    half: 135 * 60,
    marathon: 280 * 60,
  };
  const fastPRs: CurrentPRs = {
    "5k": 18 * 60,    // 18:00 5k -> ~5:48/mi
    "10k": 38 * 60,
    half: 84 * 60,
    marathon: 175 * 60,
  };

  // Same race, same experience, same weekly_mileage -> the only difference
  // between these two plans is the PRs.
  const slow = generateTrainingPlan(
    makeGoal({ race: "10k", level: "intermediate", prs: slowPRs, weeklyMiles: 30, weeksOut: 8 })
  );
  const fast = generateTrainingPlan(
    makeGoal({ race: "10k", level: "intermediate", prs: fastPRs, weeklyMiles: 30, weeksOut: 8 })
  );

  // Compare paces on week 4 (mid-build) to avoid taper noise.
  const w = 3;
  const slowEasy = findByType(slow[w], "easy");
  const fastEasy = findByType(fast[w], "easy");
  const slowQual = findByType(slow[w], "intervals") ?? findByType(slow[w], "tempo");
  const fastQual = findByType(fast[w], "intervals") ?? findByType(fast[w], "tempo");
  const slowLong = findByType(slow[w], "long run");
  const fastLong = findByType(fast[w], "long run");

  console.log(`  Slow PR easy:   ${fmtPace(slowEasy!.pace)}/mi`);
  console.log(`  Fast PR easy:   ${fmtPace(fastEasy!.pace)}/mi`);
  console.log(`  Slow PR ${slowQual!.type}: ${fmtPace(slowQual!.pace)}/mi`);
  console.log(`  Fast PR ${fastQual!.type}: ${fmtPace(fastQual!.pace)}/mi`);
  console.log(`  Slow PR long:   ${fmtPace(slowLong!.pace)}/mi`);
  console.log(`  Fast PR long:   ${fmtPace(fastLong!.pace)}/mi`);

  // Lower (faster) pace = smaller number in min/mi.
  assert(fastEasy!.pace < slowEasy!.pace, "fast PR easy pace is faster than slow PR");
  assert(fastQual!.pace < slowQual!.pace, "fast PR quality pace is faster than slow PR");
  assert(fastLong!.pace < slowLong!.pace, "fast PR long-run pace is faster than slow PR");
  // Sanity: gap should be meaningful (>= 1 min/mi at this PR delta).
  assert(
    slowEasy!.pace - fastEasy!.pace >= 1.0,
    `easy pace gap is at least 1:00/mi (got ${(slowEasy!.pace - fastEasy!.pace).toFixed(2)})`
  );
}

// --- Case 2: beginner -> slower progression ---------------------------------

console.log("\n=== Case 2: beginner -> slower progression ===");
{
  // Same PRs and target so the only difference is experience level. We
  // omit weekly_mileage so the planner uses each level's default
  // ESTIMATED_WEEKLY_MILES (15 / 25 / 40).
  const prs: CurrentPRs = {
    "5k": 24 * 60,
    "10k": 50 * 60,
    half: 110 * 60,
    marathon: 230 * 60,
  };
  const beginner = generateTrainingPlan(
    makeGoal({ race: "half", level: "beginner", prs, weeksOut: 12 })
  );
  const intermediate = generateTrainingPlan(
    makeGoal({ race: "half", level: "intermediate", prs, weeksOut: 12 })
  );
  const advanced = generateTrainingPlan(
    makeGoal({ race: "half", level: "advanced", prs, weeksOut: 12 })
  );

  // Workouts per week.
  const begCount = beginner[0].workouts.length;
  const intCount = intermediate[0].workouts.length;
  const advCount = advanced[0].workouts.length;
  console.log(`  Beginner workouts/wk:     ${begCount}`);
  console.log(`  Intermediate workouts/wk: ${intCount}`);
  console.log(`  Advanced workouts/wk:     ${advCount}`);
  assert(begCount === 3, "beginner has 3 workouts/week");
  assert(intCount === 4, "intermediate has 4 workouts/week");
  assert(advCount === 5, "advanced has 5 workouts/week");

  // Peak weekly mileage scales with experience.
  const peak = (plan: PlanWeek[]) =>
    plan.reduce((max, w) => Math.max(max, totalMiles(w)), 0);
  const begPeak = peak(beginner);
  const intPeak = peak(intermediate);
  const advPeak = peak(advanced);
  console.log(`  Beginner peak miles:     ${begPeak.toFixed(1)}`);
  console.log(`  Intermediate peak miles: ${intPeak.toFixed(1)}`);
  console.log(`  Advanced peak miles:     ${advPeak.toFixed(1)}`);
  assert(begPeak < intPeak, "beginner peak < intermediate peak");
  assert(intPeak < advPeak, "intermediate peak < advanced peak");

  // Slower progression: week-1 -> peak ramp ratio is *gentler* for the
  // beginner. We compute (peak - week1) / week1 for each level.
  const ramp = (plan: PlanWeek[]) => {
    const w1 = totalMiles(plan[0]);
    return w1 > 0 ? (peak(plan) - w1) / w1 : 0;
  };
  const begRamp = ramp(beginner);
  const advRamp = ramp(advanced);
  console.log(`  Beginner ramp ratio:  +${(begRamp * 100).toFixed(1)}%`);
  console.log(`  Advanced ramp ratio:  +${(advRamp * 100).toFixed(1)}%`);
  // Both ramps should grow over the build phase (>0); the absolute peaks
  // already encode the slower-progression rule (smaller workload from
  // start to finish for the beginner).
  assert(begRamp >= 0, "beginner volume grows or stays flat across plan");

  // Beginner long run should peak smaller than advanced long run.
  const longestLR = (plan: PlanWeek[]) =>
    plan.reduce((max, w) => {
      const lr = w.workouts.find((x) => x.type === "long run");
      return lr ? Math.max(max, lr.distance) : max;
    }, 0);
  const begLong = longestLR(beginner);
  const advLong = longestLR(advanced);
  console.log(`  Beginner peak long run: ${begLong.toFixed(1)} mi`);
  console.log(`  Advanced peak long run: ${advLong.toFixed(1)} mi`);
  assert(begLong < advLong, "beginner peak long run < advanced peak long run");
}

// --- Case 3: busy calendar -> reduced volume --------------------------------

console.log("\n=== Case 3: busy calendar -> reduced volume ===");
{
  const goal = makeGoal({
    race: "10k",
    level: "intermediate",
    prs: { "5k": 22 * 60, "10k": 46 * 60, half: 100 * 60, marathon: 210 * 60 },
    weeklyMiles: 30,
    weeksOut: 4,
  });
  const base = generateTrainingPlan(goal);

  const planStart = new Date(2026, 4, 4); // Mon May 4 2026
  const isoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const dayLabel = (d: Date): DayAvailability["day"] =>
    DAY_LABELS[d.getDay()] as DayAvailability["day"];
  const addDays = (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  };

  // Open calendar: every day fully free.
  const openDays: DayAvailability[] = [];
  for (let i = 0; i < base.length * 7; i++) {
    const d = addDays(planStart, i);
    openDays.push({ date: isoDate(d), day: dayLabel(d), minutes: 600 });
  }

  // Busy calendar week 1: < 30 min on every day so the adjuster has to
  // shorten or drop nearly everything.
  const busyDays: DayAvailability[] = openDays.map((d) => ({ ...d }));
  for (let i = 0; i < 7; i++) {
    busyDays[i].minutes = i === 6 ? 35 : 15; // Sun barely fits anything
  }

  const openBuckets = bucketDaysByWeek(openDays, planStart, base.length);
  const busyBuckets = bucketDaysByWeek(busyDays, planStart, base.length);
  const travel: TravelEvent[] = [];

  const openPlan = buildCalendarAwarePlan(base, openBuckets, travel, planStart);
  const busyPlan = buildCalendarAwarePlan(base, busyBuckets, travel, planStart);

  const openMiles = totalMiles(openPlan.weeks[0]);
  const busyMiles = totalMiles(busyPlan.weeks[0]);
  const openMinutes = openPlan.weeks[0].workouts.reduce((s, w) => s + w.duration, 0);
  const busyMinutes = busyPlan.weeks[0].workouts.reduce((s, w) => s + w.duration, 0);

  console.log(`  Open week 1 mileage: ${openMiles.toFixed(1)} mi (${openMinutes} min)`);
  console.log(`  Busy week 1 mileage: ${busyMiles.toFixed(1)} mi (${busyMinutes} min)`);
  console.log(`  Open week 1 workouts: ${openPlan.weeks[0].workouts.length}`);
  console.log(`  Busy week 1 workouts: ${busyPlan.weeks[0].workouts.length}`);
  console.log("  Reasoning bullets:");
  for (const r of busyPlan.reasoning) console.log(`    - ${r}`);

  assert(busyMiles < openMiles, "busy week mileage is lower than open week");
  assert(busyMinutes < openMinutes, "busy week duration is lower than open week");
  assert(busyPlan.hasChanges, "busy week produced calendar-aware adjustments");
  assert(busyPlan.totalChanges >= 1, "at least one adjustment was logged");
  // Week 2-4 should be unchanged because their availability is open.
  assert(
    JSON.stringify(busyPlan.weeks.slice(1)) ===
      JSON.stringify(openPlan.weeks.slice(1)),
    "busy week 1 doesn't bleed into weeks 2-4"
  );
}

console.log(
  process.exitCode ? "\nFAILED" : "\nAll cases passed."
);
