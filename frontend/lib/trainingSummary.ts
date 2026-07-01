import type {
  LearnedPreference,
  RecommendationEvent,
} from "./behaviorTypes";

export type TrainingSummaryPeriod = "weekly" | "monthly";

export type TrainingSummaryRequest = {
  period: TrainingSummaryPeriod;
  as_of: string;
  events: {
    date: string;
    completed: boolean;
    distance_miles?: number;
    duration_minutes?: number;
    perceived_effort?: number;
    recovery_score?: number;
  }[];
  confirmed_preferences: string[];
};

/**
 * Build the privacy-minimized aggregate input for the read-only review.
 * Workout names, notes, rejection reasons, and calendar context never leave
 * the browser through this path.
 */
export function buildTrainingSummaryRequest(
  period: TrainingSummaryPeriod,
  events: RecommendationEvent[],
  preferences: LearnedPreference[],
  now: Date = new Date(),
): TrainingSummaryRequest {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffKey = localDateKey(cutoff);
  const asOf = localDateKey(now);

  return {
    period,
    as_of: asOf,
    events: events
      .filter(
        (event) =>
          event.date >= cutoffKey &&
          event.date <= asOf &&
          (typeof event.actualWorkout?.completed === "boolean" ||
            event.userResponse === "skipped"),
      )
      .slice(-100)
      .map((event) => ({
        date: event.date,
        completed: event.actualWorkout?.completed === true,
        ...(numberInRange(event.actualWorkout?.distanceMiles, 0, 100)
          ? { distance_miles: event.actualWorkout?.distanceMiles }
          : {}),
        ...(numberInRange(event.actualWorkout?.durationMinutes, 0, 1440)
          ? { duration_minutes: event.actualWorkout?.durationMinutes }
          : {}),
        ...(numberInRange(event.actualWorkout?.perceivedEffort, 1, 10)
          ? { perceived_effort: event.actualWorkout?.perceivedEffort }
          : {}),
        ...(numberInRange(event.recoveryScore, 0, 1)
          ? { recovery_score: event.recoveryScore }
          : {}),
      })),
    confirmed_preferences: preferences
      .filter((preference) => preference.userConfirmed)
      .slice(0, 5)
      .map((preference) => preference.description.trim().slice(0, 160))
      .filter(Boolean),
  };
}

function numberInRange(
  value: number | undefined,
  min: number,
  max: number,
): value is number {
  return typeof value === "number" && value >= min && value <= max;
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
