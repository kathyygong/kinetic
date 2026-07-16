import type { LearnedPreference } from "./behaviorTypes";
import type { HealthSyncPayload } from "./mobileReadinessContract";
import type { ReadinessLog, ManualReadiness } from "./readinessStorage";
import type { Biometrics } from "./scenarios";
import type { SavedPlan } from "./storage";
import { getTodaysWorkout, type TodaysWorkout } from "./todaysWorkout";
import type { Goal, UserProfile } from "./types";
import {
  getAdjustmentBiasTowardOriginal,
  type WorkoutLogEntry,
} from "./workoutLog";

export const MOBILE_TODAY_SCHEMA = "mobile-today.v1" as const;
export const MOBILE_TODAY_CACHE_SCHEMA = "mobile-today-cache.v1" as const;
export const MOBILE_TODAY_CACHE_FRESH_HOURS = 6;
export const MOBILE_TODAY_CACHE_MAX_HOURS = 24;

export type DecisionActionName = "proceed" | "modify" | "rest";
export type ConfidenceBucket = "low" | "moderate" | "high";

export type DecisionCandidate = {
  name: DecisionActionName;
  description: string;
  intensity_modifier: number;
  duration_modifier: number;
};

export type DecisionRequest = {
  biometrics: Biometrics;
  training_context: {
    planned_workout: string;
    recent_workouts: string[];
  };
  constraints: {
    available_minutes: number;
    /**
     * True when the caller already resolved the bounded availability value.
     * The backend must not replace it with server-calendar data or a default.
     */
    calendar_authoritative: boolean;
  };
  data_freshness: {
    recovery_age_hours: number | null;
    calendar_age_hours: number | null;
  };
  bias_toward_original: number;
  learned_preferences: Array<{
    id: string;
    type: LearnedPreference["type"];
    confidence: LearnedPreference["confidence"];
    userConfirmed: true;
    createdAt: string;
  }>;
};

export type DecisionOutput = {
  state: string;
  recovery_score: number;
  selected_action: DecisionCandidate;
  final_workout: string;
  confidence: number;
  available_minutes: number;
  key_factors: string[];
  alternatives: DecisionCandidate[];
  scores: Record<string, number>;
  decision_trace: string[];
  staleness_warnings: string[];
};

export type DailyReasoning = {
  summary: string;
  factors: Array<{
    title: string;
    explanation: string;
    impact: "positive" | "negative" | "neutral";
  }>;
  tradeoff: string;
  confidence_note: string;
};

export type DecisionResponse = {
  decision: DecisionOutput;
  ai_reasoning: DailyReasoning | null;
  reasoning_available: boolean;
};

export type MobileTodayCalendarInput = {
  ageHours: number | null;
  availableMinutesToday?: number | null;
  unhealthy?: boolean;
};

export type MobileTodayBuildContext = {
  profile?: UserProfile | null;
  goal?: Goal | null;
  savedPlan?: SavedPlan | null;
  readinessLog?: ReadinessLog | null;
  healthSync?: HealthSyncPayload | null;
  calendar?: MobileTodayCalendarInput | null;
  learnedPreferences?: LearnedPreference[];
  workoutLog?: WorkoutLogEntry[];
  now?: Date | string;
  /** Explicit device-local day for deterministic cross-platform fixtures. */
  localDay?: string;
};

export type MobileTodayReadinessState =
  | "complete"
  | "partial"
  | "missing"
  | "stale";
export type MobileTodayCalendarState =
  | "clear"
  | "conflict"
  | "stale"
  | "missing";
export type MobileTodayAvailabilitySource =
  | "calendar"
  | "planned_workout_fallback";
export type MobileTodayBaselineSource = "rolling_history" | "current_neutral";

export type MobileTodayRequestMetadata = {
  profile_state: "present" | "missing";
  goal_state: "present" | "missing";
  plan_state: "scheduled" | "rest" | "missing";
  readiness_state: MobileTodayReadinessState;
  readiness_source: ManualReadiness["source"] | "missing";
  readiness_age_hours: number | null;
  baseline_source: MobileTodayBaselineSource | "missing";
  calendar_state: MobileTodayCalendarState;
  calendar_age_hours: number | null;
  availability_source: MobileTodayAvailabilitySource;
  confirmed_preference_count: number;
  recent_workout_count: number;
  health_permission_state: HealthSyncPayload["permission_state"] | "missing";
};

