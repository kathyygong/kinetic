import type {
  ManualReadiness,
  ReadinessLog,
} from "./readinessStorage";
import { assertReadinessEntry } from "./mobileReadinessContract";
import type { RecommendationEvent } from "./behaviorTypes";
import type { RecommendationLog } from "./behaviorStorage";
import type {
  WorkoutLog,
  WorkoutLogEntry,
} from "./workoutLog";

export const MOBILE_CHECKIN_SCHEMA = "mobile-checkin.v1" as const;
export const MOBILE_CHECKIN_FIXTURE_SCHEMA =
  "mobile-checkin-fixture.v1" as const;
export const MOBILE_CHECKIN_MAX_LATENCY_MS = 120_000;

export type MobileCheckinDay =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

export type MobileCheckinWorkoutKind =
  | "easy"
  | "tempo"
  | "intervals"
  | "long_run"
  | "race"
  | "rest";

export type MobileCheckinFailureState =
  | "none"
  | "auth_required"
  | "offline"
  | "timeout"
  | "invalid_payload"
  | "state_conflict"
  | "permission_denied"
  | "unknown";

type MobileCheckinBase = {
  schema_version: typeof MOBILE_CHECKIN_SCHEMA;
  platform: "ios";
  local_day: string;
  captured_at: string;
};

export type MobileRecoveryCheckinRequest = MobileCheckinBase & {
  kind: "perceived_recovery";
  recovery: {
    perceived_recovery: 1 | 2 | 3 | 4 | 5;
    fatigue_level: 1 | 2 | 3 | 4 | 5;
    soreness_level: 1 | 2 | 3 | 4 | 5;
    sleep_hours_correction: number | null;
  };
};

export type MobileWorkoutCheckinRequest = MobileCheckinBase & {
  kind: "workout_outcome";
  workout: {
    week_number: number;
    day: MobileCheckinDay;
    scheduled_date: string;
    status: "completed" | "skipped";
    perceived_effort: number | null;
    reflection:
      | "easier_than_expected"
      | "as_expected"
      | "harder_than_expected"
      | null;
    skip_reason:
      | "schedule"
      | "recovery"
      | "pain_or_discomfort"
      | "other"
      | null;
    selected_action: "proceed" | "modify" | "rest";
    confidence_bucket: "low" | "moderate" | "high";
    planned_workout: MobileCheckinWorkoutKind;
    recommended_workout: MobileCheckinWorkoutKind;
    adjustment_response: "accepted" | "rejected" | null;
  };
};

export type MobileCheckinRequest =
  | MobileRecoveryCheckinRequest
  | MobileWorkoutCheckinRequest;

export type MobileCheckinPlanSlot = {
  week_number: number;
  day: MobileCheckinDay;
  scheduled_date: string;
  workout: Exclude<MobileCheckinWorkoutKind, "rest">;
};

export type MobileCheckinState = {
  goal_signature: string;
  plan_slots: MobileCheckinPlanSlot[];
  readiness: ReadinessLog | null;
  workouts: WorkoutLog | null;
  recommendations: RecommendationLog | null;
};

export type MobileCheckinAuditProperties = {
  platform: "ios";
  checkin_kind: "perceived_recovery" | "workout_outcome";
  status: "completed" | "skipped" | "checked_in";
  outcome: "success" | "failed" | "invalid" | "timeout";
  failure_state: MobileCheckinFailureState;
  write_scope: "readiness" | "workouts_recommendations" | "none";
  deterministic_validation: "passed" | "failed" | "not_run";
  has_effort: boolean;
  has_user_reflection: boolean;
  update_succeeded: boolean;
  latency_ms: number;
};

export type MobileCheckinApplyResult = {
  readiness: ReadinessLog | null;
  workouts: WorkoutLog | null;
  recommendations: RecommendationLog | null;
  write_domains: Array<"readiness" | "workouts" | "recommendations">;
  audit: MobileCheckinAuditProperties;
};

export class MobileCheckinValidationError extends Error {}

