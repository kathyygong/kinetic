"use client";

type Scalar = string | number | boolean | null;

type RecommendationResponseProperties = {
  response: "accepted" | "rejected" | "modified";
  rejection_reason?: string;
  selected_action: string;
  confidence_bucket: string;
  staleness_warning_count: number;
};

type RecommendationCompletionProperties = {
  status: "completed" | "skipped";
  response_status: string | null;
  selected_action: string;
  accepted_adjustment: boolean | null;
};

type ProductEventProperties = {
  recommendation_response: RecommendationResponseProperties;
  recommendation_completion: RecommendationCompletionProperties;
  post_workout_checkin_saved: {
    completed: boolean;
    has_effort: boolean;
    has_user_reflection: boolean;
    perceived_effort?: number | null;
    update_succeeded?: boolean;
  };
  ai_status_checked: {
    outcome: "success" | "failed";
    mode: string;
    source?: string;
    fallback_used: boolean;
    live_model_enabled: boolean;
    timeout_seconds?: number;
    latency_ms: number;
    timed_out?: boolean;
  };
  ai_reasoning_completed: {
    surface: string;
    outcome: string;
    source?: string;
    fallback_used?: boolean;
    ui_fallback_used: boolean;
    latency_ms: number;
    timed_out?: boolean;
    selected_action?: string;
    factor_count?: number;
    modified_workout_count?: number;
    dropped_workout_count?: number;
    recommendation_event_count?: number;
    staleness_warning_count?: number;
    preserved_workout_count?: number;
    pattern_count?: number;
    warning_count?: number;
  };
  calendar_sync_completed: {
    outcome: "success" | "failed";
    availability_ok?: boolean;
    travel_ok?: boolean;
    horizon_days?: number;
    travel_horizon_days?: number;
    week_count?: number;
    has_changes?: boolean;
    total_changes?: number;
    easy_only_day_count?: number;
  };
  stale_data_warning_shown: {
    warning_count: number;
    has_calendar_warning: boolean;
    has_recovery_warning: boolean;
    selected_action: string;
    confidence_bucket: string;
  };
  weekly_plan_recalibrated: {
    surface: string;
    outcome: string;
    total_changes: number;
    week_adjustment_count?: number;
    easy_only_day_count: number;
  };
  learned_preference_updated: {
    action: "confirmed" | "dismissed" | "removed";
    preference_type: string;
    confidence: string;
  };
  demo_data_control_used: {
    action: "seed" | "reset" | "clear_learning";
    plan_weeks?: number;
    readiness_entries?: number;
    recommendation_events?: number;
  };
  intake_lifecycle: {
    action: "reviewed" | "confirmed" | "discarded";
    outcome: "success" | "failed" | "invalid";
    status?: string;
    source?: string;
    fallback_used?: boolean;
    latency_ms?: number;
    timed_out?: boolean;
    change_count?: number;
    warning_count?: number;
  };
  training_review_loaded: {
    outcome: "success" | "failed";
    window_days: 7 | 30;
    source?: string;
    fallback_used?: boolean;
    latency_ms: number;
    timed_out: boolean;
    warning_count?: number;
    logged_sessions?: number;
  };
  persistence_sync_completed: {
    operation: "hydrate" | "mirror" | "delete";
    outcome: "success" | "failed" | "timeout";
    domain?: string;
    cache_changed?: boolean;
    latency_ms: number;
  };
  mobile_companion_sync_completed: {
    platform: "ios";
    sync_type: "healthkit_readiness" | "calendar_context" | "decision_readback";
    outcome: "success" | "failed" | "partial" | "stale";
    permission_state?: "not_determined" | "denied" | "partial" | "granted";
    background_delivery?: "unknown" | "enabled" | "disabled" | "stale";
    coverage_bucket?: "none" | "partial" | "complete";
    confidence_bucket: string;
    conflict?: "none" | "manual_wins" | "csv_wins" | "healthkit_update" | "stale_healthkit";
    latency_ms: number;
  };
  mobile_decision_validated: {
    platform: "ios";
    outcome: "success" | "failed" | "invalid" | "timeout";
    decision_source: "live" | "cache" | "fallback";
    failure_state:
      | "none"
      | "auth_required"
      | "offline"
      | "timeout"
      | "backend_unavailable"
      | "invalid_response"
      | "missing_context"
      | "unknown";
    cache_state: "fresh" | "stale" | "expired" | "missing";
    availability_source: "calendar" | "planned_workout_fallback" | "missing";
    selected_action: string;
    confidence_bucket: string;
    calendar_state: "clear" | "conflict" | "stale" | "missing";
    readiness_state: "ready" | "caution" | "unknown" | "stale";
    deterministic_validation: "passed" | "failed" | "not_run";
    has_calendar_warning: boolean;
    has_recovery_warning: boolean;
    ai_assisted: boolean;
    latency_ms: number;
  };
  mobile_intake_lifecycle: {
    platform: "ios";
    action: "reviewed" | "confirmed" | "discarded";
    outcome: "success" | "failed" | "invalid" | "timeout";
    status?: string;
    source?: string;
    fallback_used?: boolean;
    latency_ms?: number;
    timed_out?: boolean;
    change_count?: number;
    warning_count?: number;
    deterministic_validation: "passed" | "failed" | "not_run";
  };
  mobile_checkin_synced: {
    platform: "ios";
    status: "completed" | "skipped" | "checked_in";
    outcome: "success" | "failed" | "timeout";
    has_effort: boolean;
    has_user_reflection: boolean;
    update_succeeded?: boolean;
    latency_ms: number;
  };
};

