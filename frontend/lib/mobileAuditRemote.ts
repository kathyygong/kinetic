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
    "status",
    "outcome",
    "has_effort",
    "has_user_reflection",
    "update_succeeded",
    "latency_ms",
  ]),
};
const SENSITIVE_KEY = /uid|email|full_?name|note|description|calendar_?event|event_?text|biometric|sleep|hrv|heart|soreness|fatigue|workout_?text|raw|token|secret/i;

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
