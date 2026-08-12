import type { PlanWeek, Workout, WorkoutType } from "./planGenerator";
import type { Goal, UserProfile, WeeklyAvailability } from "./types";
import type { MobilePlanSnapshot, MobilePlanWorkout } from "./mobilePlanLifecycleContract";

export const MOBILE_PLAN_GENERATION_V2_SCHEMA = "mobile-plan-generation.v2" as const;
export const MOBILE_PLAN_LIFECYCLE_V2_SCHEMA = "mobile-plan-lifecycle.v2" as const;
export const MOBILE_ACCOUNT_CLEANUP_SCHEMA = "mobile-account-cleanup.v1" as const;

export type MobilePlanningInputs = {
  revision: number;
  race_distance: Goal["race_distance"];
  target_date: string;
  experience_level: UserProfile["experience_level"];
  weekly_mileage: number | null;
  preferred_days: UserProfile["preferred_training_days"];
  personal_bests_seconds: UserProfile["personal_bests"];
  weekly_availability: WeeklyAvailability[];
};

export type PlanMetadata = {
  plan_version: number;
  weeks: Array<{
    week_number: number;
    phase: "build" | "recovery" | "taper" | "race";
    start_date: string;
    end_date: string;
    workout_ids: string[];
    explanation_codes: string[];
  }>;
  explanation_codes: string[];
};

export type MobilePlanSnapshotV2 = MobilePlanSnapshot & { metadata: PlanMetadata };

export type MobilePlanGenerationRequestV2 = {
  schema_version: typeof MOBILE_PLAN_GENERATION_V2_SCHEMA;
  platform: "web" | "ios";
  mode: "initial" | "regenerate_future";
  planning_date: string;
  planning_inputs: MobilePlanningInputs;
  current_plan: MobilePlanSnapshotV2 | MobilePlanSnapshot | null;
};

export type MobilePlanGenerationResponseV2 = {
  schema_version: typeof MOBILE_PLAN_GENERATION_V2_SCHEMA;
  mode: "initial" | "regenerate_future";
  source: "deterministic_shared";
  mutation_performed: false;
  candidate_plan: MobilePlanSnapshotV2;
};

export type MobilePlanLifecycleResponseV2 = {
  schema_version: typeof MOBILE_PLAN_LIFECYCLE_V2_SCHEMA;
  result: "preview" | "commit_ready" | "replayed" | "conflict" | "rejected";
  mutation_performed: false;
  base_version: number;
  proposed_version: number | null;
  reason_codes: string[];
  impact: {
    affected_workout_ids: string[];
    completed_workouts_preserved: number;
    total_workouts_before: number;
    total_workouts_after: number;
    warnings: string[];
  };
  commit_plan: MobilePlanSnapshotV2 | null;
  commit_planning_inputs: MobilePlanningInputs | null;
  persistence: {
    required: boolean;
    owner_scoped_domains: ["profile", "goal", "plan", "plan_history", "plan_operations"];
    transaction_preconditions: ["authenticated_owner", "current_version_matches", "planning_revision_matches", "operation_id_absent_or_matching"];
  };
};

export type MobilePlanLifecycleRequestV2 = {
  schema_version: typeof MOBILE_PLAN_LIFECYCLE_V2_SCHEMA;
  platform: "web" | "ios";
  mode: "preview" | "commit";
  operation_id: string;
  request_fingerprint: string;
  expected_version: number;
  current_plan: MobilePlanSnapshotV2 | MobilePlanSnapshot | null;
  proposed_plan: MobilePlanSnapshotV2;
  current_planning_inputs: MobilePlanningInputs | null;
  proposed_planning_inputs: MobilePlanningInputs;
  mutation: { action: string; target_workout_id: string | null; explanation_code: string };
  prior_operation: { operation_id: string; request_fingerprint: string; committed_version: number } | null;
};

export type MobileAccountCleanupRequest = {
  schema_version: typeof MOBILE_ACCOUNT_CLEANUP_SCHEMA;
  platform: "web" | "ios";
  mode: "cleanup" | "finalize_auth";
  operation_id: string;
  request_fingerprint: string;
};

