import type { IntakeDay, IntakeDraft } from "@/lib/api";
import {
  adjustPlanForWeek,
  type CalendarAvailability,
  type DayLabel,
  type EasyOnlyDay,
} from "@/lib/planAdjuster";
import {
  applyPreferredDays,
  generateTrainingPlan,
} from "@/lib/planGenerator";
import { emptyProfile, saveUserProfile } from "@/lib/profileStorage";
import { startOfWeek } from "@/lib/scheduling";
import {
  planSignature,
  saveGoal,
  savePlan,
  type SavedPlan,
} from "@/lib/storage";
import type {
  DayOfWeek,
  ExperienceLevel,
  Goal,
  RaceDistance,
  UserProfile,
} from "@/lib/types";

const RACES = new Set<RaceDistance>(["5k", "10k", "half", "marathon"]);
const EXPERIENCE = new Set<ExperienceLevel>([
  "beginner",
  "intermediate",
  "advanced",
]);
const DAYS: IntakeDay[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];
const DAY_LABEL: Record<IntakeDay, DayLabel> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export type IntakeValidation = {
  valid: boolean;
  errors: string[];
};

export type ConfirmedIntakeState = {
  goal: Goal | null;
  profile: UserProfile;
  savedPlan: SavedPlan | null;
  appliedCount: number;
};

