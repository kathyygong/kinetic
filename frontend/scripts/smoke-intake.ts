import type { IntakeDraft } from "../lib/api";
import {
  buildConfirmedIntakeState,
  validateIntakeDraft,
} from "../lib/intake";
import { generateTrainingPlan } from "../lib/planGenerator";
import { emptyProfile } from "../lib/profileStorage";
import {
  planSignature,
  type SavedPlan,
} from "../lib/storage";
import type { Goal, UserProfile } from "../lib/types";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const source =
  "Move my race to 2026-10-18, make it a half marathon, run Monday Wednesday Saturday, and I only have 30 minutes Wednesday.";
const draft: IntakeDraft = {
  status: "ready",
  summary: "Four grounded changes.",
  goal_changes: [
    {
      id: "goal-date",
      field: "target_date",
      value: "2026-10-18",
    },
    {
      id: "goal-race",
      field: "race_distance",
      value: "half",
    },
  ],
  schedule_changes: [
    {
      id: "schedule-days",
      field: "preferred_training_days",
      value: ["mon", "wed", "sat"],
    },
  ],
  availability_changes: [
    {
      id: "availability-wed",
      day: "wed",
      available_minutes: 30,
      easy_only: false,
    },
  ],
  preference_changes: [],
  grounding: [
    { change_id: "goal-date", evidence: "2026-10-18" },
    { change_id: "goal-race", evidence: "half marathon" },
    {
      change_id: "schedule-days",
      evidence: "run Monday Wednesday Saturday",
    },
    {
      change_id: "availability-wed",
      evidence: "30 minutes Wednesday",
    },
  ],
  warnings: [],
};

const goal: Goal = {
  goal_type: "race",
  race_distance: "10k",
  target_date: "2026-09-01",
  experience_level: "intermediate",
  current_prs: {},
  weekly_mileage: 25,
};
const profile: UserProfile = {
  ...emptyProfile(),
  preferred_training_days: ["tue", "thu", "sun"],
};
const currentPlan: SavedPlan = {
  planStart: "2026-06-29T00:00:00.000Z",
  goalSig: planSignature(goal, profile),
  weeks: generateTrainingPlan(goal),
  reasoning: [],
  easyOnlyDays: [],
  savedAt: "2026-06-29T00:00:00.000Z",
};

const before = JSON.stringify({ draft, goal, profile, currentPlan });
const validation = validateIntakeDraft(
  draft,
  source,
  "2026-06-29",
  goal,
);
expect(validation.valid, validation.errors.join(" "));

const confirmed = buildConfirmedIntakeState({
  draft,
  sourceText: source,
  today: "2026-06-29",
  currentGoal: goal,
  currentProfile: profile,
  currentPlan,
});
expect(
  JSON.stringify({ draft, goal, profile, currentPlan }) === before,
  "draft confirmation must not mutate its inputs",
);
expect(confirmed.goal?.race_distance === "half", "race change not applied");
expect(
  confirmed.goal?.target_date === "2026-10-18",
  "target date change not applied",
);
expect(
  confirmed.profile.preferred_training_days.join(",") === "mon,wed,sat",
  "schedule change not applied",
);
expect(confirmed.appliedCount === 4, "unexpected confirmed change count");
expect(
  confirmed.savedPlan?.weeks[0].workouts.every(
    (workout) => workout.day !== "Wed" || workout.duration <= 30,
  ) ||
    confirmed.savedPlan?.reasoning.some(
      (reason) =>
        reason.includes("kept as-is") || reason.includes("rescheduling"),
    ),
  "availability must pass through the deterministic plan adjuster",
);

const ungrounded: IntakeDraft = {
  ...draft,
  grounding: draft.grounding.filter(
    (item) => item.change_id !== "goal-race",
  ),
};
expect(
  !validateIntakeDraft(ungrounded, source, "2026-06-29", goal).valid,
  "ungrounded changes must be rejected before apply",
);

const invalidAvailability: IntakeDraft = {
  ...draft,
  availability_changes: [
    {
      id: "availability-wed",
      day: "wed",
      available_minutes: 900,
      easy_only: false,
    },
  ],
};
expect(
  !validateIntakeDraft(
    invalidAvailability,
    source,
    "2026-06-29",
    goal,
  ).valid,
  "unsafe availability must be rejected before apply",
);

console.log(
  "OK - intake drafts stay grounded, immutable, and deterministic on confirmation",
);
