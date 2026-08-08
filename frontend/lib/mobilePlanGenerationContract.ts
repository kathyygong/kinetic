import type { PlanWeek, WeekPhase, Workout, WorkoutType } from "./planGenerator";
import type { Goal, UserProfile } from "./types";
import type { MobilePlanSnapshot } from "./mobilePlanLifecycleContract";

export const MOBILE_PLAN_GENERATION_SCHEMA = "mobile-plan-generation.v1" as const;

export type MobilePlanGenerationRequest = {
  schema_version: typeof MOBILE_PLAN_GENERATION_SCHEMA;
  platform: "web" | "ios";
  mode: "initial" | "regenerate_future";
  planning_date: string;
  race_distance: "5k" | "10k" | "half" | "marathon";
  target_date: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  weekly_mileage: number | null;
  preferred_days: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
  personal_bests_seconds: Partial<Record<"5k" | "10k" | "half" | "marathon", number>>;
  goal_revision: number;
  current_plan: MobilePlanSnapshot | null;
};

export type PlanGenerationExplanationCode =
  | "base_volume"
  | "preferred_days_applied"
  | "recovery_load"
  | "taper_load"
  | "race_week"
  | "completed_history_preserved"
  | "future_workouts_regenerated";

export type MobilePlanWeekMetadata = {
  week_number: number;
  phase: WeekPhase;
  start_date: string;
  end_date: string;
  workout_ids: string[];
  explanation_codes: PlanGenerationExplanationCode[];
};

export type MobilePlanGenerationResponse = {
  schema_version: typeof MOBILE_PLAN_GENERATION_SCHEMA;
  mode: "initial" | "regenerate_future";
  source: "deterministic_shared";
  mutation_performed: false;
  candidate_plan: MobilePlanSnapshot;
  weeks: MobilePlanWeekMetadata[];
  explanation_codes: PlanGenerationExplanationCode[];
};

const PHASES = ["build", "recovery", "taper", "race"] as const;
const EXPLANATIONS = [
  "base_volume",
  "preferred_days_applied",
  "recovery_load",
  "taper_load",
  "race_week",
  "completed_history_preserved",
  "future_workouts_regenerated",
] as const;

export function buildInitialPlanGenerationRequest(
  goal: Goal,
  profile?: UserProfile | null,
  planningDate = new Date(),
): MobilePlanGenerationRequest {
  return {
    schema_version: MOBILE_PLAN_GENERATION_SCHEMA,
    platform: "web",
    mode: "initial",
    planning_date: localISODate(planningDate),
    race_distance: goal.race_distance,
    target_date: goal.target_date,
    experience_level: profile?.experience_level ?? goal.experience_level,
    weekly_mileage: profile?.weekly_mileage ?? goal.weekly_mileage ?? null,
    preferred_days: [...(profile?.preferred_training_days ?? [])],
    personal_bests_seconds: { ...(profile?.personal_bests ?? goal.current_prs) },
    goal_revision: 1,
    current_plan: null,
  };
}

export function parseMobilePlanGenerationResponse(
  value: unknown,
): MobilePlanGenerationResponse {
  const response = record(value, "plan generation response");
  exact(response, [
    "schema_version",
    "mode",
    "source",
    "mutation_performed",
    "candidate_plan",
    "weeks",
    "explanation_codes",
  ]);
  equal(response.schema_version, MOBILE_PLAN_GENERATION_SCHEMA, "schema");
  member(response.mode, ["initial", "regenerate_future"], "mode");
  equal(response.source, "deterministic_shared", "source");
  equal(response.mutation_performed, false, "mutation flag");
  parseSnapshot(response.candidate_plan);
  if (!Array.isArray(response.weeks) || response.weeks.length < 4 || response.weeks.length > 20) {
    throw new Error("Invalid generated weeks.");
  }
  for (const candidate of response.weeks) {
    const week = record(candidate, "generated week");
    exact(week, ["week_number", "phase", "start_date", "end_date", "workout_ids", "explanation_codes"]);
    whole(week.week_number, 1, "week number", 20);
    member(week.phase, PHASES, "week phase");
    isoDate(week.start_date, "week start");
    isoDate(week.end_date, "week end");
    stringArray(week.workout_ids, "workout ids", 1, 5);
    enumArray(week.explanation_codes, EXPLANATIONS, "week explanations");
  }
  enumArray(response.explanation_codes, EXPLANATIONS, "explanations");
  assertPrivacySafe(response);
  return response as MobilePlanGenerationResponse;
}

