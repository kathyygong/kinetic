"use client";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebase";
import {
  type ProductEvent,
  type ProductEventName,
} from "./instrumentation";
import {
  MOBILE_EVENT_NAMES,
  selectMobileAuditEvents,
} from "./mobileAudit";

const MOBILE_EVENT_SET = new Set<string>(MOBILE_EVENT_NAMES);
const MAX_REMOTE_EVENTS = 200;
const SAFE_KEYS: Record<string, ReadonlySet<string>> = {
  mobile_companion_sync_completed: new Set([
    "platform",
    "sync_type",
    "outcome",
    "permission_state",
    "background_delivery",
    "coverage_bucket",
    "confidence_bucket",
    "conflict",
    "latency_ms",
  ]),
  mobile_decision_validated: new Set([
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
  ]),
  mobile_intake_lifecycle: new Set([
    "platform",
    "action",
    "outcome",
    "route",
    "draft_kind",
    "failure_state",
    "parser_source",
    "mutation_state",
    "status",
    "source",
    "fallback_used",
    "latency_ms",
    "timed_out",
    "change_count",
    "warning_count",
    "deterministic_validation",
  ]),
  mobile_checkin_synced: new Set([
    "platform",
    "checkin_kind",
    "status",
    "outcome",
    "failure_state",
    "write_scope",
    "deterministic_validation",
    "has_effort",
    "has_user_reflection",
    "update_succeeded",
    "latency_ms",
  ]),
  mobile_pattern_result_lifecycle: new Set([
    "platform",
    "action",
    "outcome",
    "pattern_family",
    "result_kind",
    "mutation_state",
    "deterministic_validation",
    "source",
  ]),
};
const SENSITIVE_KEY = /uid|email|full_?name|note|description|calendar_?event|event_?text|biometric|sleep|hrv|heart|soreness|fatigue|workout_?text|raw|token|secret/i;
const SAFE_ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  platform: new Set(["web", "ios"]),
  sync_type: new Set([
    "healthkit_readiness",
    "calendar_context",
    "decision_readback",
  ]),
  outcome: new Set(["success", "failed", "partial", "stale", "invalid", "timeout"]),
  permission_state: new Set(["not_determined", "denied", "partial", "granted"]),
  background_delivery: new Set(["unknown", "enabled", "disabled", "stale"]),
  coverage_bucket: new Set(["none", "partial", "complete"]),
  confidence_bucket: new Set(["low", "moderate", "high", "unknown", "other"]),
  conflict: new Set([
    "none",
    "manual_wins",
    "csv_wins",
    "healthkit_update",
    "stale_healthkit",
  ]),
  decision_source: new Set(["live", "cache", "fallback"]),
  failure_state: new Set([
    "none",
    "auth_required",
    "offline",
    "timeout",
    "backend_unavailable",
    "invalid_response",
    "missing_context",
    "ai_unavailable",
    "malformed_ai",
    "ambiguous",
    "unsupported",
    "unsafe",
    "invalid_payload",
    "state_conflict",
    "permission_denied",
    "unknown",
  ]),
  cache_state: new Set(["fresh", "stale", "expired", "missing"]),
  availability_source: new Set([
    "calendar",
    "planned_workout_fallback",
    "missing",
  ]),
  selected_action: new Set(["proceed", "modify", "rest", "unknown", "other"]),
  calendar_state: new Set(["clear", "conflict", "stale", "missing"]),
  readiness_state: new Set(["ready", "caution", "unknown", "stale"]),
  deterministic_validation: new Set(["passed", "failed", "not_run"]),
  action: new Set([
    "routed",
    "reviewed",
    "confirmed",
    "discarded",
    "dismissed",
    "prompted",
    "caution",
    "failed",
  ]),
  route: new Set([
    "review_draft",
    "perceived_recovery",
    "caution",
    "missed_workout",
    "reflection",
    "explanation",
    "clarification",
    "refusal",
    "none",
  ]),
  draft_kind: new Set([
    "schedule",
    "availability",
    "travel",
    "workout_swap",
    "goal",
    "preferred_day",
    "multiple",
    "none",
  ]),
  parser_source: new Set([
    "deterministic",
    "ollama",
    "deterministic_router",
    "none",
  ]),
  mutation_state: new Set([
    "not_requested",
    "review_only",
    "applied",
    "rejected",
  ]),
  pattern_family: new Set([
    "heavy_calendar_misses",
    "specific_day_skips",
    "long_run_day_preference",
    "rest_override",
    "adjustment_tolerance",
    "stale_data_or_checkin_gap",
    "pain_or_discomfort_recurrence",
  ]),
  result_kind: new Set([
    "scoring_preference_review",
    "preferred_day_review",
    "checkin_prompt",
    "caution",
  ]),
  status: new Set([
    "completed",
    "skipped",
    "checked_in",
    "ready",
    "needs_clarification",
    "unsupported",
  ]),
  source: new Set(["ollama", "deterministic", "cache", "client", "unknown", "other"]),
  checkin_kind: new Set(["perceived_recovery", "workout_outcome"]),
  write_scope: new Set(["readiness", "workouts_recommendations", "none"]),
};
const SAFE_NUMBER_LIMITS: Record<string, readonly [number, number]> = {
  latency_ms: [0, 120_000],
  change_count: [0, 100],
  warning_count: [0, 100],
};