export type ProductEventName = keyof ProductEventProperties;

export type ProductEvent<N extends ProductEventName = ProductEventName> = {
  schemaVersion: 2;
  id: string;
  name: N;
  at: string;
  properties: Record<string, Scalar>;
};

type ProductEventLog = {
  version: 2;
  events: ProductEvent[];
};

const STORAGE_KEY = "kinetic_product_events";
const LOG_VERSION = 2;
const MAX_EVENTS = 200;

const EVENT_KEYS: {
  [N in ProductEventName]: ReadonlyArray<keyof ProductEventProperties[N]>;
} = {
  recommendation_response: [
    "response",
    "rejection_reason",
    "selected_action",
    "confidence_bucket",
    "staleness_warning_count",
  ],
  recommendation_completion: [
    "status",
    "response_status",
    "selected_action",
    "accepted_adjustment",
  ],
  post_workout_checkin_saved: [
    "completed",
    "has_effort",
    "has_user_reflection",
    "perceived_effort",
    "update_succeeded",
  ],
  ai_status_checked: [
    "outcome",
    "mode",
    "source",
    "fallback_used",
    "live_model_enabled",
    "timeout_seconds",
    "latency_ms",
    "timed_out",
  ],
  ai_reasoning_completed: [
    "surface",
    "outcome",
    "source",
    "fallback_used",
    "ui_fallback_used",
    "latency_ms",
    "timed_out",
    "selected_action",
    "factor_count",
    "modified_workout_count",
    "dropped_workout_count",
    "recommendation_event_count",
    "staleness_warning_count",
    "preserved_workout_count",
    "pattern_count",
    "warning_count",
  ],
  calendar_sync_completed: [
    "outcome",
    "availability_ok",
    "travel_ok",
    "horizon_days",
    "travel_horizon_days",
    "week_count",
    "has_changes",
    "total_changes",
    "easy_only_day_count",
  ],
  stale_data_warning_shown: [
    "warning_count",
    "has_calendar_warning",
    "has_recovery_warning",
    "selected_action",
    "confidence_bucket",
  ],
  weekly_plan_recalibrated: [
    "surface",
    "outcome",
    "total_changes",
    "week_adjustment_count",
    "easy_only_day_count",
  ],
  learned_preference_updated: ["action", "preference_type", "confidence"],
  demo_data_control_used: [
    "action",
    "plan_weeks",
    "readiness_entries",
    "recommendation_events",
  ],
  intake_lifecycle: [
    "action",
    "outcome",
    "status",
    "source",
    "fallback_used",
    "latency_ms",
    "timed_out",
    "change_count",
    "warning_count",
  ],
  training_review_loaded: [
    "outcome",
    "window_days",
    "source",
    "fallback_used",
    "latency_ms",
    "timed_out",
    "warning_count",
    "logged_sessions",
  ],
  persistence_sync_completed: [
    "operation",
    "outcome",
    "domain",
    "cache_changed",
    "latency_ms",
  ],
  mobile_companion_sync_completed: [
    "platform",
    "sync_type",
    "outcome",
    "permission_state",
    "background_delivery",
    "coverage_bucket",
    "confidence_bucket",
    "conflict",
    "latency_ms",
  ],
  mobile_decision_validated: [
    "platform",
    "outcome",
    "decision_source",
    "failure_state",
    "cache_state",
    "availability_source",
    "selected_action",
    "confidence_bucket",
    "calendar_state",
    "readiness_state",
    "deterministic_validation",
    "has_calendar_warning",
    "has_recovery_warning",
    "ai_assisted",
    "latency_ms",
  ],
  mobile_intake_lifecycle: [
    "platform",
    "action",
    "outcome",
    "status",
    "source",
    "fallback_used",
    "latency_ms",
    "timed_out",
    "change_count",
    "warning_count",
    "deterministic_validation",
  ],
  mobile_checkin_synced: [
    "platform",
    "status",
    "outcome",
    "has_effort",
    "has_user_reflection",
    "update_succeeded",
    "latency_ms",
  ],
};