const DAYS = new Set<MobileCheckinDay>([
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]);
const WORKOUTS = new Set<MobileCheckinWorkoutKind>([
  "easy",
  "tempo",
  "intervals",
  "long_run",
  "race",
  "rest",
]);
const PLAN_WORKOUTS = new Set([
  "easy",
  "tempo",
  "intervals",
  "long_run",
  "race",
]);
const ACTIONS = new Set(["proceed", "modify", "rest"]);
const CONFIDENCE = new Set(["low", "moderate", "high"]);
const REFLECTIONS = new Set([
  "easier_than_expected",
  "as_expected",
  "harder_than_expected",
]);
const SKIP_REASONS = new Set([
  "schedule",
  "recovery",
  "pain_or_discomfort",
  "other",
]);
const FORBIDDEN_REQUEST_KEYS = new Set([
  "uid",
  "email",
  "full_name",
  "name",
  "token",
  "secret",
  "note",
  "notes",
  "raw_note",
  "reflection_text",
  "workout_text",
  "calendar_text",
  "healthkit_samples",
  "raw_samples",
  "hrv",
  "resting_hr",
  "pain_severity",
  "injury",
  "diagnosis",
  "medical_data",
]);

export function assertMobileCheckinRequest(
  value: unknown,
): asserts value is MobileCheckinRequest {
  rejectForbiddenRequestKeys(value);
  const request = object(value, "mobile check-in request");
  if (request.kind === "perceived_recovery") {
    exactKeys(request, [
      "schema_version",
      "platform",
      "kind",
      "local_day",
      "captured_at",
      "recovery",
    ]);
  } else if (request.kind === "workout_outcome") {
    exactKeys(request, [
      "schema_version",
      "platform",
      "kind",
      "local_day",
      "captured_at",
      "workout",
    ]);
  } else {
    invalid("Unsupported mobile check-in kind.");
  }
  if (
    request.schema_version !== MOBILE_CHECKIN_SCHEMA ||
    request.platform !== "ios"
  ) {
    invalid("Unsupported mobile check-in envelope.");
  }
  assertLocalDay(request.local_day, "local_day");
  assertIsoTimestamp(request.captured_at, "captured_at");

  if (request.kind === "perceived_recovery") {
    const recovery = object(request.recovery, "recovery check-in");
    exactKeys(recovery, [
      "perceived_recovery",
      "fatigue_level",
      "soreness_level",
      "sleep_hours_correction",
    ]);
    assertIntegerRange(
      recovery.perceived_recovery,
      1,
      5,
      "perceived_recovery",
    );
    assertIntegerRange(recovery.fatigue_level, 1, 5, "fatigue_level");
    assertIntegerRange(recovery.soreness_level, 1, 5, "soreness_level");
    if (recovery.sleep_hours_correction !== null) {
      assertNumberRange(
        recovery.sleep_hours_correction,
        0,
        24,
        "sleep_hours_correction",
      );
    }
    return;
  }

  const workout = object(request.workout, "workout check-in");
  exactKeys(workout, [
    "week_number",
    "day",
    "scheduled_date",
    "status",
    "perceived_effort",
    "reflection",
    "skip_reason",
    "selected_action",
    "confidence_bucket",
    "planned_workout",
    "recommended_workout",
    "adjustment_response",
  ]);
  assertIntegerRange(workout.week_number, 1, 52, "week_number");
  assertSetValue(workout.day, DAYS, "day");
  assertLocalDay(workout.scheduled_date, "scheduled_date");
  if (workout.scheduled_date !== request.local_day) {
    invalid("Workout check-ins are limited to the current local day.");
  }
  if (workout.status !== "completed" && workout.status !== "skipped") {
    invalid("Unsupported workout status.");
  }
  assertSetValue(workout.selected_action, ACTIONS, "selected_action");
  assertSetValue(workout.confidence_bucket, CONFIDENCE, "confidence_bucket");
  assertSetValue(workout.planned_workout, WORKOUTS, "planned_workout");
  assertSetValue(
    workout.recommended_workout,
    WORKOUTS,
    "recommended_workout",
  );
  if (workout.planned_workout === "rest") {
    invalid("A workout check-in requires an existing planned workout.");
  }
  if (
    workout.reflection !== null &&
    !REFLECTIONS.has(String(workout.reflection))
  ) {
    invalid("Unsupported reflection category.");
  }
  if (
    workout.skip_reason !== null &&
    !SKIP_REASONS.has(String(workout.skip_reason))
  ) {
    invalid("Unsupported skip reason.");
  }
  if (
    workout.adjustment_response !== null &&
    workout.adjustment_response !== "accepted" &&
    workout.adjustment_response !== "rejected"
  ) {
    invalid("Unsupported adjustment response.");
  }
  if (workout.status === "completed") {
    assertIntegerRange(workout.perceived_effort, 1, 10, "perceived_effort");
    if (workout.skip_reason !== null) {
      invalid("Completed workouts cannot carry a skip reason.");
    }
  } else {
    if (workout.perceived_effort !== null || workout.reflection !== null) {
      invalid("Skipped workouts cannot carry effort or reflection values.");
    }
    if (workout.skip_reason === null) {
      invalid("Skipped workouts require one bounded reason.");
    }
  }
  if (workout.selected_action === "proceed") {
    if (
      workout.adjustment_response !== null ||
      workout.recommended_workout !== workout.planned_workout
    ) {
      invalid("Proceed check-ins cannot claim an adjustment.");
    }
  } else if (workout.adjustment_response === null) {
    invalid("Modified or rest decisions require an explicit response.");
  }
  if (
    workout.selected_action === "rest" &&
    workout.recommended_workout !== "rest"
  ) {
    invalid("Rest decisions must retain the bounded rest recommendation.");
  }
  if (
    workout.selected_action === "rest" &&
    workout.status === "completed" &&
    workout.adjustment_response !== "rejected"
  ) {
    invalid("Completing after a rest recommendation is an explicit rejection.");
  }
  if (
    workout.selected_action === "rest" &&
    workout.status === "skipped" &&
    workout.adjustment_response !== "accepted"
  ) {
    invalid("Skipping after a rest recommendation is an explicit acceptance.");
  }
}

