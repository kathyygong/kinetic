export const MOBILE_FOUNDATION_SCHEMA = "mobile-foundation.v1" as const;

export type MobileFoundationState = {
  schema_version: typeof MOBILE_FOUNDATION_SCHEMA;
  revision: number;
  account_state: "active" | "deletion_requested" | "deleted";
  onboarding: {
    status: "not_started" | "in_progress" | "ready_for_plan" | "completed";
    completed_steps: Array<
      "goal" | "experience" | "mileage" | "personal_records" | "schedule"
    >;
    deferred_permissions: Array<"health" | "calendar" | "notifications">;
  };
  route: "onboarding" | "today" | "plan" | "progress" | "settings";
  permissions: {
    health: "not_requested" | "denied" | "authorized" | "unavailable";
    calendar: "not_requested" | "denied" | "authorized" | "unavailable";
    notifications: "not_requested" | "denied" | "authorized" | "unavailable";
  };
  settings: {
    evening_checkin_reminder: {
      enabled: boolean;
      local_hour: number;
      local_minute: number;
      delivery: "local_only";
      lock_screen_copy: "generic";
    };
    analytics: "off" | "privacy_safe";
  };
  migration: {
    source: "new_install" | "kinetic_companion_v1";
    status: "not_needed" | "pending" | "completed" | "failed";
    legacy_revision: number | null;
  };
  deletion: {
    requested_at: string | null;
    scope: "none" | "training_data" | "account";
    pending_domains: Array<
      | "profile"
      | "goal"
      | "plan"
      | "plan_history"
      | "plan_operations"
      | "readiness"
      | "workouts"
      | "preferences"
      | "settings"
      | "onboarding"
      | "mobile_audit"
    >;
  };
};

const FOUNDATION_DOMAINS = [
  "profile",
  "goal",
  "plan",
  "plan_history",
  "plan_operations",
  "readiness",
  "workouts",
  "preferences",
  "settings",
  "onboarding",
  "mobile_audit",
] as const;