export function validateIntakeDraft(
  draft: IntakeDraft,
  sourceText: string,
  today: string,
  currentGoal: Goal | null,
): IntakeValidation {
  const errors: string[] = [];
  const changes = [
    ...draft.goal_changes,
    ...draft.schedule_changes,
    ...draft.availability_changes,
    ...draft.preference_changes,
  ];
  const ids = new Set<string>();
  const grounding = new Map(
    draft.grounding.map((item) => [item.change_id, item.evidence]),
  );
  const source = sourceText.toLocaleLowerCase();

  if (draft.status !== "ready" || changes.length === 0) {
    errors.push("The draft has no complete changes to apply.");
  }

  for (const change of changes) {
    if (!change.id || ids.has(change.id)) {
      errors.push("Every proposed change must have a unique identifier.");
    }
    ids.add(change.id);
    const evidence = grounding.get(change.id)?.trim();
    if (!evidence || !source.includes(evidence.toLocaleLowerCase())) {
      errors.push(`Change ${change.id || "unknown"} is not grounded in the note.`);
    }
  }

  for (const change of draft.goal_changes) {
    if (change.field === "race_distance") {
      if (!RACES.has(change.value as RaceDistance)) {
        errors.push("Race distance is unsupported.");
      }
    } else if (change.field === "target_date") {
      if (
        typeof change.value !== "string" ||
        !isValidISODate(change.value) ||
        change.value <= today
      ) {
        errors.push("Target date must be a valid future ISO date.");
      }
    } else if (
      typeof change.value !== "number" ||
      !Number.isFinite(change.value) ||
      change.value < 1 ||
      change.value > 150
    ) {
      errors.push("Weekly mileage must be between 1 and 150.");
    }
  }

  for (const change of draft.schedule_changes) {
    if (
      change.field !== "preferred_training_days" ||
      change.value.length === 0 ||
      change.value.length > 7 ||
      change.value.some((day) => !DAYS.includes(day))
    ) {
      errors.push("Preferred training days are invalid.");
    }
  }

  for (const change of draft.availability_changes) {
    if (!DAYS.includes(change.day)) {
      errors.push("Availability contains an unsupported day.");
    }
    if (
      change.available_minutes !== null &&
      (!Number.isInteger(change.available_minutes) ||
        change.available_minutes < 0 ||
        change.available_minutes > 240)
    ) {
      errors.push("Availability must be a whole number from 0 to 240.");
    }
    if (change.available_minutes === null && !change.easy_only) {
      errors.push("Availability needs minutes or an easy-only constraint.");
    }
  }

  for (const change of draft.preference_changes) {
    if (
      change.field !== "experience_level" ||
      !EXPERIENCE.has(change.value)
    ) {
      errors.push("Experience preference is invalid.");
    }
  }

  if (!currentGoal && draft.availability_changes.length > 0) {
    errors.push("Set a race goal before applying availability to a plan.");
  }
  if (!currentGoal && draft.goal_changes.length > 0) {
    const fields = new Set(draft.goal_changes.map((change) => change.field));
    if (!fields.has("race_distance") || !fields.has("target_date")) {
      errors.push("A new goal needs both a race distance and target date.");
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function buildConfirmedIntakeState({
  draft,
  sourceText,
  today,
  currentGoal,
  currentProfile,
  currentPlan,
}: {
  draft: IntakeDraft;
  sourceText: string;
  today: string;
  currentGoal: Goal | null;
  currentProfile: UserProfile | null;
  currentPlan: SavedPlan | null;
}): ConfirmedIntakeState {
  const validation = validateIntakeDraft(
    draft,
    sourceText,
    today,
    currentGoal,
  );
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  let goal = currentGoal ? structuredClone(currentGoal) : null;
  const profile = structuredClone(currentProfile ?? emptyProfile());

  if (!goal && draft.goal_changes.length > 0) {
    const race = draft.goal_changes.find(
      (change) => change.field === "race_distance",
    )?.value as RaceDistance;
    const target = draft.goal_changes.find(
      (change) => change.field === "target_date",
    )?.value as string;
    goal = {
      goal_type: "race",
      race_distance: race,
      target_date: target,
      experience_level: profile.experience_level,
      current_prs: { ...profile.personal_bests },
    };
  }

  for (const change of draft.goal_changes) {
    if (!goal) continue;
    if (change.field === "race_distance") {
      goal.race_distance = change.value as RaceDistance;
    } else if (change.field === "target_date") {
      goal.target_date = change.value as string;
    } else {
      const mileage = Number(change.value);
      goal.weekly_mileage = mileage;
      profile.weekly_mileage = mileage;
    }
  }
  for (const change of draft.schedule_changes) {
    profile.preferred_training_days = [
      ...new Set(change.value),
    ] as DayOfWeek[];
  }
  for (const change of draft.preference_changes) {
    profile.experience_level = change.value;
    if (goal) goal.experience_level = change.value;
  }

  const planInputsChanged =
    draft.goal_changes.length > 0 ||
    draft.schedule_changes.length > 0 ||
    draft.preference_changes.length > 0;
  let savedPlan = currentPlan ? structuredClone(currentPlan) : null;

  if (goal && (planInputsChanged || !savedPlan)) {
    const weeks = applyPreferredDays(
      generateTrainingPlan(goal),
      profile.preferred_training_days,
    );
    savedPlan = {
      planStart: currentPlan?.planStart ?? startOfWeek().toISOString(),
      goalSig: planSignature(goal, profile),
      weeks,
      reasoning: [],
      easyOnlyDays: [],
      savedAt: new Date().toISOString(),
    };
  }

  if (savedPlan && draft.availability_changes.length > 0) {
    if (!savedPlan.weeks[0]) {
      throw new Error("The current plan has no week available to adjust.");
    }
    const availability: CalendarAvailability = {};
    const easyOnly: EasyOnlyDay[] = [];
    for (const change of draft.availability_changes) {
      const day = DAY_LABEL[change.day];
      if (change.available_minutes !== null) {
        availability[day] = change.available_minutes;
      }
      if (change.easy_only) {
        easyOnly.push({
          day,
          reason: "Confirmed natural-language intake constraint",
        });
      }
    }
    const adjusted = adjustPlanForWeek(
      savedPlan.weeks[0],
      availability,
      easyOnly,
    );
    savedPlan = {
      ...savedPlan,
      weeks: [
        {
          weekNumber: adjusted.weekNumber,
          phase: adjusted.phase,
          workouts: adjusted.workouts.map((workout) => ({ ...workout })),
        },
        ...savedPlan.weeks.slice(1).map((week) => structuredClone(week)),
      ],
      reasoning: adjusted.adjustments.map((change) => change.reason),
      easyOnlyDays: easyOnly.map((entry) => ({
        weekIndex: 0,
        day: entry.day,
        reason: entry.reason,
      })),
      goalSig: goal ? planSignature(goal, profile) : savedPlan.goalSig,
      savedAt: new Date().toISOString(),
    };
  }

  return {
    goal,
    profile,
    savedPlan,
    appliedCount:
      draft.goal_changes.length +
      draft.schedule_changes.length +
      draft.availability_changes.length +
      draft.preference_changes.length,
  };
}

export function persistConfirmedIntake(state: ConfirmedIntakeState): void {
  if (state.goal) saveGoal(state.goal);
  saveUserProfile(state.profile);
  if (state.savedPlan) savePlan(state.savedPlan);
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
