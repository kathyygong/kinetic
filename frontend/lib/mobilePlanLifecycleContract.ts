export const MOBILE_PLAN_LIFECYCLE_SCHEMA = "mobile-plan-lifecycle.v1" as const;

export type MobilePlanWorkout = {
  id: string;
  date: string;
  type: "easy" | "tempo" | "intervals" | "long_run" | "race";
  status: "scheduled" | "completed" | "skipped";
  distance_miles: number;
  duration_minutes: number;
  pace_seconds_per_mile: number | null;
  reason_code:
    | "base_plan"
    | "availability"
    | "preferred_day"
    | "runner_edit"
    | "future_regeneration"
    | "race_day";
};

export type MobilePlanSnapshot = {
  id: string;
  version: number;
  status: "draft" | "active" | "paused" | "completed";
  goal_revision: number;
  workouts: MobilePlanWorkout[];
};

export type MobilePlanLifecycleRequest = {
  schema_version: typeof MOBILE_PLAN_LIFECYCLE_SCHEMA;
  platform: "ios";
  mode: "preview" | "commit";
  operation_id: string;
  request_fingerprint: string;
  expected_version: number;
  current_plan: MobilePlanSnapshot | null;
  proposed_plan: MobilePlanSnapshot;
  mutation: {
    action:
      | "generate"
      | "save"
      | "move"
      | "shorten"
      | "replace"
      | "skip"
      | "availability"
      | "preferred_day"
      | "regenerate_future"
      | "pause"
      | "resume";
    target_workout_id: string | null;
    explanation_code: string;
  };
  prior_operation: {
    operation_id: string;
    request_fingerprint: string;
    committed_version: number;
  } | null;
};

export type MobilePlanLifecycleResponse = {
  schema_version: typeof MOBILE_PLAN_LIFECYCLE_SCHEMA;
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
  commit_plan: MobilePlanSnapshot | null;
  persistence: {
    required: boolean;
    owner_scoped_domains: ["plan", "plan_history", "plan_operations"];
    transaction_preconditions: [
      "authenticated_owner",
      "current_version_matches",
      "operation_id_absent_or_matching",
    ];
  };
};

export function parseMobilePlanLifecycleRequest(
  value: unknown,
): MobilePlanLifecycleRequest {
  const request = record(value, "plan lifecycle request");
  exact(request, [
    "schema_version",
    "platform",
    "mode",
    "operation_id",
    "request_fingerprint",
    "expected_version",
    "current_plan",
    "proposed_plan",
    "mutation",
    "prior_operation",
  ]);
  equal(request.schema_version, MOBILE_PLAN_LIFECYCLE_SCHEMA, "schema");
  equal(request.platform, "ios", "platform");
  member(request.mode, ["preview", "commit"], "mode");
  boundedString(request.operation_id, 8, 100, "operation id");
  boundedString(request.request_fingerprint, 8, 128, "request fingerprint");
  whole(request.expected_version, 0, "expected version");
  const current =
    request.current_plan === null ? null : parseSnapshot(request.current_plan);
  const proposed = parseSnapshot(request.proposed_plan);
  const mutation = record(request.mutation, "mutation");
  exact(mutation, ["action", "target_workout_id", "explanation_code"]);
  const action = member(mutation.action, [
    "generate",
    "save",
    "move",
    "shorten",
    "replace",
    "skip",
    "availability",
    "preferred_day",
    "regenerate_future",
    "pause",
    "resume",
  ], "action");
  if (mutation.target_workout_id !== null) {
    boundedString(mutation.target_workout_id, 1, 80, "target workout");
  }
  member(mutation.explanation_code, [
    "initial_generation",
    "runner_confirmed",
    "schedule_change",
    "duration_change",
    "workout_replacement",
    "runner_skip",
    "availability_change",
    "preferred_day_confirmation",
    "goal_or_preference_change",
    "runner_pause",
    "runner_resume",
  ], "explanation code");
  if (!current && (action !== "generate" || request.expected_version !== 0)) {
    throw new Error("A missing current plan is valid only for generation.");
  }
  if (current && request.expected_version !== current.version) {
    // A conflict request is valid on the wire and is rejected by authority.
  }
  if (proposed.version < 1) throw new Error("Proposed version must be positive.");
  if (request.prior_operation !== null) {
    const prior = record(request.prior_operation, "prior operation");
    exact(prior, ["operation_id", "request_fingerprint", "committed_version"]);
    boundedString(prior.operation_id, 8, 100, "prior operation id");
    boundedString(prior.request_fingerprint, 8, 128, "prior fingerprint");
    whole(prior.committed_version, 1, "committed version");
  }
  assertPrivacySafe(request);
  return request as MobilePlanLifecycleRequest;
}

