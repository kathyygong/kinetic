import type { ManualReadiness, ReadinessLog } from "./readinessStorage";

export type MobileEnvelope<T> = {
  schemaVersion: 1;
  payload: T | null;
  deleted: boolean;
  clientUpdatedAt: string;
};

export type DailySyncStatus =
  | "synced"
  | "partial"
  | "skipped_existing_user_entry"
  | "failed"
  | "deleted";

export type SyncConflict =
  | "none"
  | "manual_wins"
  | "csv_wins"
  | "healthkit_update"
  | "stale_healthkit";

export type HealthSyncPayload = {
  provider: "apple_health";
  schema: "health-sync.v1";
  permission_state: "not_determined" | "denied" | "partial" | "granted";
  metric_permissions: Record<
    "sleep" | "hrv" | "resting_hr",
    "not_determined" | "denied" | "granted"
  >;
  last_attempted_sync_at: string;
  last_successful_sync_at: string | null;
  latest_readiness_date: string | null;
  background_delivery: "unknown" | "enabled" | "disabled" | "stale";
  daily_status: Record<
    string,
    {
      status: DailySyncStatus;
      confidence: "low" | "moderate" | "high";
      coverage: Record<
        "sleep" | "hrv" | "resting_hr",
        "complete" | "partial" | "missing" | "not_permitted"
      >;
      conflict: SyncConflict;
    }
  >;
  last_error_code: string | null;
};

export type ReadinessMergeResult = {
  entryToWrite: ManualReadiness | null;
  conflict: SyncConflict;
  status: DailySyncStatus;
};

const readinessSources = new Set([
  "manual",
  "apple_health_csv",
  "healthkit",
  "demo",
  "mixed",
]);
const permissions = new Set(["not_determined", "denied", "partial", "granted"]);
const metricPermissions = new Set(["not_determined", "denied", "granted"]);
const backgroundStates = new Set(["unknown", "enabled", "disabled", "stale"]);
const dailyStatuses = new Set([
  "synced",
  "partial",
  "skipped_existing_user_entry",
  "failed",
  "deleted",
]);
const confidenceBuckets = new Set(["low", "moderate", "high"]);
const coverageStates = new Set(["complete", "partial", "missing", "not_permitted"]);
const conflicts = new Set([
  "none",
  "manual_wins",
  "csv_wins",
  "healthkit_update",
  "stale_healthkit",
]);
const metricKeys = ["sleep", "hrv", "resting_hr"] as const;
const forbiddenKeys = new Set([
  "raw",
  "raw_sample",
  "raw_samples",
  "sample",
  "samples",
  "sample_timestamp",
  "sample_timestamps",
  "calendar_text",
  "event_text",
  "note",
  "notes",
  "workout_note",
  "workout_notes",
  "device_id",
  "device_identifier",
  "email",
  "uid",
  "token",
]);

export function assertReadinessEnvelope(value: unknown): asserts value is MobileEnvelope<ReadinessLog> {
  const envelope = assertEnvelope(value, "readiness");
  assertNoForbiddenKeys(value);
  if (envelope.deleted) return;
  assertObject(envelope.payload, "readiness payload");
  assertObject(envelope.payload.entries, "readiness entries");
  for (const [date, entry] of Object.entries(envelope.payload.entries)) {
    assertReadinessEntry(entry, `readiness entry ${date}`);
    if (entry.date !== date) throw new Error(`readiness entry ${date} has a mismatched date`);
  }
}

export function assertHealthSyncEnvelope(
  value: unknown,
): asserts value is MobileEnvelope<HealthSyncPayload> {
  const envelope = assertEnvelope(value, "health sync");
  assertNoForbiddenKeys(value);
  if (envelope.deleted) return;
  const payload = envelope.payload;
  assertObject(payload, "health sync payload");
  if (payload.provider !== "apple_health" || payload.schema !== "health-sync.v1") {
    throw new Error("health sync provider/schema is unsupported");
  }
  assertSetValue(payload.permission_state, permissions, "permission_state");
  assertMetricMap(payload.metric_permissions, metricPermissions, "metric_permissions");
  assertIsoDate(payload.last_attempted_sync_at, "last_attempted_sync_at");
  assertOptionalIsoDate(payload.last_successful_sync_at, "last_successful_sync_at");
  if (payload.latest_readiness_date !== null) {
    assertDayKey(payload.latest_readiness_date, "latest_readiness_date");
  }
  assertSetValue(payload.background_delivery, backgroundStates, "background_delivery");
  assertObject(payload.daily_status, "daily_status");
  for (const [date, status] of Object.entries(payload.daily_status)) {
    assertDayKey(date, "daily_status date");
    assertObject(status, `daily_status ${date}`);
    assertSetValue(status.status, dailyStatuses, "daily status");
    assertSetValue(status.confidence, confidenceBuckets, "daily confidence");
    assertMetricMap(status.coverage, coverageStates, "daily coverage");
    assertSetValue(status.conflict, conflicts, "daily conflict");
  }
  if (payload.last_error_code !== null && typeof payload.last_error_code !== "string") {
    throw new Error("last_error_code must be a string or null");
  }
}

