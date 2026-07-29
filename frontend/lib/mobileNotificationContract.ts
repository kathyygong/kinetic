export const MOBILE_NOTIFICATION_SCHEMA = "mobile-notification.v1" as const;
export const MOBILE_NOTIFICATION_FIXTURE_SCHEMA =
  "mobile-notification-fixture.v1" as const;

export const EVENING_CHECKIN_TITLE = "Kinetic check-in";
export const EVENING_CHECKIN_BODY = "Take a moment to update today.";

export type MobileNotificationPermission =
  | "not_determined"
  | "denied"
  | "authorized"
  | "provisional";

export type MobileNotificationCheckinState =
  | "not_applicable"
  | "pending"
  | "completed"
  | "skipped";

export type MobileNotificationRequest = {
  schema_version: typeof MOBILE_NOTIFICATION_SCHEMA;
  platform: "ios";
  kind: "evening_checkin";
  local_day: string;
  now: string;
  target_at: string;
  enabled: boolean;
  permission: MobileNotificationPermission;
  has_planned_workout: boolean;
  checkin_state: MobileNotificationCheckinState;
  existing_request: boolean;
};

export type MobileNotificationAction =
  | "request_permission"
  | "schedule"
  | "cancel"
  | "none";

export type MobileNotificationReason =
  | "user_opt_in_required"
  | "permission_required"
  | "permission_denied"
  | "no_planned_workout"
  | "checkin_complete"
  | "checkin_skipped"
  | "target_elapsed"
  | "eligible";

export type MobileNotificationDecision = {
  schema_version: typeof MOBILE_NOTIFICATION_SCHEMA;
  action: MobileNotificationAction;
  reason: MobileNotificationReason;
  notification_identifier: string | null;
  target_at: string | null;
  title: string | null;
  body: string | null;
  lock_screen_copy: "generic";
};

export class MobileNotificationValidationError extends Error {}

const PERMISSIONS = new Set<MobileNotificationPermission>([
  "not_determined",
  "denied",
  "authorized",
  "provisional",
]);
const CHECKIN_STATES = new Set<MobileNotificationCheckinState>([
  "not_applicable",
  "pending",
  "completed",
  "skipped",
]);
const FORBIDDEN_KEYS = new Set([
  "uid",
  "email",
  "name",
  "token",
  "note",
  "notes",
  "workout",
  "workout_text",
  "readiness",
  "hrv",
  "resting_hr",
  "sleep",
  "fatigue",
  "soreness",
  "pain",
  "injury",
  "diagnosis",
  "medical_data",
  "healthkit_samples",
  "raw_samples",
]);

export function decideMobileNotification(
  value: unknown,
): MobileNotificationDecision {
  assertMobileNotificationRequest(value);
  const identifier = `kinetic.evening-checkin.${value.local_day}`;

  if (!value.enabled) {
    return decision(
      value.existing_request ? "cancel" : "none",
      "user_opt_in_required",
      value.existing_request ? identifier : null,
    );
  }
  if (value.permission === "not_determined") {
    return decision("request_permission", "permission_required");
  }
  if (value.permission === "denied") {
    return decision(
      value.existing_request ? "cancel" : "none",
      "permission_denied",
      value.existing_request ? identifier : null,
    );
  }
  if (!value.has_planned_workout || value.checkin_state === "not_applicable") {
    return decision(
      value.existing_request ? "cancel" : "none",
      "no_planned_workout",
      value.existing_request ? identifier : null,
    );
  }
  if (value.checkin_state === "completed") {
    return decision(
      value.existing_request ? "cancel" : "none",
      "checkin_complete",
      value.existing_request ? identifier : null,
    );
  }
  if (value.checkin_state === "skipped") {
    return decision(
      value.existing_request ? "cancel" : "none",
      "checkin_skipped",
      value.existing_request ? identifier : null,
    );
  }
  if (Date.parse(value.target_at) <= Date.parse(value.now)) {
    return decision(
      value.existing_request ? "cancel" : "none",
      "target_elapsed",
      value.existing_request ? identifier : null,
    );
  }

  return {
    schema_version: MOBILE_NOTIFICATION_SCHEMA,
    action: "schedule",
    reason: "eligible",
    notification_identifier: identifier,
    target_at: value.target_at,
    title: EVENING_CHECKIN_TITLE,
    body: EVENING_CHECKIN_BODY,
    lock_screen_copy: "generic",
  };
}

export function assertMobileNotificationRequest(
  value: unknown,
): asserts value is MobileNotificationRequest {
  rejectForbiddenKeys(value);
  const request = object(value, "mobile notification request");
  exactKeys(request, [
    "schema_version",
    "platform",
    "kind",
    "local_day",
    "now",
    "target_at",
    "enabled",
    "permission",
    "has_planned_workout",
    "checkin_state",
    "existing_request",
  ]);
  if (
    request.schema_version !== MOBILE_NOTIFICATION_SCHEMA ||
    request.platform !== "ios" ||
    request.kind !== "evening_checkin"
  ) {
    invalid("Unsupported mobile notification envelope.");
  }
  assertLocalDay(request.local_day);
  assertTimestamp(request.now, "now");
  assertTimestamp(request.target_at, "target_at");
  if (String(request.target_at).slice(0, 10) !== request.local_day) {
    invalid("Notification target must remain on the requested local day.");
  }
  if (
    typeof request.enabled !== "boolean" ||
    typeof request.has_planned_workout !== "boolean" ||
    typeof request.existing_request !== "boolean"
  ) {
    invalid("Notification flags must be boolean.");
  }
  if (
    typeof request.permission !== "string" ||
    !PERMISSIONS.has(request.permission as MobileNotificationPermission)
  ) {
    invalid("Unsupported notification permission.");
  }
  if (
    typeof request.checkin_state !== "string" ||
    !CHECKIN_STATES.has(
      request.checkin_state as MobileNotificationCheckinState,
    )
  ) {
    invalid("Unsupported check-in state.");
  }
}

function decision(
  action: Exclude<MobileNotificationAction, "schedule">,
  reason: Exclude<MobileNotificationReason, "eligible">,
  notificationIdentifier: string | null = null,
): MobileNotificationDecision {
  return {
    schema_version: MOBILE_NOTIFICATION_SCHEMA,
    action,
    reason,
    notification_identifier: notificationIdentifier,
    target_at: null,
    title: null,
    body: null,
    lock_screen_copy: "generic",
  };
}

function rejectForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenKeys);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      invalid(`Forbidden mobile notification key: ${key}`);
    }
    rejectForbiddenKeys(child);
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
    invalid("Unexpected mobile notification structure.");
  }
}

function assertLocalDay(value: unknown): asserts value is string {
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
    invalid("local_day must be an ISO local day.");
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
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

function object(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) invalid(`${label} must be an object.`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new MobileNotificationValidationError(message);
}
