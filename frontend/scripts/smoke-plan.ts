import { generateTrainingPlan } from "../lib/planGenerator";
import { formatPace } from "../lib/paceCalculator";

function summarize(label: string, goal: any) {
  const plan = generateTrainingPlan(goal);
  console.log("--- " + label + " (" + plan.length + " weeks) ---");
  for (const w of plan) {
    const total = w.workouts.reduce((s, x) => s + x.distance, 0);
    const longest = w.workouts.reduce((m, x) => Math.max(m, x.distance), 0);
    const easy = w.workouts.find((x) => x.type === "easy");
    const tempo = w.workouts.find((x) => x.type === "tempo" || x.type === "intervals");
    const easyPace = easy ? formatPace(easy.pace) : "-";
    const qualityPace = tempo ? formatPace(tempo.pace) : "-";
    console.log(
      "Week " +
        w.weekNumber.toString().padStart(2) +
        " [" +
        w.phase.padEnd(8) +
        "]: " +
        total.toFixed(1).padStart(5) +
        " mi total, longest " +
        longest +
        " mi, easy " +
        easyPace +
        ", quality " +
        qualityPace
    );
  }
  console.log("");
}

summarize("Marathon, Nov 1 2026, intermediate, 25 mi base", {
  goal_type: "race",
  race_distance: "marathon",
  target_date: "2026-11-01",
  experience_level: "intermediate",
  current_prs: { "5k": 22, "10k": 46, half: 100, marathon: 215 },
  weekly_mileage: 25,
});

summarize("5K, ~6 weeks out, beginner, 15 mi base", {
  goal_type: "race",
  race_distance: "5k",
  target_date: "2026-06-17",
  experience_level: "beginner",
  current_prs: { "5k": 30, "10k": 0, half: 0, marathon: 0 },
});

summarize("Half, ~12 weeks out, advanced, 35 mi base", {
  goal_type: "race",
  race_distance: "half",
  target_date: "2026-07-29",
  experience_level: "advanced",
  current_prs: { "5k": 19, "10k": 40, half: 88, marathon: 200 },
  weekly_mileage: 35,
});
