import {
  adjustPlanForWeek,
  type DayLabel,
  type EasyOnlyDay,
  type WorkoutAdjustment,
} from "@/lib/planAdjuster";
import type { PlanWeek, Workout } from "@/lib/planGenerator";

export type WhatIfWorkout = Pick<
  Workout,
  "day" | "type" | "distance" | "duration" | "pace"
>;

export type WhatIfSimulation = {
  original_week_plan: WhatIfWorkout[];
  simulated_week_plan: WhatIfWorkout[];
  adjustments: WorkoutAdjustment[];
  preserved_workouts: WhatIfWorkout[];
  scenario_summary: string;
};

export type WhatIfExplanation = {
  summary: string;
  changes: { title: string; explanation: string }[];
  preserved: string[];
  tradeoff: string;
  confidence_note: string;
};

export function buildWhatIfSimulation(
  week: PlanWeek,
  day: DayLabel,
  availableMinutes: number,
  easyOnly: boolean,
): WhatIfSimulation {
  const safeMinutes = Math.max(0, Math.min(240, Math.round(availableMinutes)));
  const easyOnlyDays: EasyOnlyDay[] = easyOnly
    ? [{ day, reason: `What-if: ${day} is an easy-only day` }]
    : [];
  const adjusted = adjustPlanForWeek(
    week,
    { [day]: safeMinutes },
    easyOnlyDays,
  );
  const original = week.workouts.map(projectWorkout);
  const simulated = adjusted.workouts.map(projectWorkout);
  const simulatedKeys = new Set(simulated.map(workoutKey));
  const changedDays = new Set(
    adjusted.adjustments.flatMap((change) =>
      change.fromDay ? [change.day, change.fromDay] : [change.day],
    ),
  );
  const preserved = original.filter(
    (workout) =>
      simulatedKeys.has(workoutKey(workout)) &&
      !changedDays.has(workout.day as DayLabel),
  );

  return {
    original_week_plan: original,
    simulated_week_plan: simulated,
    adjustments: adjusted.adjustments.map((change) => ({ ...change })),
    preserved_workouts: preserved,
    scenario_summary: easyOnly
      ? `${day} is limited to ${safeMinutes} minutes and easy effort only.`
      : `${day} is limited to ${safeMinutes} available minutes.`,
  };
}

export function buildLocalWhatIfExplanation(
  simulation: WhatIfSimulation,
): WhatIfExplanation {
  const changes = simulation.adjustments.filter(
    (adjustment) => adjustment.action !== "kept",
  );
  return {
    summary:
      changes.length === 0
        ? "The current week already fits this scenario."
        : `${changes.length} read-only change${changes.length === 1 ? "" : "s"} would keep the week inside the scenario constraints.`,
    changes:
      simulation.adjustments.length > 0
        ? simulation.adjustments.map((adjustment) => ({
            title: `${adjustment.day} · ${adjustment.action}`,
            explanation: adjustment.reason,
          }))
        : [
            {
              title: "No workout edits",
              explanation: "Every session still fits the simulated constraint.",
            },
          ],
    preserved: simulation.preserved_workouts.map(
      (workout) => `${workout.day} · ${workout.type}`,
    ),
    tradeoff:
      changes.length === 0
        ? "No training stimulus is traded away in this preview."
        : "The preview protects the week's key structure while reducing or moving work around the selected constraint.",
    confidence_note:
      "This explanation is derived from the deterministic preview and does not modify your saved plan.",
  };
}

function projectWorkout(workout: Workout): WhatIfWorkout {
  return {
    day: workout.day,
    type: workout.type,
    distance: workout.distance,
    duration: workout.duration,
    pace: workout.pace,
  };
}

function workoutKey(workout: WhatIfWorkout): string {
  return [
    workout.day,
    workout.type,
    workout.distance,
    workout.duration,
    workout.pace,
  ].join("|");
}
