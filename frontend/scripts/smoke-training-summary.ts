/* Privacy and no-mutation smoke for the training-summary request builder. */

import type {
  LearnedPreference,
  RecommendationEvent,
} from "../lib/behaviorTypes";
import { buildTrainingSummaryRequest } from "../lib/trainingSummary";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const events: RecommendationEvent[] = [
  {
    id: "completed",
    date: "2026-07-01",
    plannedWorkout: "Secret tempo title",
    recommendedWorkout: "Private recommendation",
    selectedAction: "proceed",
    confidence: "high",
    recoveryScore: 0.82,
    availableMinutes: 60,
    userResponse: "accepted",
    rejectionReason: "Sensitive calendar detail",
    actualWorkout: {
      completed: true,
      distanceMiles: 5.2,
      durationMinutes: 48,
      perceivedEffort: 6,
      note: "Private workout note",
    },
    context: { calendarLoad: "heavy", sleepStatus: "normal" },
  },
  {
    id: "skipped",
    date: "2026-06-30",
    plannedWorkout: "Easy run",
    recommendedWorkout: "Rest",
    selectedAction: "rest",
    confidence: "moderate",
    userResponse: "skipped",
    rejectionReason: "Private reason",
    context: {},
  },
  {
    id: "pending",
    date: "2026-06-29",
    plannedWorkout: "Pending workout",
    recommendedWorkout: "Pending workout",
    selectedAction: "proceed",
    confidence: "moderate",
    userResponse: null,
    context: {},
  },
];

const preferences: LearnedPreference[] = [
  {
    id: "confirmed",
    type: "busy_day_preference",
    description: "Prefers shorter sessions on busy days.",
    confidence: "moderate",
    userConfirmed: true,
    createdAt: "2026-06-20T12:00:00.000Z",
  },
  {
    id: "unconfirmed",
    type: "schedule_preference",
    description: "Unconfirmed private inference.",
    confidence: "low",
    userConfirmed: false,
    createdAt: "2026-06-20T12:00:00.000Z",
  },
];

const snapshot = JSON.stringify({ events, preferences });
const request = buildTrainingSummaryRequest(
  "weekly",
  events,
  preferences,
  new Date(2026, 6, 1, 12),
);
const serialized = JSON.stringify(request);

expect(request.as_of === "2026-07-01", "as-of date drifted");
expect(request.events.length === 2, "pending outcome should be excluded");
expect(request.events[0].distance_miles === 5.2, "distance was not preserved");
expect(request.events[1].completed === false, "skip should be a missed session");
expect(
  request.confirmed_preferences.length === 1,
  "unconfirmed preference leaked into summary",
);
for (const sensitive of [
  "Secret tempo title",
  "Private recommendation",
  "Sensitive calendar detail",
  "Private workout note",
  "Private reason",
  "Unconfirmed private inference",
]) {
  expect(!serialized.includes(sensitive), `sensitive field leaked: ${sensitive}`);
}
expect(
  JSON.stringify({ events, preferences }) === snapshot,
  "summary builder mutated its inputs",
);

console.log("OK - training summary input is bounded, private, and immutable");
