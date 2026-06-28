import type { PlanWeek } from "../lib/planGenerator";
import {
  buildLocalWhatIfExplanation,
  buildWhatIfSimulation,
} from "../lib/whatIf";

const week: PlanWeek = {
  weekNumber: 1,
  phase: "build",
  workouts: [
    {
      day: "Wed",
      type: "tempo",
      distance: 6,
      duration: 45,
      pace: 7.5,
    },
    {
      day: "Sun",
      type: "long run",
      distance: 9,
      duration: 90,
      pace: 10,
    },
  ],
};

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const before = JSON.stringify(week);
const constrained = buildWhatIfSimulation(week, "Wed", 30, false);
expect(JSON.stringify(week) === before, "simulation must not mutate input week");
expect(
  constrained.adjustments.length > 0,
  "30-minute scenario should produce a deterministic adjustment",
);
expect(
  constrained.adjustments.some((change) =>
    ["swapped", "shortened"].includes(change.action),
  ),
  "the constrained workout should be moved or shortened",
);

const travel = buildWhatIfSimulation(week, "Wed", 45, true);
expect(
  travel.simulated_week_plan.some(
    (workout) => workout.day === "Wed" && workout.type === "easy",
  ),
  "easy-only scenario should downgrade quality work",
);

const explanation = buildLocalWhatIfExplanation(constrained);
expect(Boolean(explanation.summary), "local fallback needs a summary");
expect(explanation.changes.length > 0, "local fallback needs change details");

console.log("OK - What-if simulation is deterministic, read-only, and explainable");
