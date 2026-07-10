import { generateTrainingPlan } from "../lib/planGenerator";
import type { ExperienceLevel, Goal, RaceDistance } from "../lib/types";

const races: RaceDistance[] = ["5k", "10k", "half", "marathon"];
const levels: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const workoutCounts: Record<ExperienceLevel, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};
const raceLongRunCaps: Record<RaceDistance, number> = {
  "5k": 8,
  "10k": 10,
  half: 14,
  marathon: 22,
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL - ${message}`);
    process.exit(1);
  }
}

function targetDate(weeksOut: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + weeksOut * 7);
  return date.toISOString().slice(0, 10);
}

function makeGoal(race: RaceDistance, level: ExperienceLevel, weekly_mileage: number): Goal {
  return {
    goal_type: "race",
    race_distance: race,
    target_date: targetDate(race === "marathon" ? 20 : 14),
    experience_level: level,
    current_prs: {},
    weekly_mileage,
  };
}

for (const race of races) {
  for (const level of levels) {
    const plan = generateTrainingPlan(makeGoal(race, level, 1));
    assert(plan.length >= 4 && plan.length <= 20, `${race}/${level}: plan length out of bounds`);

    for (const week of plan) {
      assert(
        week.workouts.length === workoutCounts[level],
        `${race}/${level}/week ${week.weekNumber}: workout count ignores experience level`,
      );

      const longRun = week.workouts.find((workout) => workout.type === "long run");
      const raceDay = week.workouts.find((workout) => workout.type === "race");
      const quality = week.workouts.find(
        (workout) => workout.type === "tempo" || workout.type === "intervals",
      );

      if (week.phase === "race") {
        assert(Boolean(raceDay), `${race}/${level}/week ${week.weekNumber}: race week missing race`);
      } else {
        assert(Boolean(longRun), `${race}/${level}/week ${week.weekNumber}: missing long run`);
        assert(Boolean(quality), `${race}/${level}/week ${week.weekNumber}: missing quality session`);
        assert(
          longRun!.distance <= raceLongRunCaps[race],
          `${race}/${level}/week ${week.weekNumber}: long run exceeds race cap`,
        );
      }

      for (const workout of week.workouts) {
        assert(workout.distance > 0, `${race}/${level}: non-positive workout distance`);
        assert(workout.duration > 0, `${race}/${level}: non-positive workout duration`);
        assert(Number.isFinite(workout.pace), `${race}/${level}: invalid pace`);
      }
    }
  }
}

console.log("OK - plan safety invariants hold across race, experience, and low-mileage inputs");