export function parseMobilePlanLifecycleResponse(
  value: unknown,
): MobilePlanLifecycleResponse {
  const response = record(value, "plan lifecycle response");
  exact(response, [
    "schema_version",
    "result",
    "mutation_performed",
    "base_version",
    "proposed_version",
    "reason_codes",
    "impact",
    "commit_plan",
    "persistence",
  ]);
  equal(response.schema_version, MOBILE_PLAN_LIFECYCLE_SCHEMA, "schema");
  const result = member(response.result, [
    "preview",
    "commit_ready",
    "replayed",
    "conflict",
    "rejected",
  ], "result");
  equal(response.mutation_performed, false, "mutation flag");
  whole(response.base_version, 0, "base version");
  const baseVersion = response.base_version as number;
  if (response.proposed_version !== null) {
    whole(response.proposed_version, 1, "proposed version");
  }
  enumArray(response.reason_codes, [
    "accepted",
    "version_conflict",
    "idempotency_conflict",
    "completed_history_changed",
    "race_day_changed",
    "invalid_version_increment",
    "duplicate_workout_id",
    "invalid_action_transition",
    "plan_identity_changed",
    "goal_revision_changed",
    "invalid_action_delta",
    "duplicate_workout_date",
    "spacing_violation",
    "race_day_missing_or_invalid",
  ], "reason codes");
  const impact = record(response.impact, "impact");
  exact(impact, [
    "affected_workout_ids",
    "completed_workouts_preserved",
    "total_workouts_before",
    "total_workouts_after",
    "warnings",
  ]);
  stringArray(impact.affected_workout_ids, "affected workout ids");
  whole(impact.completed_workouts_preserved, 0, "completed preserved");
  whole(impact.total_workouts_before, 0, "workouts before");
  whole(impact.total_workouts_after, 0, "workouts after");
  enumArray(impact.warnings, [
    "completed_history_locked",
    "race_day_locked",
    "spacing_requires_review",
    "weekly_growth_requires_review",
  ], "warnings", true);
  const commitPlan =
    response.commit_plan === null ? null : parseSnapshot(response.commit_plan);
  const persistence = record(response.persistence, "persistence");
  exact(persistence, [
    "required",
    "owner_scoped_domains",
    "transaction_preconditions",
  ]);
  if (typeof persistence.required !== "boolean") {
    throw new Error("Invalid persistence requirement.");
  }
  equalList(persistence.owner_scoped_domains, [
    "plan",
    "plan_history",
    "plan_operations",
  ], "persistence domains");
  equalList(persistence.transaction_preconditions, [
    "authenticated_owner",
    "current_version_matches",
    "operation_id_absent_or_matching",
  ], "transaction preconditions");
  if (persistence.required !== (result === "commit_ready")) {
    throw new Error("Only commit_ready responses require persistence.");
  }
  if (
    (result === "commit_ready" || result === "preview") &&
    (commitPlan === null ||
      response.proposed_version !== baseVersion + 1 ||
      commitPlan.version !== response.proposed_version)
  ) {
    throw new Error("Accepted responses require a sequential commit plan.");
  }
  if (
    (result === "conflict" || result === "rejected" || result === "replayed") &&
    commitPlan !== null
  ) {
    throw new Error("Non-accepted responses cannot include a commit plan.");
  }
  if (result === "replayed" && response.proposed_version === null) {
    throw new Error("Replayed responses require the committed version.");
  }
  assertPrivacySafe(response);
  return response as MobilePlanLifecycleResponse;
}

function parseSnapshot(value: unknown): MobilePlanSnapshot {
  const snapshot = record(value, "plan snapshot");
  exact(snapshot, ["id", "version", "status", "goal_revision", "workouts"]);
  boundedString(snapshot.id, 1, 80, "plan id");
  whole(snapshot.version, 0, "plan version");
  member(snapshot.status, ["draft", "active", "paused", "completed"], "plan status");
  whole(snapshot.goal_revision, 1, "goal revision");
  if (!Array.isArray(snapshot.workouts) || snapshot.workouts.length < 1 || snapshot.workouts.length > 200) {
    throw new Error("Invalid workouts.");
  }
  const ids = new Set<string>();
  for (const candidate of snapshot.workouts) {
    const workout = record(candidate, "workout");
    exact(workout, [
      "id",
      "date",
      "type",
      "status",
      "distance_miles",
      "duration_minutes",
      "pace_seconds_per_mile",
      "reason_code",
    ]);
    boundedString(workout.id, 1, 80, "workout id");
    if (ids.has(workout.id as string)) throw new Error("Duplicate workout id.");
    ids.add(workout.id as string);
    isoDate(workout.date, "workout date");
    member(workout.type, ["easy", "tempo", "intervals", "long_run", "race"], "workout type");
    member(workout.status, ["scheduled", "completed", "skipped"], "workout status");
    boundedNumber(workout.distance_miles, 0, 40, "distance");
    whole(workout.duration_minutes, 0, "duration", 480);
    if (workout.pace_seconds_per_mile !== null) {
      whole(workout.pace_seconds_per_mile, 180, "pace", 1800);
    }
    member(workout.reason_code, [
      "base_plan",
      "availability",
      "preferred_day",
      "runner_edit",
      "future_regeneration",
      "race_day",
    ], "reason code");
  }
  return snapshot as MobilePlanSnapshot;
}

function assertPrivacySafe(value: unknown): void {
  walk(value, (key) => {
    if (/^(uid|email|full_?name|token|secret|raw_|pain|medical|biometric)/i.test(key)) {
      throw new Error(`Forbidden plan lifecycle key: ${key}`);
    }
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected keys: ${actual.join(",")}.`);
  }
}

function equal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`Invalid ${label}.`);
}

function equalList(value: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function member<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as T;
}

function boundedString(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
}

function boundedNumber(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}.`);
  }
}

function whole(value: unknown, min: number, label: string, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isoDate(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new Error(`Invalid ${label}.`);
  }
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid ${label}.`);
  }
}

function enumArray<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
  allowEmpty = false,
): asserts value is T[] {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((entry) => typeof entry !== "string" || !options.includes(entry as T)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`Invalid ${label}.`);
  }
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