export type MobileTodayRequestContract = {
  schema: typeof MOBILE_TODAY_SCHEMA;
  local_day: string;
  request: DecisionRequest;
  metadata: MobileTodayRequestMetadata;
};

export type MobileTodayBuildFailureCode =
  | "missing_goal"
  | "missing_plan"
  | "missing_readiness";

export type MobileTodayBuildResult =
  | { ok: true; contract: MobileTodayRequestContract }
  | {
      ok: false;
      failure: {
        code: MobileTodayBuildFailureCode;
        retryable: false;
        safe_action: "complete_setup" | "log_readiness";
      };
    };

export type MobileTodayDecisionSnapshot = {
  schema: typeof MOBILE_TODAY_SCHEMA;
  local_day: string;
  generated_at: string;
  decision: {
    state: string;
    recovery_score: number;
    selected_action: DecisionCandidate;
    final_workout: string;
    confidence: number;
    available_minutes: number;
    key_factors: string[];
    staleness_warnings: string[];
  };
  explanation: {
    source: "cached_ai" | "deterministic";
    summary: string;
    factors: DailyReasoning["factors"];
    tradeoff: string;
    confidence_note: string;
  };
  context: MobileTodayRequestMetadata;
};

export type MobileTodayCacheEnvelope = {
  schema: typeof MOBILE_TODAY_CACHE_SCHEMA;
  local_day: string;
  cached_at: string;
  snapshot: MobileTodayDecisionSnapshot;
};

export type MobileTodayCacheState = "fresh" | "stale" | "expired" | "missing";

export type MobileTodayFailureCode =
  | "auth_required"
  | "offline"
  | "timeout"
  | "backend_unavailable"
  | "invalid_response"
  | "missing_context"
  | "unknown";

export type MobileTodayLoadResult =
  | {
      source: "live";
      cache_state: MobileTodayCacheState;
      snapshot: MobileTodayDecisionSnapshot;
      failure: null;
    }
  | {
      source: "cache";
      cache_state: "fresh" | "stale";
      snapshot: MobileTodayDecisionSnapshot;
      failure: MobileTodayFailureCode;
    }
  | {
      source: "fallback";
      cache_state: MobileTodayCacheState;
      snapshot: null;
      failure: MobileTodayFailureCode;
    };

const MAX_RECENT_WORKOUTS = 5;
const MAX_CONFIRMED_PREFERENCES = 20;
const MAX_TEXT_LENGTH = 500;
const MAX_LIST_LENGTH = 20;
const FORBIDDEN_KEYS = new Set([
  "uid",
  "email",
  "full_name",
  "profile",
  "readiness_log",
  "health_sync",
  "workout_log",
  "note",
  "notes",
  "calendar_text",
  "event_text",
  "raw",
  "raw_sample",
  "raw_samples",
  "sample",
  "samples",
  "token",
]);