export function parseMobileFoundationState(value: unknown): MobileFoundationState {
  const state = object(value, "mobile foundation state");
  exact(state, [
    "schema_version",
    "revision",
    "account_state",
    "onboarding",
    "route",
    "permissions",
    "settings",
    "migration",
    "deletion",
  ]);
  equal(state.schema_version, MOBILE_FOUNDATION_SCHEMA, "foundation schema");
  integer(state.revision, 1, Number.MAX_SAFE_INTEGER, "foundation revision");
  oneOf(state.account_state, ["active", "deletion_requested", "deleted"], "account state");
  oneOf(state.route, ["onboarding", "today", "plan", "progress", "settings"], "route");

  const onboarding = object(state.onboarding, "onboarding");
  exact(onboarding, ["status", "completed_steps", "deferred_permissions"]);
  const onboardingStatus = oneOf(
    onboarding.status,
    ["not_started", "in_progress", "ready_for_plan", "completed"],
    "onboarding status",
  );
  arrayEnum(onboarding.completed_steps, [
    "goal",
    "experience",
    "mileage",
    "personal_records",
    "schedule",
  ], "completed steps");
  arrayEnum(onboarding.deferred_permissions, [
    "health",
    "calendar",
    "notifications",
  ], "deferred permissions");

  const permissions = object(state.permissions, "permissions");
  exact(permissions, ["health", "calendar", "notifications"]);
  for (const permission of ["health", "calendar", "notifications"] as const) {
    oneOf(permissions[permission], [
      "not_requested",
      "denied",
      "authorized",
      "unavailable",
    ], `${permission} permission`);
  }

  const settings = object(state.settings, "settings");
  exact(settings, ["evening_checkin_reminder", "analytics"]);
  oneOf(settings.analytics, ["off", "privacy_safe"], "analytics");
  const reminder = object(settings.evening_checkin_reminder, "reminder");
  exact(reminder, [
    "enabled",
    "local_hour",
    "local_minute",
    "delivery",
    "lock_screen_copy",
  ]);
  boolean(reminder.enabled, "reminder enabled");
  integer(reminder.local_hour, 0, 23, "reminder hour");
  integer(reminder.local_minute, 0, 59, "reminder minute");
  equal(reminder.delivery, "local_only", "reminder delivery");
  equal(reminder.lock_screen_copy, "generic", "reminder copy");
  if (reminder.enabled && permissions.notifications !== "authorized") {
    throw new Error("Enabled reminder requires notification authorization.");
  }

  const migration = object(state.migration, "migration");
  exact(migration, ["source", "status", "legacy_revision"]);
  oneOf(migration.source, ["new_install", "kinetic_companion_v1"], "migration source");
  oneOf(migration.status, ["not_needed", "pending", "completed", "failed"], "migration status");
  nullableInteger(migration.legacy_revision, "legacy revision");
  if (
    migration.source === "new_install" &&
    (migration.status !== "not_needed" || migration.legacy_revision !== null)
  ) {
    throw new Error("New installs cannot have a legacy migration.");
  }
  if (
    migration.source === "kinetic_companion_v1" &&
    (migration.status === "not_needed" || migration.legacy_revision === null)
  ) {
    throw new Error("Legacy migrations require a source revision and status.");
  }

  const deletion = object(state.deletion, "deletion");
  exact(deletion, ["requested_at", "scope", "pending_domains"]);
  nullableTimestamp(deletion.requested_at, "deletion requested_at");
  const deletionScope = oneOf(deletion.scope, ["none", "training_data", "account"], "deletion scope");
  arrayEnum(deletion.pending_domains, FOUNDATION_DOMAINS, "pending domains");
  const pendingDomains = deletion.pending_domains as Array<
    (typeof FOUNDATION_DOMAINS)[number]
  >;
  if (deletionScope === "none" && pendingDomains.length > 0) {
    throw new Error("No deletion scope cannot have pending domains.");
  }
  if (deletionScope === "none" && deletion.requested_at !== null) {
    throw new Error("No deletion scope cannot have a request timestamp.");
  }
  if (deletionScope !== "none" && deletion.requested_at === null) {
    throw new Error("Deletion work requires a request timestamp.");
  }
  if (
    state.account_state === "active" &&
    deletionScope === "account"
  ) {
    throw new Error("Active accounts cannot have account deletion in progress.");
  }
  if (
    state.account_state === "deletion_requested" &&
    (deletionScope !== "account" ||
      !FOUNDATION_DOMAINS.every((domain) =>
        pendingDomains.includes(domain)))
  ) {
    throw new Error("Account deletion must cover every owner-scoped domain.");
  }
  if (state.account_state === "deleted" && pendingDomains.length > 0) {
    throw new Error("Deleted accounts cannot retain pending domains.");
  }
  if (
    state.account_state === "deleted" &&
    deletionScope !== "account"
  ) {
    throw new Error("Deleted accounts must retain the account deletion receipt.");
  }
  const requiredSteps = [
    "goal",
    "experience",
    "mileage",
    "personal_records",
    "schedule",
  ] as const;
  const completedSteps = onboarding.completed_steps as Array<
    (typeof requiredSteps)[number]
  >;
  if (
    onboardingStatus === "completed" &&
    !requiredSteps.every((step) => completedSteps.includes(step))
  ) {
    throw new Error("Completed onboarding is missing a required step.");
  }
  if (state.route !== "onboarding" && onboardingStatus !== "completed") {
    throw new Error("Incomplete onboarding must route to onboarding.");
  }
  assertPrivacySafe(state);
  return state as MobileFoundationState;
}

export function buildAccountDeletionBoundary(
  state: MobileFoundationState,
  requestedAt: string,
): MobileFoundationState {
  nullableTimestamp(requestedAt, "account deletion timestamp");
  if (state.account_state !== "active") {
    throw new Error("Only active accounts can request deletion.");
  }
  return {
    ...state,
    revision: state.revision + 1,
    account_state: "deletion_requested",
    route: "settings",
    settings: {
      ...state.settings,
      evening_checkin_reminder: {
        ...state.settings.evening_checkin_reminder,
        enabled: false,
      },
    },
    deletion: {
      requested_at: requestedAt,
      scope: "account",
      pending_domains: [...FOUNDATION_DOMAINS],
    },
  };
}

function assertPrivacySafe(value: unknown): void {
  walk(value, (key) => {
    if (/^(email|full_?name|token|secret|raw_|pain|medical|biometric)/i.test(key)) {
      throw new Error(`Forbidden foundation key: ${key}`);
    }
  });
}

function object(value: unknown, label: string): Record<string, unknown> {
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

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as T;
}

function integer(value: unknown, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`Invalid ${label}.`);
  }
}

function nullableInteger(value: unknown, label: string): void {
  if (value !== null) integer(value, 1, Number.MAX_SAFE_INTEGER, label);
}

function boolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}.`);
}

function nullableTimestamp(value: unknown, label: string): void {
  if (value === null) return;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}.`);
  }
}

function arrayEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): asserts value is T[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !values.includes(entry as T)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`Invalid ${label}.`);
  }
}

function walk(value: unknown, visit: (key: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => walk(entry, visit));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visit(key);
      walk(child, visit);
    }
  }
}