export function generationResponseToPlanWeeks(
  response: MobilePlanGenerationResponse,
): PlanWeek[] {
  const workouts = new Map(
    response.candidate_plan.workouts.map((workout) => [workout.id, workout]),
  );
  return response.weeks.map((week) => ({
    weekNumber: week.week_number,
    phase: week.phase,
    workouts: week.workout_ids.map((id): Workout => {
      const workout = workouts.get(id);
      if (!workout) throw new Error(`Generated week references missing workout ${id}.`);
      return {
        day: dayLabel(workout.date),
        type: webWorkoutType(workout.type),
        distance: workout.distance_miles,
        pace: (workout.pace_seconds_per_mile ?? 0) / 60,
        duration: workout.duration_minutes,
      };
    }),
  }));
}

function parseSnapshot(value: unknown): MobilePlanSnapshot {
  const snapshot = record(value, "candidate plan");
  exact(snapshot, ["id", "version", "status", "goal_revision", "workouts"]);
  boundedString(snapshot.id, 1, 80, "plan id");
  whole(snapshot.version, 1, "plan version");
  member(snapshot.status, ["draft", "active", "paused", "completed"], "plan status");
  whole(snapshot.goal_revision, 1, "goal revision");
  if (!Array.isArray(snapshot.workouts) || snapshot.workouts.length < 1 || snapshot.workouts.length > 200) {
    throw new Error("Invalid generated workouts.");
  }
  const ids = new Set<string>();
  for (const candidate of snapshot.workouts) {
    const workout = record(candidate, "generated workout");
    exact(workout, ["id", "date", "type", "status", "distance_miles", "duration_minutes", "pace_seconds_per_mile", "reason_code"]);
    boundedString(workout.id, 1, 80, "workout id");
    if (ids.has(workout.id as string)) throw new Error("Duplicate generated workout id.");
    ids.add(workout.id as string);
    isoDate(workout.date, "workout date");
    member(workout.type, ["easy", "tempo", "intervals", "long_run", "race"], "workout type");
    member(workout.status, ["scheduled", "completed", "skipped"], "workout status");
    boundedNumber(workout.distance_miles, 0, 40, "distance");
    whole(workout.duration_minutes, 0, "duration", 480);
    if (workout.pace_seconds_per_mile !== null) whole(workout.pace_seconds_per_mile, 180, "pace", 1800);
    member(workout.reason_code, ["base_plan", "availability", "preferred_day", "runner_edit", "future_regeneration", "race_day"], "reason code");
  }
  return snapshot as MobilePlanSnapshot;
}

function webWorkoutType(value: MobilePlanSnapshot["workouts"][number]["type"]): WorkoutType {
  return value === "long_run" ? "long run" : value;
}

function dayLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parsed.getUTCDay()];
}

function localISODate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function assertPrivacySafe(value: unknown): void {
  walk(value, (key) => {
    if (/^(uid|email|full_?name|token|secret|raw_|pain|medical|biometric)/i.test(key)) {
      throw new Error(`Forbidden plan generation key: ${key}`);
    }
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error("Unexpected plan generation keys.");
}

function equal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`Invalid ${label}.`);
}

function member<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`Invalid ${label}.`);
  return value as T;
}

function boundedString(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new Error(`Invalid ${label}.`);
}

function boundedNumber(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
}

function whole(value: unknown, min: number, label: string, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${label}.`);
}

function isoDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Invalid ${label}.`);
}

function stringArray(value: unknown, label: string, min: number, max: number): void {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((entry) => typeof entry !== "string")) throw new Error(`Invalid ${label}.`);
}

function enumArray<T extends string>(value: unknown, options: readonly T[], label: string): void {
  if (!Array.isArray(value) || value.length < 1 || new Set(value).size !== value.length || value.some((entry) => typeof entry !== "string" || !options.includes(entry as T))) throw new Error(`Invalid ${label}.`);
}

function walk(value: unknown, visit: (key: string) => void): void {
  if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visit(key);
      walk(child, visit);
    }
  }
}