export function buildMobileTodayRequest(
  context: MobileTodayBuildContext,
): MobileTodayBuildResult {
  if (!context.goal) {
    return buildFailure("missing_goal", "complete_setup");
  }
  if (!context.savedPlan?.weeks?.length) {
    return buildFailure("missing_plan", "complete_setup");
  }

  const now = normalizeNow(context.now);
  const readiness = latestCompleteReadiness(context.readinessLog);
  if (!readiness) {
    return buildFailure("missing_readiness", "log_readiness");
  }

  const todaysWorkout = getTodaysWorkout(
    context.goal,
    context.savedPlan.weeks,
    undefined,
    now,
    { planStart: context.savedPlan.planStart },
  );
  const readinessAge = hoursSince(readiness.updated_at, now);
  const hrvBaseline = rollingHrvBaseline(context.readinessLog, readiness);
  const plannedMinutes = boundedMinutes(todaysWorkout.totalDuration);
  const calendar = resolveCalendar(context.calendar, plannedMinutes);
  const recentWorkouts = resolveRecentWorkouts(
    context.savedPlan,
    context.workoutLog ?? [],
  );
  const preferences = sanitizePreferences(context.learnedPreferences ?? []);
  const readinessState = resolveReadinessState(readiness, readinessAge);

  const contract: MobileTodayRequestContract = {
    schema: MOBILE_TODAY_SCHEMA,
    local_day: resolveLocalDay(context.localDay, now),
    request: {
      biometrics: {
        hrv: readiness.hrv!,
        hrv_baseline: hrvBaseline.value,
        sleep_hours: readiness.sleep_hours!,
        resting_hr: readiness.resting_hr!,
        ...(readiness.fatigue_level !== undefined
          ? { fatigue_level: readiness.fatigue_level }
          : {}),
        ...(readiness.soreness_level !== undefined
          ? { soreness_level: readiness.soreness_level }
          : {}),
      },
      training_context: {
        planned_workout: plannedWorkoutLabel(todaysWorkout),
        recent_workouts: recentWorkouts,
      },
      constraints: {
        available_minutes: calendar.availableMinutes,
        calendar_authoritative: true,
      },
      data_freshness: {
        recovery_age_hours: readinessAge,
        calendar_age_hours: calendar.ageHours,
      },
      bias_toward_original: round(
        getAdjustmentBiasTowardOriginal(context.workoutLog ?? []),
        3,
      ),
      learned_preferences: preferences,
    },
    metadata: {
      profile_state: context.profile ? "present" : "missing",
      goal_state: "present",
      plan_state: todaysWorkout.type === "rest" ? "rest" : "scheduled",
      readiness_state: readinessState,
      readiness_source: readiness.source ?? "missing",
      readiness_age_hours: readinessAge,
      baseline_source: hrvBaseline.source,
      calendar_state: calendar.state,
      calendar_age_hours: calendar.ageHours,
      availability_source: calendar.source,
      confirmed_preference_count: preferences.length,
      recent_workout_count: recentWorkouts.length,
      health_permission_state:
        context.healthSync?.permission_state ?? "missing",
    },
  };

  assertNoForbiddenMobileTodayKeys(contract);
  return { ok: true, contract };
}

export function parseDecisionResponse(value: unknown): DecisionResponse {
  assertObject(value, "decision response");
  const wrapped = "decision" in value;
  const decisionValue = wrapped ? value.decision : value;
  const decision = parseDecisionOutput(decisionValue);
  const aiReasoning = wrapped
    ? parseOptionalDailyReasoning(value.ai_reasoning)
    : null;

  return {
    decision,
    ai_reasoning: aiReasoning,
    reasoning_available: aiReasoning !== null,
  };
}

export function createMobileTodaySnapshot(
  contract: MobileTodayRequestContract,
  response: DecisionResponse,
  generatedAt: Date | string = new Date(),
): MobileTodayDecisionSnapshot {
  const at = normalizeNow(generatedAt).toISOString();
  const reasoning = response.ai_reasoning;
  const snapshot: MobileTodayDecisionSnapshot = {
    schema: MOBILE_TODAY_SCHEMA,
    local_day: contract.local_day,
    generated_at: at,
    decision: {
      state: response.decision.state,
      recovery_score: response.decision.recovery_score,
      selected_action: response.decision.selected_action,
      final_workout: response.decision.final_workout,
      confidence: response.decision.confidence,
      available_minutes: response.decision.available_minutes,
      key_factors: response.decision.key_factors,
      staleness_warnings: response.decision.staleness_warnings,
    },
    explanation: reasoning
      ? {
          source: "cached_ai",
          summary: reasoning.summary,
          factors: reasoning.factors,
          tradeoff: reasoning.tradeoff,
          confidence_note: reasoning.confidence_note,
        }
      : deterministicExplanation(response.decision),
    context: contract.metadata,
  };
  assertMobileTodaySnapshot(snapshot);
  return snapshot;
}

export function createMobileTodayCache(
  snapshot: MobileTodayDecisionSnapshot,
  cachedAt: Date | string = snapshot.generated_at,
): MobileTodayCacheEnvelope {
  const cache: MobileTodayCacheEnvelope = {
    schema: MOBILE_TODAY_CACHE_SCHEMA,
    local_day: snapshot.local_day,
    cached_at: normalizeNow(cachedAt).toISOString(),
    snapshot,
  };
  assertMobileTodayCache(cache);
  return cache;
}