export function validateMobileCheckinTiming(
  request: MobileCheckinRequest,
  now: Date,
): void {
  if (Number.isNaN(now.getTime())) invalid("Current time is invalid.");
  const captured = Date.parse(request.captured_at);
  const ageMs = now.getTime() - captured;
  if (ageMs < -5 * 60 * 1000 || ageMs > 36 * 60 * 60 * 1000) {
    invalid("Mobile check-in timestamp is outside the allowed daily window.");
  }
}

export function applyMobileCheckin(
  value: unknown,
  state: MobileCheckinState,
  now: Date,
): MobileCheckinApplyResult {
  assertMobileCheckinRequest(value);
  validateMobileCheckinTiming(value, now);
  assertMobileCheckinState(state);

  if (value.kind === "perceived_recovery") {
    return applyRecovery(value, state);
  }
  return applyWorkout(value, state);
}

export function buildMobileCheckinAudit(
  request: MobileCheckinRequest,
  input: {
    outcome: "success" | "failed" | "invalid" | "timeout";
    failure_state: MobileCheckinFailureState;
    write_scope: "readiness" | "workouts_recommendations" | "none";
    deterministic_validation: "passed" | "failed" | "not_run";
    update_succeeded: boolean;
    latency_ms: number;
  },
): MobileCheckinAuditProperties {
  const successful = input.outcome === "success";
  if (
    (successful &&
      (input.failure_state !== "none" ||
        input.write_scope === "none" ||
        input.deterministic_validation !== "passed" ||
        !input.update_succeeded)) ||
    (!successful &&
      (input.failure_state === "none" ||
        input.write_scope !== "none" ||
        input.update_succeeded))
  ) {
    invalid("Mobile check-in audit state is inconsistent.");
  }
  return {
    platform: "ios",
    checkin_kind: request.kind,
    status:
      request.kind === "perceived_recovery"
        ? "checked_in"
        : request.workout.status,
    outcome: input.outcome,
    failure_state: input.failure_state,
    write_scope: input.write_scope,
    deterministic_validation: input.deterministic_validation,
    has_effort:
      request.kind === "workout_outcome" &&
      request.workout.perceived_effort !== null,
    has_user_reflection:
      request.kind === "workout_outcome" &&
      request.workout.reflection !== null,
    update_succeeded: input.update_succeeded,
    latency_ms: Math.min(
      MOBILE_CHECKIN_MAX_LATENCY_MS,
      Math.max(
        0,
        Number.isFinite(input.latency_ms)
          ? Math.round(input.latency_ms)
          : MOBILE_CHECKIN_MAX_LATENCY_MS,
      ),
    ),
  };
}