export type MobileAccountCleanupResponse = {
  schema_version: typeof MOBILE_ACCOUNT_CLEANUP_SCHEMA;
  result: "progress" | "replayed" | "reauthentication_required" | "completed";
  mutation_performed: boolean;
  receipt: {
    revision: number;
    status: "cleanup_pending" | "reauthentication_required" | "ready_for_auth_deletion" | "completed";
    pending_domains: string[];
    auth_state: "retained" | "deletion_started" | "deleted";
    last_operation_id: string;
    last_request_fingerprint: string;
    updated_at: string;
  };
};

const PHASES = ["build", "recovery", "taper", "race"] as const;
const EXPLANATIONS = [
  "base_volume", "preferred_days_applied", "weekly_availability_applied",
  "recovery_load", "taper_load", "race_week", "completed_history_preserved",
  "future_workouts_regenerated",
] as const;
const OWNER_DOMAINS = [
  "profile", "goal", "plan", "plan_history", "plan_operations", "readiness",
  "workouts", "recommendations", "preferences", "settings", "onboarding",
  "dismissed_preferences", "today", "schedule", "calendar_sync",
  "calendar_failure", "health_sync", "mobile_audit",
] as const;

export function buildInitialPlanGenerationRequestV2(
  goal: Goal,
  profile?: UserProfile | null,
  planningDate = new Date(),
): MobilePlanGenerationRequestV2 {
  return {
    schema_version: MOBILE_PLAN_GENERATION_V2_SCHEMA,
    platform: "web",
    mode: "initial",
    planning_date: localISODate(planningDate),
    planning_inputs: {
      revision: 1,
      race_distance: goal.race_distance,
      target_date: goal.target_date,
      experience_level: profile?.experience_level ?? goal.experience_level,
      weekly_mileage: profile?.weekly_mileage ?? goal.weekly_mileage ?? null,
      preferred_days: [...(profile?.preferred_training_days ?? [])],
      personal_bests_seconds: { ...(profile?.personal_bests ?? goal.current_prs) },
      weekly_availability: [...(profile?.weekly_availability ?? [])],
    },
    current_plan: null,
  };
}

export function parseMobilePlanGenerationResponseV2(value: unknown): MobilePlanGenerationResponseV2 {
  const response = record(value, "v2 generation response");
  exact(response, ["schema_version", "mode", "source", "mutation_performed", "candidate_plan"]);
  equal(response.schema_version, MOBILE_PLAN_GENERATION_V2_SCHEMA, "schema");
  member(response.mode, ["initial", "regenerate_future"], "mode");
  equal(response.source, "deterministic_shared", "source");
  equal(response.mutation_performed, false, "mutation flag");
  parseSnapshotV2(response.candidate_plan);
  privacy(response);
  return response as MobilePlanGenerationResponseV2;
}

export function parseMobileAccountCleanupResponse(value: unknown): MobileAccountCleanupResponse {
  const response = record(value, "account cleanup response");
  exact(response, ["schema_version", "result", "receipt", "mutation_performed"]);
  equal(response.schema_version, MOBILE_ACCOUNT_CLEANUP_SCHEMA, "schema");
  member(response.result, ["progress", "replayed", "reauthentication_required", "completed"], "result");
  if (typeof response.mutation_performed !== "boolean") throw new Error("Invalid mutation flag.");
  const receipt = record(response.receipt, "cleanup receipt");
  exact(receipt, ["revision", "status", "pending_domains", "auth_state", "last_operation_id", "last_request_fingerprint", "updated_at"]);
  whole(receipt.revision, 1, "receipt revision");
  member(receipt.status, ["cleanup_pending", "reauthentication_required", "ready_for_auth_deletion", "completed"], "status");
  member(receipt.auth_state, ["retained", "deletion_started", "deleted"], "auth state");
  if (!Array.isArray(receipt.pending_domains) || receipt.pending_domains.length > OWNER_DOMAINS.length || new Set(receipt.pending_domains).size !== receipt.pending_domains.length || receipt.pending_domains.some((domain) => typeof domain !== "string" || !OWNER_DOMAINS.includes(domain as typeof OWNER_DOMAINS[number]))) throw new Error("Invalid pending domains.");
  boundedString(receipt.last_operation_id, 8, 100, "operation id");
  boundedString(receipt.last_request_fingerprint, 8, 128, "fingerprint");
  timestamp(receipt.updated_at, "updated at");
  privacy(response);
  return response as MobileAccountCleanupResponse;
}