export function resolveMobileTodayCacheState(
  cache: MobileTodayCacheEnvelope | null | undefined,
  now: Date | string = new Date(),
): MobileTodayCacheState {
  if (!cache) return "missing";
  try {
    assertMobileTodayCache(cache);
  } catch {
    return "expired";
  }
  const at = normalizeNow(now);
  if (cache.local_day !== localDayKey(at)) return "expired";
  const age = hoursSince(cache.cached_at, at);
  if (age === null || age > MOBILE_TODAY_CACHE_MAX_HOURS) return "expired";
  return age <= MOBILE_TODAY_CACHE_FRESH_HOURS ? "fresh" : "stale";
}

export function resolveMobileTodayLoad(input: {
  live?: MobileTodayDecisionSnapshot | null;
  cache?: MobileTodayCacheEnvelope | null;
  failure?: MobileTodayFailureCode | null;
  now?: Date | string;
}): MobileTodayLoadResult {
  const cacheState = resolveMobileTodayCacheState(input.cache, input.now);
  if (input.live) {
    assertMobileTodaySnapshot(input.live);
    return {
      source: "live",
      cache_state: cacheState,
      snapshot: input.live,
      failure: null,
    };
  }
  if (
    input.cache &&
    (cacheState === "fresh" || cacheState === "stale")
  ) {
    return {
      source: "cache",
      cache_state: cacheState,
      snapshot: input.cache.snapshot,
      failure: input.failure ?? "unknown",
    };
  }
  return {
    source: "fallback",
    cache_state: cacheState,
    snapshot: null,
    failure: input.failure ?? "unknown",
  };
}

export function classifyMobileTodayHttpFailure(
  status: number,
): MobileTodayFailureCode {
  if (status === 401 || status === 403) return "auth_required";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "backend_unavailable";
  return "invalid_response";
}

export function assertMobileTodaySnapshot(
  value: unknown,
): asserts value is MobileTodayDecisionSnapshot {
  assertObject(value, "mobile Today snapshot");
  if (value.schema !== MOBILE_TODAY_SCHEMA) {
    throw new Error("mobile Today snapshot schema is unsupported");
  }
  assertDayKey(value.local_day, "mobile Today local_day");
  assertIsoDate(value.generated_at, "mobile Today generated_at");
  assertObject(value.decision, "mobile Today decision");
  parseDecisionCandidate(
    value.decision.selected_action,
    "mobile Today selected_action",
  );
  assertString(value.decision.state, "mobile Today state");
  assertRange(value.decision.recovery_score, 0, 1, "mobile Today recovery_score");
  assertString(value.decision.final_workout, "mobile Today final_workout");
  assertRange(value.decision.confidence, 0, 1, "mobile Today confidence");
  assertRange(
    value.decision.available_minutes,
    0,
    240,
    "mobile Today available_minutes",
  );
  assertStringList(value.decision.key_factors, "mobile Today key_factors");
  assertStringList(
    value.decision.staleness_warnings,
    "mobile Today staleness_warnings",
  );
  assertObject(value.explanation, "mobile Today explanation");
  assertEnum(
    value.explanation.source,
    new Set(["cached_ai", "deterministic"]),
    "mobile Today explanation source",
  );
  assertString(value.explanation.summary, "mobile Today explanation summary");
  assertReasoningFactors(value.explanation.factors);
  assertString(value.explanation.tradeoff, "mobile Today explanation tradeoff");
  assertString(
    value.explanation.confidence_note,
    "mobile Today explanation confidence_note",
  );
  assertMobileTodayMetadata(value.context);
  assertNoForbiddenMobileTodayKeys(value);
}

export function assertMobileTodayCache(
  value: unknown,
): asserts value is MobileTodayCacheEnvelope {
  assertObject(value, "mobile Today cache");
  if (value.schema !== MOBILE_TODAY_CACHE_SCHEMA) {
    throw new Error("mobile Today cache schema is unsupported");
  }
  assertDayKey(value.local_day, "mobile Today cache local_day");
  assertIsoDate(value.cached_at, "mobile Today cache cached_at");
  assertMobileTodaySnapshot(value.snapshot);
  if (value.snapshot.local_day !== value.local_day) {
    throw new Error("mobile Today cache day does not match snapshot");
  }
}

export function assertNoForbiddenMobileTodayKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenMobileTodayKeys(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`forbidden mobile Today key: ${key}`);
    }
    if (key === "learned_preferences" && Array.isArray(child)) {
      for (const preference of child) {
        if (
          typeof preference === "object" &&
          preference !== null &&
          "description" in preference
        ) {
          throw new Error(
            "forbidden mobile Today learned preference description",
          );
        }
      }
    }
    assertNoForbiddenMobileTodayKeys(child);
  }
}

function buildFailure(
  code: MobileTodayBuildFailureCode,
  safeAction: "complete_setup" | "log_readiness",
): MobileTodayBuildResult {
  return {
    ok: false,
    failure: { code, retryable: false, safe_action: safeAction },
  };
}

function latestCompleteReadiness(
  log: ReadinessLog | null | undefined,
): ManualReadiness | null {
  if (!log) return null;
  return (
    Object.values(log.entries)
      .filter(
        (entry) =>
          isFiniteNumber(entry.hrv) &&
          isFiniteNumber(entry.sleep_hours) &&
          isFiniteNumber(entry.resting_hr),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  );
}

function rollingHrvBaseline(
  log: ReadinessLog | null | undefined,
  current: ManualReadiness,
): { value: number; source: MobileTodayBaselineSource } {
  const values = Object.values(log?.entries ?? {})
    .filter((entry) => isFiniteNumber(entry.hrv))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 30)
    .map((entry) => entry.hrv!);
  if (values.length >= 2) {
    return {
      value: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
      source: "rolling_history",
    };
  }
  return { value: current.hrv!, source: "current_neutral" };
}

function resolveReadinessState(
  readiness: ManualReadiness,
  ageHours: number | null,
): MobileTodayReadinessState {
  if (ageHours === null) return "partial";
  if (ageHours > 36) return "stale";
  return readiness.fatigue_level === undefined ||
    readiness.soreness_level === undefined
    ? "partial"
    : "complete";
}

function resolveCalendar(
  calendar: MobileTodayCalendarInput | null | undefined,
  plannedMinutes: number,
): {
  availableMinutes: number;
  ageHours: number | null;
  state: MobileTodayCalendarState;
  source: MobileTodayAvailabilitySource;
} {
  const age =
    calendar?.ageHours !== null &&
    calendar?.ageHours !== undefined &&
    isFiniteNumber(calendar.ageHours)
      ? Math.max(0, calendar.ageHours)
      : null;
  const available = calendar?.availableMinutesToday;
  const hasBoundedAvailability =
    isFiniteNumber(available) && available >= 0 && available <= 240;
  const fresh = !calendar?.unhealthy && age !== null && age <= 24;

  if (fresh && hasBoundedAvailability) {
    return {
      availableMinutes: boundedMinutes(available),
      ageHours: age,
      state: available <= 30 ? "conflict" : "clear",
      source: "calendar",
    };
  }

  return {
    availableMinutes: plannedMinutes,
    ageHours: age,
    state: calendar ? "stale" : "missing",
    source: "planned_workout_fallback",
  };
}

function resolveRecentWorkouts(
  plan: SavedPlan,
  log: WorkoutLogEntry[],
): string[] {
  return [...log]
    .filter((entry) => entry.status === "completed")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, MAX_RECENT_WORKOUTS)
    .map((entry) => {
      const week = plan.weeks.find(
        (candidate) => candidate.weekNumber === entry.weekNumber,
      );
      const workout = week?.workouts.find(
        (candidate) => candidate.day === entry.day,
      );
      return workout ? workoutLabel(workout.type) : "completed run";
    });
}

function sanitizePreferences(
  preferences: LearnedPreference[],
): DecisionRequest["learned_preferences"] {
  return preferences
    .filter((preference) => preference.userConfirmed === true)
    .slice(0, MAX_CONFIRMED_PREFERENCES)
    .map((preference) => ({
      id: preference.id.slice(0, 100),
      type: preference.type,
      confidence: preference.confidence,
      userConfirmed: true,
      createdAt: preference.createdAt,
    }));
}