export function assertWorkoutLog(
  value: unknown,
  label = "workout log",
): asserts value is WorkoutLog {
  const log = object(value, label);
  if (
    typeof log.goalSig !== "string" ||
    log.goalSig.length < 1 ||
    log.goalSig.length > 500 ||
    !Array.isArray(log.entries) ||
    log.entries.length > 1_000
  ) {
    invalid(`${label} is invalid.`);
  }
  for (const entry of log.entries) {
    const item = object(entry, `${label} entry`);
    assertIntegerRange(item.weekNumber, 1, 52, "workout weekNumber");
    assertSetValue(item.day, DAYS, "workout day");
    if (item.status !== "completed" && item.status !== "skipped") {
      invalid("Unsupported persisted workout status.");
    }
    assertLocalDay(item.scheduledDate, "workout scheduledDate");
    assertIsoTimestamp(item.loggedAt, "workout loggedAt");
    if (
      item.acceptedAdjustment !== undefined &&
      typeof item.acceptedAdjustment !== "boolean"
    ) {
      invalid("acceptedAdjustment must be boolean when present.");
    }
  }
}

export function assertRecommendationLog(
  value: unknown,
  label = "recommendation log",
): asserts value is RecommendationLog {
  const log = object(value, label);
  if (log.version !== 1) invalid(`${label} version must be 1.`);
  const events = object(log.events, `${label} events`);
  if (Object.keys(events).length > 1_000) {
    invalid(`${label} has too many events.`);
  }
  for (const [id, raw] of Object.entries(events)) {
    const event = object(raw, `${label} event`);
    if (
      event.id !== id ||
      typeof id !== "string" ||
      id.length < 1 ||
      id.length > 500
    ) {
      invalid("Recommendation event id is invalid.");
    }
    assertLocalDay(event.date, "recommendation date");
    assertBoundedString(event.plannedWorkout, 1, 500, "plannedWorkout");
    assertBoundedString(
      event.recommendedWorkout,
      1,
      500,
      "recommendedWorkout",
    );
    assertSetValue(event.selectedAction, ACTIONS, "selectedAction");
    assertSetValue(event.confidence, CONFIDENCE, "confidence");
    if (
      event.userResponse !== null &&
      !new Set(["accepted", "rejected", "modified", "skipped"]).has(
        String(event.userResponse),
      )
    ) {
      invalid("Unsupported recommendation response.");
    }
    const context = object(event.context, "recommendation context");
    if (
      context.calendarLoad !== undefined &&
      !new Set(["light", "moderate", "heavy"]).has(
        String(context.calendarLoad),
      )
    ) {
      invalid("Invalid calendar context.");
    }
    if (
      context.sleepStatus !== undefined &&
      !new Set(["below_baseline", "normal", "above_baseline"]).has(
        String(context.sleepStatus),
      )
    ) {
      invalid("Invalid sleep context.");
    }
    if (
      context.recoveryStatus !== undefined &&
      !new Set(["low", "moderate", "high"]).has(
        String(context.recoveryStatus),
      )
    ) {
      invalid("Invalid recovery context.");
    }
    if (event.actualWorkout !== undefined) {
      assertActualWorkout(event.actualWorkout);
    }
  }
}