export async function readNativeMobileAuditEvents(): Promise<ProductEvent[]> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return [];

  const snapshot = await getDoc(
    doc(db, "users", user.uid, "kinetic", "mobile_audit"),
  );
  if (!snapshot.exists()) return [];
  const data = snapshot.data();
  if (
    data.schemaVersion !== 1 ||
    data.deleted !== false ||
    !isObject(data.payload) ||
    data.payload.version !== 2 ||
    !Array.isArray(data.payload.events)
  ) {
    return [];
  }

  return data.payload.events
    .slice(-MAX_REMOTE_EVENTS)
    .map(coerceNativeEvent)
    .filter((event): event is ProductEvent => event !== null);
}

export async function readCombinedMobileAuditEvents(
  browserEvents: ProductEvent[],
): Promise<ProductEvent[]> {
  let nativeEvents: ProductEvent[] = [];
  try {
    nativeEvents = await readNativeMobileAuditEvents();
  } catch {
    // The local QA log remains usable when auth or Firestore is offline.
  }
  const byId = new Map<string, ProductEvent>();
  for (const event of [...browserEvents, ...nativeEvents]) {
    byId.set(event.id, event);
  }
  return selectMobileAuditEvents(
    [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)),
  );
}

function coerceNativeEvent(value: unknown): ProductEvent | null {
  if (!isObject(value)) return null;
  if (
    value.schemaVersion !== 2 ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !MOBILE_EVENT_SET.has(value.name) ||
    typeof value.at !== "string" ||
    !Number.isFinite(Date.parse(value.at)) ||
    !isObject(value.properties)
  ) {
    return null;
  }
  const allowed = SAFE_KEYS[value.name];
  if (!allowed) return null;
  const properties: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value.properties)) {
    if (!allowed.has(key) || SENSITIVE_KEY.test(key)) return null;
    if (
      raw !== null &&
      typeof raw !== "string" &&
      typeof raw !== "number" &&
      typeof raw !== "boolean"
    ) {
      return null;
    }
    if (typeof raw === "number" && !Number.isFinite(raw)) return null;
    if (
      typeof raw === "string" &&
      SAFE_ENUM_VALUES[key] &&
      !SAFE_ENUM_VALUES[key].has(raw)
    ) {
      return null;
    }
    if (typeof raw === "number" && SAFE_NUMBER_LIMITS[key]) {
      const [min, max] = SAFE_NUMBER_LIMITS[key];
      if (raw < min || raw > max) return null;
    }
    properties[key] = raw;
  }
  return {
    schemaVersion: 2,
    id: value.id.slice(0, 200),
    name: value.name as ProductEventName,
    at: value.at,
    properties,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