function plannedWorkoutLabel(todays: TodaysWorkout): string {
  if (todays.type === "rest") return "rest day";
  const minutes = Math.max(1, Math.round(todays.totalDuration));
  return `${minutes} min ${workoutLabel(todays.type)}`;
}

function workoutLabel(type: TodaysWorkout["type"]): string {
  switch (type) {
    case "easy":
      return "easy run";
    case "tempo":
      return "tempo run";
    case "intervals":
      return "interval run";
    case "long run":
      return "long run";
    case "race":
      return "race effort";
    default:
      return "rest day";
  }
}

function parseDecisionOutput(value: unknown): DecisionOutput {
  assertObject(value, "decision");
  assertString(value.state, "decision.state");
  assertRange(value.recovery_score, 0, 1, "decision.recovery_score");
  const selectedAction = parseDecisionCandidate(
    value.selected_action,
    "decision.selected_action",
  );
  assertString(value.final_workout, "decision.final_workout");
  assertRange(value.confidence, 0, 1, "decision.confidence");
  assertRange(value.available_minutes, 0, 240, "decision.available_minutes");
  assertStringList(value.key_factors, "decision.key_factors");
  assertArray(value.alternatives, "decision.alternatives");
  const alternatives = value.alternatives.map((candidate, index) =>
    parseDecisionCandidate(candidate, `decision.alternatives[${index}]`),
  );
  assertObject(value.scores, "decision.scores");
  const scores: Record<string, number> = {};
  for (const [key, score] of Object.entries(value.scores)) {
    assertRange(score, 0, 2, `decision.scores.${key}`);
    scores[key] = score;
  }
  assertStringList(value.decision_trace, "decision.decision_trace", 100);
  const warnings = value.staleness_warnings ?? [];
  assertStringList(warnings, "decision.staleness_warnings");

  return {
    state: value.state,
    recovery_score: value.recovery_score,
    selected_action: selectedAction,
    final_workout: value.final_workout,
    confidence: value.confidence,
    available_minutes: value.available_minutes,
    key_factors: [...value.key_factors],
    alternatives,
    scores,
    decision_trace: [...value.decision_trace],
    staleness_warnings: [...warnings],
  };
}

function parseDecisionCandidate(
  value: unknown,
  label: string,
): DecisionCandidate {
  assertObject(value, label);
  assertEnum(
    value.name,
    new Set(["proceed", "modify", "rest"]),
    `${label}.name`,
  );
  assertString(value.description, `${label}.description`);
  assertRange(value.intensity_modifier, 0, 1, `${label}.intensity_modifier`);
  assertRange(value.duration_modifier, 0, 1, `${label}.duration_modifier`);
  return {
    name: value.name as DecisionActionName,
    description: value.description,
    intensity_modifier: value.intensity_modifier,
    duration_modifier: value.duration_modifier,
  };
}

function parseOptionalDailyReasoning(value: unknown): DailyReasoning | null {
  if (value === null || value === undefined) return null;
  try {
    assertObject(value, "ai_reasoning");
    assertString(value.summary, "ai_reasoning.summary");
    assertReasoningFactors(value.factors);
    assertString(value.tradeoff, "ai_reasoning.tradeoff");
    assertString(value.confidence_note, "ai_reasoning.confidence_note");
    return {
      summary: value.summary,
      factors: value.factors.map((factor) => ({ ...factor })),
      tradeoff: value.tradeoff,
      confidence_note: value.confidence_note,
    };
  } catch {
    // AI explanation is downstream of the deterministic result. A malformed
    // explanation is discarded without invalidating an otherwise safe decision.
    return null;
  }
}

function deterministicExplanation(
  decision: DecisionOutput,
): MobileTodayDecisionSnapshot["explanation"] {
  const action = decision.selected_action.name;
  const summary =
    action === "rest"
      ? `Recovery and schedule constraints support a rest day: ${decision.final_workout}`
      : action === "modify"
        ? `Kinetic safely adjusted today's plan: ${decision.final_workout}`
        : `Today's planned workout remains appropriate: ${decision.final_workout}`;
  return {
    source: "deterministic",
    summary,
    factors: decision.key_factors.slice(0, 3).map((factor) => ({
      title: "Decision factor",
      explanation: factor,
      impact: "neutral" as const,
    })),
    tradeoff:
      action === "proceed"
        ? "Proceed preserves the planned training stimulus."
        : "The safer option protects consistency while respecting current constraints.",
    confidence_note: decision.staleness_warnings.length
      ? decision.staleness_warnings.join(" ")
      : "Readiness and calendar inputs are current enough for this recommendation.",
  };
}

