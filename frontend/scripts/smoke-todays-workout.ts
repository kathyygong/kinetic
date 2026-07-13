import { generateTrainingPlan } from "../lib/planGenerator";
import { formatPace } from "../lib/paceCalculator";
import {
  getTodaysWorkout,
  todayDayLabel,
  type RecommendationAction,
} from "../lib/todaysWorkout";
import type { Goal } from "../lib/types";
import { prsFromMinutes } from "./fixtureHelpers";

const day = todayDayLabel();
console.log("Today is " + day);
console.log("");

function dump(label: string, goal: Goal, action?: RecommendationAction) {
  const plan = generateTrainingPlan(goal);
  const tw = getTodaysWorkout(goal, plan, action);
  const actionLabel = action ? action.name : "proceed";
  console.log(
    "--- " + label + " [" + actionLabel + "] : " + tw.headline + " ---"
  );
  if (tw.note) console.log("  note: " + tw.note);
  console.log(
    "  total: " + tw.totalDistance.toFixed(1) + " mi, " + tw.totalDuration + " min"
  );
  for (const seg of tw.segments) {
    if (seg.pace < 3 || seg.pace > 20) {
      throw new Error(`${label} generated implausible pace ${formatPace(seg.pace)}`);
    }
    console.log(
      "  " +
        seg.label.padEnd(11) +
        " " +
        seg.distance.toFixed(1).padStart(4) +
        " mi @ " +
        formatPace(seg.pace) +
        "  (" +
        seg.duration +
        " min)" +
        (seg.note ? "  - " + seg.note : "")
    );
  }
  console.log("");
}

const marathon: Goal = {
  goal_type: "race",
  race_distance: "marathon",
  target_date: "2026-11-01",
  experience_level: "intermediate",
  current_prs: prsFromMinutes({
    "5k": 22,
    "10k": 46,
    half: 100,
    marathon: 215,
  }),
  weekly_mileage: 25,
};

const fiveK: Goal = {
  goal_type: "race",
  race_distance: "5k",
  target_date: "2026-06-17",
  experience_level: "beginner",
  current_prs: prsFromMinutes({ "5k": 30 }),
};

dump("Marathon block, week 1", marathon);
dump("5K, week 1", fiveK);
dump(
  "Marathon, modified",
  marathon,
  { name: "modify", intensity_modifier: 0.7, duration_modifier: 0.6 }
);

dump(
  "Marathon, rest",
  marathon,
  { name: "rest", intensity_modifier: 0, duration_modifier: 0 }
);

console.log("OK - today's workout fixtures use canonical PR seconds and plausible paces");