export function mobileRecommendationEventId(
  request: MobileWorkoutCheckinRequest,
): string {
  return [
    "mobile",
    request.local_day,
    request.workout.week_number,
    request.workout.day.toLowerCase(),
  ].join(":");
}

function applyRecovery(
  request: MobileRecoveryCheckinRequest,
  state: MobileCheckinState,
): MobileCheckinApplyResult {
  const readiness: ReadinessLog = {
    entries: { ...(state.readiness?.entries ?? {}) },
  };
  const existing = readiness.entries[request.local_day];
  const source: ManualReadiness["source"] =
    existing?.source === "healthkit" ||
    existing?.source === "apple_health_csv" ||
    existing?.source === "demo" ||
    existing?.source === "mixed"
      ? "mixed"
      : "manual";
  const entry: ManualReadiness = {
    ...existing,
    date: request.local_day,
    perceived_recovery: request.recovery.perceived_recovery,
    fatigue_level: request.recovery.fatigue_level,
    soreness_level: request.recovery.soreness_level,
    source,
    updated_at: request.captured_at,
    ...(request.recovery.sleep_hours_correction !== null
      ? { sleep_hours: request.recovery.sleep_hours_correction }
      : {}),
  };
  readiness.entries[request.local_day] = entry;
  return {
    readiness,
    workouts: state.workouts,
    recommendations: state.recommendations,
    write_domains: ["readiness"],
    audit: buildMobileCheckinAudit(request, {
      outcome: "success",
      failure_state: "none",
      write_scope: "readiness",
      deterministic_validation: "passed",
      update_succeeded: true,
      latency_ms: 0,
    }),
  };
}

function applyWorkout(
  request: MobileWorkoutCheckinRequest,
  state: MobileCheckinState,
): MobileCheckinApplyResult {
  const target = request.workout;
  const slot = state.plan_slots.find(
    (item) =>
      item.week_number === target.week_number &&
      item.day === target.day &&
      item.scheduled_date === target.scheduled_date,
  );
  if (!slot || slot.workout !== target.planned_workout) {
    invalid("Workout check-in does not match the current plan slot.");
  }
  if (state.workouts && state.workouts.goalSig !== state.goal_signature) {
    invalid("Workout log belongs to a different goal.");
  }

  const workoutEntry: WorkoutLogEntry = {
    weekNumber: target.week_number,
    day: target.day,
    status: target.status,
    scheduledDate: target.scheduled_date,
    loggedAt: request.captured_at,
    ...(target.adjustment_response !== null
      ? { acceptedAdjustment: target.adjustment_response === "accepted" }
      : {}),
  };
  const priorEntries = state.workouts?.entries ?? [];
  const workouts: WorkoutLog = {
    goalSig: state.goal_signature,
    entries: [
      ...priorEntries.filter(
        (item) =>
          item.weekNumber !== workoutEntry.weekNumber ||
          item.day !== workoutEntry.day,
      ),
      workoutEntry,
    ],
  };

  const eventId = mobileRecommendationEventId(request);
  const event: RecommendationEvent = {
    id: eventId,
    date: request.local_day,
    plannedWorkout: workoutLabel(target.planned_workout),
    recommendedWorkout: workoutLabel(target.recommended_workout),
    selectedAction: target.selected_action,
    confidence: target.confidence_bucket,
    userResponse:
      target.status === "skipped"
        ? "skipped"
        : target.adjustment_response === "rejected"
          ? "rejected"
          : "accepted",
    actualWorkout:
      target.status === "completed"
        ? {
            completed: true,
            perceivedEffort: target.perceived_effort as number,
            ...(target.reflection
              ? { reflectionCategory: target.reflection }
              : {}),
          }
        : {
            completed: false,
            skipReason: target.skip_reason as NonNullable<
              RecommendationEvent["actualWorkout"]
            >["skipReason"],
          },
    context: {},
  };
  const recommendations: RecommendationLog = {
    version: 1,
    events: {
      ...(state.recommendations?.events ?? {}),
      [eventId]: event,
    },
  };

  return {
    readiness: state.readiness,
    workouts,
    recommendations,
    write_domains: ["workouts", "recommendations"],
    audit: buildMobileCheckinAudit(request, {
      outcome: "success",
      failure_state: "none",
      write_scope: "workouts_recommendations",
      deterministic_validation: "passed",
      update_succeeded: true,
      latency_ms: 0,
    }),
  };
}