function assertMobileTodayMetadata(value: unknown): void {
  assertObject(value, "mobile Today context");
  assertEnum(value.profile_state, new Set(["present", "missing"]), "profile_state");
  assertEnum(value.goal_state, new Set(["present", "missing"]), "goal_state");
  assertEnum(
    value.plan_state,
    new Set(["scheduled", "rest", "missing"]),
    "plan_state",
  );
  assertEnum(
    value.readiness_state,
    new Set(["complete", "partial", "missing", "stale"]),
    "readiness_state",
  );
  assertEnum(
    value.calendar_state,
    new Set(["clear", "conflict", "stale", "missing"]),
    "calendar_state",
  );
  assertEnum(
    value.availability_source,
    new Set(["calendar", "planned_workout_fallback"]),
    "availability_source",
  );
  assertEnum(
    value.readiness_source,
    new Set([
      "manual",
      "apple_health_csv",
      "healthkit",
      "demo",
      "mixed",
      "missing",
    ]),
    "readiness_source",
  );
  assertEnum(
    value.baseline_source,
    new Set(["rolling_history", "current_neutral", "missing"]),
    "baseline_source",
  );
  assertEnum(
    value.health_permission_state,
    new Set(["not_determined", "denied", "partial", "granted", "missing"]),
    "health_permission_state",
  );
  assertNullableRange(
    value.readiness_age_hours,
    0,
    100_000,
    "readiness_age_hours",
  );
  assertNullableRange(
    value.calendar_age_hours,
    0,
    100_000,
    "calendar_age_hours",
  );
  assertRange(
    value.confirmed_preference_count,
    0,
    MAX_CONFIRMED_PREFERENCES,
    "confirmed_preference_count",
  );
  assertRange(
    value.recent_workout_count,
    0,
    MAX_RECENT_WORKOUTS,
    "recent_workout_count",
  );
}

function assertReasoningFactors(
  value: unknown,
): asserts value is DailyReasoning["factors"] {
  assertArray(value, "reasoning factors");
  if (value.length > MAX_LIST_LENGTH) {
    throw new Error("reasoning factors contains too many entries");
  }
  for (const [index, factor] of value.entries()) {
    assertObject(factor, `reasoning factors[${index}]`);
    assertString(factor.title, `reasoning factors[${index}].title`);
    assertString(
      factor.explanation,
      `reasoning factors[${index}].explanation`,
    );
    assertEnum(
      factor.impact,
      new Set(["positive", "negative", "neutral"]),
      `reasoning factors[${index}].impact`,
    );
  }
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TEXT_LENGTH
  ) {
    throw new Error(`${label} must be a bounded non-empty string`);
  }
}

function assertStringList(
  value: unknown,
  label: string,
  maxLength = MAX_LIST_LENGTH,
): asserts value is string[] {
  assertArray(value, label);
  if (value.length > maxLength) {
    throw new Error(`${label} contains too many entries`);
  }
  value.forEach((entry, index) => assertString(entry, `${label}[${index}]`));
}

function assertNullableRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): void {
  if (value === null) return;
  assertRange(value, min, max, label);
}

function assertRange(
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
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}

function assertEnum(value: unknown, allowed: Set<string>, label: string): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${label} has an unsupported value`);
  }
}

function assertDayKey(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function assertIsoDate(value: unknown, label: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function normalizeNow(value: Date | string | undefined): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error("invalid mobile Today date");
  return date;
}

function localDayKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function resolveLocalDay(explicit: string | undefined, now: Date): string {
  if (explicit !== undefined) {
    assertDayKey(explicit, "mobile Today local day");
    return explicit;
  }
  return localDayKey(now);
}

function hoursSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return round(Math.max(0, (now.getTime() - timestamp) / 3_600_000), 2);
}

function boundedMinutes(value: number): number {
  return Math.max(0, Math.min(240, Math.round(value)));
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