const ENUM_VALUES: Record<string, readonly string[]> = {
  platform: ["web", "ios", "unknown", "other"],
  sync_type: ["healthkit_readiness", "calendar_context", "decision_readback", "other"],
  response: ["accepted", "rejected", "modified"],
  rejection_reason: [
    "too_hard",
    "too_easy",
    "not_enough_time",
    "felt_better",
    "other",
  ],
  selected_action: ["proceed", "modify", "rest", "unknown", "other"],
  confidence_bucket: ["low", "moderate", "high", "unknown", "other"],
  status: [
    "completed",
    "skipped",
    "checked_in",
    "ready",
    "needs_clarification",
    "unsupported",
    "unknown",
    "other",
  ],
  response_status: ["accepted", "rejected", "pending", "none", "other"],
  outcome: [
    "success",
    "failed",
    "invalid",
    "client_fallback",
    "generated",
    "accepted",
    "rejected",
    "partial",
    "stale",
    "timeout",
    "other",
  ],
  mode: ["fallback", "local_ollama", "disabled", "unknown", "other"],
  source: ["ollama", "deterministic", "cache", "client", "unknown", "other"],
  surface: [
    "dashboard_daily",
    "plan_weekly",
    "behavior_insights",
    "dashboard_initial_generation",
    "dashboard_suggestion",
    "other",
  ],
  action: [
    "seed",
    "reset",
    "clear_learning",
    "confirmed",
    "dismissed",
    "removed",
    "reviewed",
    "discarded",
    "other",
  ],
  permission_state: ["not_determined", "denied", "partial", "granted", "unknown", "other"],
  background_delivery: ["unknown", "enabled", "disabled", "stale", "other"],
  coverage_bucket: ["none", "partial", "complete", "unknown", "other"],
  conflict: [
    "none",
    "manual_wins",
    "csv_wins",
    "healthkit_update",
    "stale_healthkit",
    "other",
  ],
  calendar_state: ["clear", "conflict", "stale", "missing", "unknown", "other"],
  readiness_state: ["ready", "caution", "unknown", "stale", "other"],
  deterministic_validation: ["passed", "failed", "not_run", "other"],
  decision_source: ["live", "cache", "fallback", "other"],
  failure_state: [
    "none",
    "auth_required",
    "offline",
    "timeout",
    "backend_unavailable",
    "invalid_response",
    "missing_context",
    "unknown",
    "other",
  ],
  cache_state: ["fresh", "stale", "expired", "missing", "other"],
  availability_source: [
    "calendar",
    "planned_workout_fallback",
    "missing",
    "other",
  ],
  preference_type: [
    "busy_day_preference",
    "rest_day_preference",
    "intensity_tolerance",
    "schedule_preference",
    "other",
  ],
  confidence: ["low", "moderate", "high", "unknown", "other"],
  operation: ["hydrate", "mirror", "delete"],
  domain: [
    "profile",
    "goal",
    "plan",
    "readiness",
    "workouts",
    "recommendations",
    "preferences",
    "dismissed_preferences",
    "today",
    "schedule",
    "calendar_sync",
    "calendar_failure",
    "health_sync",
    "all",
    "other",
  ],
};