function assertMobileCheckinState(state: MobileCheckinState): void {
  assertBoundedString(
    state.goal_signature,
    1,
    500,
    "current goal signature",
  );
  if (!Array.isArray(state.plan_slots) || state.plan_slots.length > 366) {
    invalid("Current plan slots are invalid.");
  }
  for (const slot of state.plan_slots) {
    assertIntegerRange(slot.week_number, 1, 52, "plan week_number");
    assertSetValue(slot.day, DAYS, "plan day");
    assertLocalDay(slot.scheduled_date, "plan scheduled_date");
    assertSetValue(slot.workout, PLAN_WORKOUTS, "plan workout");
  }
  if (state.readiness) {
    if (
      !isObject(state.readiness.entries) ||
      Object.keys(state.readiness.entries).length > 1_000
    ) {
      invalid("Readiness log is invalid.");
    }
    for (const [date, entry] of Object.entries(state.readiness.entries)) {
      assertReadinessEntry(entry, `readiness entry ${date}`);
      if (entry.date !== date) invalid("Readiness entry date is mismatched.");
    }
  }
  if (state.workouts) assertWorkoutLog(state.workouts);
  if (state.recommendations) assertRecommendationLog(state.recommendations);
}

function assertActualWorkout(value: unknown): void {
  const actual = object(value, "actual workout");
  if (typeof actual.completed !== "boolean") {
    invalid("Actual workout completion must be boolean.");
  }
  if (actual.perceivedEffort !== undefined) {
    assertIntegerRange(actual.perceivedEffort, 1, 10, "perceivedEffort");
  }
  if (
    actual.reflectionCategory !== undefined &&
    !REFLECTIONS.has(String(actual.reflectionCategory))
  ) {
    invalid("Invalid reflectionCategory.");
  }
  if (
    actual.skipReason !== undefined &&
    !SKIP_REASONS.has(String(actual.skipReason))
  ) {
    invalid("Invalid skipReason.");
  }
  if (actual.note !== undefined) {
    assertBoundedString(actual.note, 1, 500, "legacy workout note");
  }
}

function workoutLabel(value: MobileCheckinWorkoutKind): string {
  return value === "long_run" ? "long run" : value;
}

function rejectForbiddenRequestKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenRequestKeys);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REQUEST_KEYS.has(key.toLowerCase())) {
      invalid(`Forbidden mobile check-in key: ${key}`);
    }
    rejectForbiddenRequestKeys(child);
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    invalid("Unexpected mobile check-in structure.");
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) invalid(`${label} must be an object.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSetValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): asserts value is T {
  if (typeof value !== "string" || !allowed.has(value)) {
    invalid(`${label} has an unsupported value.`);
  }
}

function assertIntegerRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalid(`${label} must be an integer from ${min} to ${max}.`);
  }
}

function assertNumberRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    invalid(`${label} must be between ${min} and ${max}.`);
  }
}

function assertLocalDay(value: unknown, label: string): asserts value is string {
  const parsed =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : null;
  if (
    typeof value !== "string" ||
    !parsed ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    invalid(`${label} must be an ISO local day.`);
  }
}

function assertIsoTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    Number.isNaN(Date.parse(value))
  ) {
    invalid(`${label} must be a bounded ISO timestamp.`);
  }
}

function assertBoundedString(
  value: unknown,
  min: number,
  max: number,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max
  ) {
    invalid(`${label} must contain ${min} to ${max} characters.`);
  }
}

function invalid(message: string): never {
  throw new MobileCheckinValidationError(message);
}