export function parseMobilePlanLifecycleResponseV2(value: unknown): MobilePlanLifecycleResponseV2 {
  const response = record(value, "v2 lifecycle response");
  exact(response, ["schema_version", "result", "mutation_performed", "base_version", "proposed_version", "reason_codes", "impact", "commit_plan", "commit_planning_inputs", "persistence"]);
  equal(response.schema_version, MOBILE_PLAN_LIFECYCLE_V2_SCHEMA, "schema");
  const result = member(response.result, ["preview", "commit_ready", "replayed", "conflict", "rejected"], "result");
  equal(response.mutation_performed, false, "mutation flag"); whole(response.base_version, 0, "base version");
  if (response.proposed_version !== null) whole(response.proposed_version, 1, "proposed version");
  strings(response.reason_codes, "reason codes", 1, 4);
  const impact = record(response.impact, "impact");
  exact(impact, ["affected_workout_ids", "completed_workouts_preserved", "total_workouts_before", "total_workouts_after", "warnings"]);
  strings(impact.affected_workout_ids, "affected workouts", 0, 200); strings(impact.warnings, "warnings", 0, 4);
  whole(impact.completed_workouts_preserved, 0, "completed workouts"); whole(impact.total_workouts_before, 0, "workouts before"); whole(impact.total_workouts_after, 0, "workouts after");
  if (response.commit_plan !== null) parseSnapshotV2(response.commit_plan);
  if (response.commit_planning_inputs !== null) parsePlanningInputs(response.commit_planning_inputs);
  const persistence = record(response.persistence, "persistence");
  exact(persistence, ["required", "owner_scoped_domains", "transaction_preconditions"]);
  if (typeof persistence.required !== "boolean") throw new Error("Invalid persistence flag.");
  equal(JSON.stringify(persistence.owner_scoped_domains), JSON.stringify(["profile", "goal", "plan", "plan_history", "plan_operations"]), "persistence domains");
  equal(JSON.stringify(persistence.transaction_preconditions), JSON.stringify(["authenticated_owner", "current_version_matches", "planning_revision_matches", "operation_id_absent_or_matching"]), "transaction preconditions");
  if (persistence.required !== (result === "commit_ready")) throw new Error("Persistence result drifted.");
  privacy(response);
  return response as MobilePlanLifecycleResponseV2;
}

export function parseMobilePlanLifecycleRequestV2(value: unknown): MobilePlanLifecycleRequestV2 {
  const request = record(value, "v2 lifecycle request");
  exact(request, ["schema_version", "platform", "mode", "operation_id", "request_fingerprint", "expected_version", "current_plan", "proposed_plan", "current_planning_inputs", "proposed_planning_inputs", "mutation", "prior_operation"]);
  equal(request.schema_version, MOBILE_PLAN_LIFECYCLE_V2_SCHEMA, "schema"); member(request.platform, ["web", "ios"], "platform"); member(request.mode, ["preview", "commit"], "mode");
  boundedString(request.operation_id, 8, 100, "operation id"); boundedString(request.request_fingerprint, 8, 128, "fingerprint"); whole(request.expected_version, 0, "expected version");
  if (request.current_plan !== null) {
    const current = record(request.current_plan, "current plan");
    if ("metadata" in current) parseSnapshotV2(current); else parseLegacySnapshot(current);
  }
  parseSnapshotV2(request.proposed_plan);
  if (request.current_planning_inputs !== null) parsePlanningInputs(request.current_planning_inputs);
  parsePlanningInputs(request.proposed_planning_inputs);
  const mutation = record(request.mutation, "mutation"); exact(mutation, ["action", "target_workout_id", "explanation_code"]);
  member(mutation.action, ["generate", "save", "move", "shorten", "replace", "skip", "availability", "preferred_day", "regenerate_future", "pause", "resume"], "action");
  if (mutation.target_workout_id !== null) boundedString(mutation.target_workout_id, 1, 80, "target workout"); boundedString(mutation.explanation_code, 1, 80, "explanation code");
  if (request.prior_operation !== null) { const prior = record(request.prior_operation, "prior operation"); exact(prior, ["operation_id", "request_fingerprint", "committed_version"]); boundedString(prior.operation_id, 8, 100, "prior id"); boundedString(prior.request_fingerprint, 8, 128, "prior fingerprint"); whole(prior.committed_version, 1, "committed version"); }
  privacy(request);
  return request as MobilePlanLifecycleRequestV2;
}