export function assertTombstone(value: unknown, label: string): asserts value is MobileEnvelope<never> {
  const envelope = assertEnvelope(value, label);
  if (!envelope.deleted || envelope.payload !== null) {
    throw new Error(`${label} must set deleted=true and payload=null`);
  }
}

export function assertReadinessEntry(
  value: unknown,
  label = "readiness entry",
): asserts value is ManualReadiness {
  assertObject(value, label);
  assertDayKey(value.date, `${label}.date`);
  assertIsoDate(value.updated_at, `${label}.updated_at`);
  assertOptionalRange(value.sleep_hours, 0, 24, `${label}.sleep_hours`);
  assertOptionalRange(value.hrv, 1, 300, `${label}.hrv`);
  assertOptionalRange(value.resting_hr, 20, 220, `${label}.resting_hr`);
  assertOptionalLevel(value.fatigue_level, `${label}.fatigue_level`);
  assertOptionalLevel(value.soreness_level, `${label}.soreness_level`);
  assertOptionalLevel(
    value.perceived_recovery,
    `${label}.perceived_recovery`,
  );
  if (value.source !== undefined) assertSetValue(value.source, readinessSources, `${label}.source`);
  if (
    value.source === "healthkit" &&
    (value.fatigue_level !== undefined ||
      value.soreness_level !== undefined ||
      value.perceived_recovery !== undefined)
  ) {
    throw new Error(`${label} cannot attribute subjective levels to HealthKit`);
  }
  assertNoForbiddenKeys(value);
}

export function resolveReadinessConflict(
  existing: ManualReadiness | null,
  incomingHealthKit: ManualReadiness,
): ReadinessMergeResult {
  assertReadinessEntry(incomingHealthKit, "incoming HealthKit entry");
  if (!existing) {
    return {
      entryToWrite: { ...incomingHealthKit, source: "healthkit" },
      conflict: "none",
      status: "synced",
    };
  }

  assertReadinessEntry(existing, "existing readiness entry");
  if (!existing.source || existing.source === "manual" || existing.source === "demo" || existing.source === "mixed") {
    return { entryToWrite: null, conflict: "manual_wins", status: "skipped_existing_user_entry" };
  }
  if (existing.source === "apple_health_csv") {
    return { entryToWrite: null, conflict: "csv_wins", status: "skipped_existing_user_entry" };
  }
  if (Date.parse(incomingHealthKit.updated_at) <= Date.parse(existing.updated_at)) {
    return { entryToWrite: null, conflict: "stale_healthkit", status: "skipped_existing_user_entry" };
  }

  const merged: ManualReadiness = { ...existing };
  for (const key of ["sleep_hours", "hrv", "resting_hr"] as const) {
    const metric = incomingHealthKit[key];
    if (metric !== undefined) merged[key] = metric;
  }
  merged.source = "healthkit";
  merged.updated_at = incomingHealthKit.updated_at;
  return { entryToWrite: merged, conflict: "healthkit_update", status: "synced" };
}

function assertEnvelope(value: unknown, label: string): Record<string, unknown> {
  assertObject(value, `${label} envelope`);
  if (value.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1`);
  if (typeof value.deleted !== "boolean") throw new Error(`${label} deleted must be boolean`);
  assertIsoDate(value.clientUpdatedAt, `${label}.clientUpdatedAt`);
  if (value.deleted && value.payload !== null) throw new Error(`${label} tombstone payload must be null`);
  if (!value.deleted && value.payload === null) throw new Error(`${label} live payload cannot be null`);
  return value;
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertMetricMap(value: unknown, allowed: Set<string>, label: string) {
  assertObject(value, label);
  for (const key of metricKeys) assertSetValue(value[key], allowed, `${label}.${key}`);
}

function assertSetValue(value: unknown, allowed: Set<string>, label: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${label} has an unsupported value`);
  }
}

function assertDayKey(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function assertIsoDate(value: unknown, label: string) {
  const isoTimestamp =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!isoTimestamp || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertOptionalIsoDate(value: unknown, label: string) {
  if (value !== null) assertIsoDate(value, label);
}

function assertOptionalRange(value: unknown, min: number, max: number, label: string) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}

function assertOptionalLevel(value: unknown, label: string) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} must be an integer from 1 to 5`);
  }
}

function assertNoForbiddenKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) throw new Error(`forbidden mobile health key: ${key}`);
    assertNoForbiddenKeys(child);
  }
}