const NUMBER_LIMITS: Record<string, [number, number, number]> = {
  latency_ms: [0, 120_000, 1],
  timeout_seconds: [0, 120, 1],
  perceived_effort: [0, 10, 1],
  window_days: [7, 30, 1],
  warning_count: [0, 100, 1],
  staleness_warning_count: [0, 100, 1],
  horizon_days: [0, 365, 1],
  travel_horizon_days: [0, 365, 1],
  week_count: [0, 52, 1],
  plan_weeks: [0, 52, 1],
  readiness_entries: [0, 1_000, 1],
  recommendation_events: [0, 1_000, 1],
  recommendation_event_count: [0, 1_000, 1],
  preserved_workout_count: [0, 100, 1],
  pattern_count: [0, 100, 1],
  logged_sessions: [0, 1_000, 1],
  change_count: [0, 100, 1],
  total_changes: [0, 100, 1],
  week_adjustment_count: [0, 100, 1],
  easy_only_day_count: [0, 7, 1],
  factor_count: [0, 10, 1],
  modified_workout_count: [0, 100, 1],
  dropped_workout_count: [0, 100, 1],
};

const SENSITIVE_KEY_PATTERNS = [
  /(^|_)uid($|_)/i,
  /(^|_)email($|_)/i,
  /(^|_)full_?name($|_)/i,
  /(^|_)name($|_)/i,
  /(^|_)note($|_)/i,
  /description/i,
  /calendar_?event/i,
  /event_?text/i,
  /biometric/i,
  /sleep/i,
  /hrv/i,
  /heart/i,
  /soreness/i,
  /fatigue/i,
  /workout_?text/i,
  /raw/i,
  /token/i,
  /secret/i,
];

export function trackProductEvent<N extends ProductEventName>(
  name: N,
  properties: ProductEventProperties[N],
): ProductEvent<N> | null {
  if (typeof window === "undefined") return null;

  const event: ProductEvent<N> = {
    schemaVersion: LOG_VERSION,
    id: makeEventId(name),
    name,
    at: new Date().toISOString(),
    properties: sanitizeProperties(name, properties),
  };

  try {
    const log = readLog();
    log.events.push(event);
    if (log.events.length > MAX_EVENTS) {
      log.events = log.events.slice(log.events.length - MAX_EVENTS);
    }
    writeLog(log);
  } catch {
    // Observability is deliberately isolated from every product workflow.
  }
  return event;
}

export function listProductEvents(): ProductEvent[] {
  if (typeof window === "undefined") return [];
  return readLog().events;
}

export function clearProductEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort local telemetry only.
  }
}

function sanitizeProperties<N extends ProductEventName>(
  name: N,
  properties: ProductEventProperties[N],
): Record<string, Scalar> {
  const input = properties as Record<string, unknown>;
  const sanitized: Record<string, Scalar> = {};
  for (const propertyKey of EVENT_KEYS[name]) {
    const key = String(propertyKey);
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) continue;
    const value = sanitizeValue(key, input[key]);
    if (value !== undefined) sanitized[key] = value;
  }
  return sanitized;
}

function sanitizeValue(key: string, value: unknown): Scalar | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  const limits = NUMBER_LIMITS[key];
  if (limits && typeof value === "number" && Number.isFinite(value)) {
    const [min, max, precision] = limits;
    const bounded = Math.min(max, Math.max(min, value));
    return Number(bounded.toFixed(precision));
  }
  const allowed = ENUM_VALUES[key];
  if (allowed && typeof value === "string") {
    return allowed.includes(value) ? value : "other";
  }
  return undefined;
}

function readLog(): ProductEventLog {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: LOG_VERSION, events: [] };
    const parsed = JSON.parse(raw) as ProductEventLog;
    if (parsed.version !== LOG_VERSION || !Array.isArray(parsed.events)) {
      return { version: LOG_VERSION, events: [] };
    }
    return parsed;
  } catch {
    return { version: LOG_VERSION, events: [] };
  }
}

function writeLog(log: ProductEventLog): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Telemetry failures never block training, persistence, auth, or AI.
  }
}

function makeEventId(name: ProductEventName): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${name}_${Date.now()}_${random}`;
}