export function generationResponseV2ToPlanWeeks(response: MobilePlanGenerationResponseV2): PlanWeek[] {
  const workouts = new Map(response.candidate_plan.workouts.map((item) => [item.id, item]));
  return response.candidate_plan.metadata.weeks.map((week) => ({
    weekNumber: week.week_number,
    phase: week.phase,
    workouts: week.workout_ids.map((id): Workout => {
      const workout = workouts.get(id);
      if (!workout) throw new Error(`Metadata references missing workout ${id}.`);
      return {
        day: dayLabel(workout.date), type: webWorkoutType(workout.type),
        distance: workout.distance_miles, pace: (workout.pace_seconds_per_mile ?? 0) / 60,
        duration: workout.duration_minutes,
      };
    }),
  }));
}

function parseSnapshotV2(value: unknown): MobilePlanSnapshotV2 {
  const snapshot = record(value, "v2 plan");
  exact(snapshot, ["id", "version", "status", "goal_revision", "workouts", "metadata"]);
  boundedString(snapshot.id, 1, 80, "plan id"); whole(snapshot.version, 1, "version");
  member(snapshot.status, ["draft", "active", "paused", "completed"], "status");
  whole(snapshot.goal_revision, 1, "planning revision");
  if (!Array.isArray(snapshot.workouts) || snapshot.workouts.length < 1 || snapshot.workouts.length > 200) throw new Error("Invalid workouts.");
  const ids = new Set<string>();
  snapshot.workouts.forEach((value) => { const workout = parseWorkout(value); if (ids.has(workout.id)) throw new Error("Duplicate workout id."); ids.add(workout.id); });
  const metadata = record(snapshot.metadata, "metadata");
  exact(metadata, ["plan_version", "weeks", "explanation_codes"]);
  equal(metadata.plan_version, snapshot.version, "metadata version");
  if (!Array.isArray(metadata.weeks) || metadata.weeks.length < 1 || metadata.weeks.length > 20) throw new Error("Invalid metadata weeks.");
  const metadataIds: string[] = [];
  metadata.weeks.forEach((value) => {
    const week = record(value, "metadata week");
    exact(week, ["week_number", "phase", "start_date", "end_date", "workout_ids", "explanation_codes"]);
    whole(week.week_number, 1, "week number", 20); member(week.phase, PHASES, "phase");
    isoDate(week.start_date, "start date"); isoDate(week.end_date, "end date");
    strings(week.workout_ids, "workout ids", 1, 7); metadataIds.push(...week.workout_ids as string[]);
    enums(week.explanation_codes, EXPLANATIONS, "week explanations");
  });
  enums(metadata.explanation_codes, EXPLANATIONS, "explanations");
  if (metadataIds.length !== ids.size || new Set(metadataIds).size !== ids.size || metadataIds.some((id) => !ids.has(id))) throw new Error("Metadata coverage drifted.");
  return snapshot as MobilePlanSnapshotV2;
}

function parseLegacySnapshot(value: unknown): MobilePlanSnapshot {
  const snapshot = record(value, "legacy plan");
  exact(snapshot, ["id", "version", "status", "goal_revision", "workouts"]);
  boundedString(snapshot.id, 1, 80, "plan id"); whole(snapshot.version, 0, "version"); member(snapshot.status, ["draft", "active", "paused", "completed"], "status"); whole(snapshot.goal_revision, 1, "planning revision");
  if (!Array.isArray(snapshot.workouts) || snapshot.workouts.length < 1 || snapshot.workouts.length > 200) throw new Error("Invalid workouts."); snapshot.workouts.forEach(parseWorkout);
  return snapshot as MobilePlanSnapshot;
}

function parsePlanningInputs(value: unknown): MobilePlanningInputs {
  const inputs = record(value, "planning inputs");
  exact(inputs, ["revision", "race_distance", "target_date", "experience_level", "weekly_mileage", "preferred_days", "personal_bests_seconds", "weekly_availability"]);
  whole(inputs.revision, 1, "planning revision"); member(inputs.race_distance, ["5k", "10k", "half", "marathon"], "race distance");
  isoDate(inputs.target_date, "target date"); member(inputs.experience_level, ["beginner", "intermediate", "advanced"], "experience");
  if (inputs.weekly_mileage !== null) boundedNumber(inputs.weekly_mileage, 1, 150, "weekly mileage");
  if (!Array.isArray(inputs.preferred_days) || inputs.preferred_days.some((day) => typeof day !== "string" || !["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(day)) || new Set(inputs.preferred_days).size !== inputs.preferred_days.length) throw new Error("Invalid preferred days.");
  const bests = record(inputs.personal_bests_seconds, "personal bests"); Object.entries(bests).forEach(([key, seconds]) => { if (!["5k", "10k", "half", "marathon"].includes(key)) throw new Error("Invalid personal-best key."); whole(seconds, 180, "personal best", 86400); });
  if (!Array.isArray(inputs.weekly_availability) || inputs.weekly_availability.length > 7) throw new Error("Invalid weekly availability.");
  const days = new Set<string>(); inputs.weekly_availability.forEach((value) => { const item = record(value, "availability"); exact(item, ["day", "available_minutes", "easy_only"]); const day = member(item.day, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "day"); if (days.has(day)) throw new Error("Duplicate availability day."); days.add(day); whole(item.available_minutes, 0, "available minutes", 240); if (Number(item.available_minutes) > 0 && Number(item.available_minutes) < 15) throw new Error("Positive availability must be at least 15 minutes."); if (typeof item.easy_only !== "boolean") throw new Error("Invalid easy-only flag."); });
  return inputs as MobilePlanningInputs;
}

function parseWorkout(value: unknown): MobilePlanWorkout {
  const workout = record(value, "workout");
  exact(workout, ["id", "date", "type", "status", "distance_miles", "duration_minutes", "pace_seconds_per_mile", "reason_code"]);
  boundedString(workout.id, 1, 80, "workout id"); isoDate(workout.date, "date");
  member(workout.type, ["easy", "tempo", "intervals", "long_run", "race"], "type");
  member(workout.status, ["scheduled", "completed", "skipped"], "status");
  boundedNumber(workout.distance_miles, 0, 40, "distance"); whole(workout.duration_minutes, 0, "duration", 480);
  if (workout.pace_seconds_per_mile !== null) whole(workout.pace_seconds_per_mile, 180, "pace", 1800);
  member(workout.reason_code, ["base_plan", "availability", "preferred_day", "runner_edit", "future_regeneration", "race_day"], "reason");
  return workout as MobilePlanWorkout;
}

function localISODate(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function dayLabel(value: string): string { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${value}T00:00:00Z`).getUTCDay()]; }
function webWorkoutType(value: MobilePlanWorkout["type"]): WorkoutType { return value === "long_run" ? "long run" : value; }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: readonly string[]): void { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error("Unexpected contract keys."); }
function equal(value: unknown, expected: unknown, label: string): void { if (value !== expected) throw new Error(`Invalid ${label}.`); }
function member<T extends string>(value: unknown, options: readonly T[], label: string): T { if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`Invalid ${label}.`); return value as T; }
function boundedString(value: unknown, min: number, max: number, label: string): void { if (typeof value !== "string" || value.length < min || value.length > max) throw new Error(`Invalid ${label}.`); }
function boundedNumber(value: unknown, min: number, max: number, label: string): void { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`); }
function whole(value: unknown, min: number, label: string, max = Number.MAX_SAFE_INTEGER): void { if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${label}.`); }
function strings(value: unknown, label: string, min: number, max: number): void { if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== "string") || new Set(value).size !== value.length) throw new Error(`Invalid ${label}.`); }
function enums<T extends string>(value: unknown, options: readonly T[], label: string): void { if (!Array.isArray(value) || value.length < 1 || new Set(value).size !== value.length || value.some((item) => typeof item !== "string" || !options.includes(item as T))) throw new Error(`Invalid ${label}.`); }
function isoDate(value: unknown, label: string): void { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Invalid ${label}.`); }
function timestamp(value: unknown, label: string): void { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${label}.`); }
function privacy(value: unknown): void { walk(value, (key) => { if (/^(uid|email|full_?name|token|secret|raw_|pain|medical|biometric)/i.test(key)) throw new Error(`Forbidden key: ${key}`); }); }
function walk(value: unknown, visit: (key: string) => void): void { if (Array.isArray(value)) value.forEach((item) => walk(item, visit)); else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => { visit(key); walk(child, visit); }); }
