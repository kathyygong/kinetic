import type { IntakeDay, IntakeDraft } from "./api";
import type { Goal, UserProfile } from "./types";

export const MOBILE_INTAKE_SCHEMA = "mobile-intake.v1" as const;

export type MobileIntakeDraftKind =
  | "schedule"
  | "availability"
  | "travel"
  | "workout_swap"
  | "goal"
  | "preferred_day";
export type MobileIntakeRoute =
  | "review_draft"
  | "perceived_recovery"
  | "caution"
  | "missed_workout"
  | "reflection"
  | "explanation"
  | "clarification"
  | "refusal";
export type MobileIntakeParserFailure =
  | "none"
  | "ai_disabled"
  | "ai_timeout"
  | "ai_unavailable"
  | "malformed_ai"
  | "ungrounded_ai"
  | "parser_error";
export type MobileIntakeRequestFailure =
  | "auth_required"
  | "offline"
  | "timeout"
  | "backend_unavailable"
  | "invalid_response"
  | "unknown";

export type MobileIntakeRequest = {
  schema_version: typeof MOBILE_INTAKE_SCHEMA;
  platform: "ios";
  text: string;
  context: {
    today: string;
    current_goal: {
      race_distance?: Goal["race_distance"];
      target_date?: string;
      weekly_mileage?: number;
    } | null;
    current_profile: {
      experience_level?: UserProfile["experience_level"];
      preferred_training_days: IntakeDay[];
    } | null;
    decision: {
      selected_action: "proceed" | "modify" | "rest" | "unknown";
      readiness_state: "ready" | "caution" | "unknown" | "stale";
      calendar_state: "clear" | "conflict" | "stale" | "missing";
      confidence_bucket: "low" | "moderate" | "high" | "unknown";
      staleness_warning_count: number;
    } | null;
  };
};

type MobileOutcomeBase = { mutable: boolean; route: MobileIntakeRoute };

export type MobileIntakeOutcome =
  | (MobileOutcomeBase & {
      route: "review_draft";
      mutable: true;
      draft_kinds: MobileIntakeDraftKind[];
      review_required: true;
      confirmation_required: true;
      deterministic_validation_required: true;
      draft: IntakeDraft;
    })
  | (MobileOutcomeBase & {
      route: "perceived_recovery";
      mutable: false;
      destination: "perceived_recovery_capture";
      fields_to_capture: Array<
        "perceived_recovery" | "fatigue" | "soreness" | "sleep_correction"
      >;
      inferred_values: false;
      persistence_available: false;
    })
  | (MobileOutcomeBase & {
      route: "caution";
      mutable: false;
      destination: "conservative_caution";
      actions: Array<
        "stop_or_reduce" | "capture_discomfort_flag" | "seek_qualified_care"
      >;
      diagnosis_provided: false;
      pain_severity_inferred: false;
      clearance_provided: false;
    })
  | (MobileOutcomeBase & {
      route: "missed_workout";
      mutable: false;
      destination: "missed_workout_choices";
      choices: Array<"mark_skipped" | "reschedule" | "rebalance">;
      completion_inferred: false;
      persistence_available: false;
    })
  | (MobileOutcomeBase & {
      route: "reflection";
      mutable: false;
      destination: "post_workout_capture";
      fields_to_capture: Array<"completion" | "perceived_effort">;
      completion_inferred: false;
      effort_inferred: false;
      persistence_available: false;
    })
  | (MobileOutcomeBase & {
      route: "explanation";
      mutable: false;
      destination: "deterministic_explanation";
      template: "today_decision_trace";
      facts: {
        selected_action: "proceed" | "modify" | "rest" | "unknown";
        readiness_state: "ready" | "caution" | "unknown" | "stale";
        calendar_state: "clear" | "conflict" | "stale" | "missing";
        confidence_bucket: "low" | "moderate" | "high" | "unknown";
        has_staleness_warning: boolean;
      };
      generated_prose: false;
    })
  | (MobileOutcomeBase & {
      route: "clarification";
      mutable: false;
      reason: "ambiguous" | "incomplete_draft";
      choices: Array<
        | "schedule"
        | "recovery"
        | "pain_or_injury"
        | "missed_workout"
        | "post_workout"
        | "explanation"
      >;
    })
  | (MobileOutcomeBase & {
      route: "refusal";
      mutable: false;
      reason: "unsupported" | "unsafe";
      safe_next_action: "use_supported_intake" | "seek_qualified_care";
    });

export type MobileIntakeResponse = {
  schema_version: typeof MOBILE_INTAKE_SCHEMA;
  mutation_performed: false;
  parser: {
    source: "deterministic" | "ollama" | "deterministic_router";
    ai_attempted: boolean;
    fallback_used: boolean;
    failure: MobileIntakeParserFailure;
  };
  outcome: MobileIntakeOutcome;
};

export type MobileIntakeAuditProperties = {
  platform: "ios";
  action: "routed" | "reviewed" | "confirmed" | "discarded" | "failed";
  outcome: "success" | "failed" | "invalid" | "timeout";
  route: MobileIntakeRoute | "none";
  draft_kind:
    | MobileIntakeDraftKind
    | "multiple"
    | "none";
  failure_state:
    | "none"
    | MobileIntakeRequestFailure
    | "ai_unavailable"
    | "malformed_ai"
    | "ambiguous"
    | "unsupported"
    | "unsafe";
  parser_source:
    | MobileIntakeResponse["parser"]["source"]
    | "none";
  mutation_state: "not_requested" | "review_only" | "applied" | "rejected";
  deterministic_validation: "passed" | "failed" | "not_run";
  latency_ms: number;
};

export function buildMobileIntakeRequest({
  text,
  today,
  goal,
  profile,
  decision = null,
}: {
  text: string;
  today: string;
  goal: Goal | null;
  profile: UserProfile | null;
  decision?: MobileIntakeRequest["context"]["decision"];
}): MobileIntakeRequest {
  const note = text.trim();
  if (!note || note.length > 280) {
    throw new Error("Mobile intake text must contain 1 to 280 characters.");
  }
  if (!isISODate(today)) throw new Error("Mobile intake needs a valid local day.");
  return {
    schema_version: MOBILE_INTAKE_SCHEMA,
    platform: "ios",
    text: note,
    context: {
      today,
      current_goal: goal
        ? {
            race_distance: goal.race_distance,
            target_date: goal.target_date,
            ...(goal.weekly_mileage === undefined
              ? {}
              : { weekly_mileage: goal.weekly_mileage }),
          }
        : null,
      current_profile: profile
        ? {
            experience_level: profile.experience_level,
            preferred_training_days: profile.preferred_training_days.filter(
              isIntakeDay,
            ) as IntakeDay[],
          }
        : null,
      decision: decision
        ? {
            ...decision,
            staleness_warning_count: Math.min(
              10,
              Math.max(0, Math.round(decision.staleness_warning_count)),
            ),
          }
        : null,
    },
  };
}

export function parseMobileIntakeResponse(value: unknown): MobileIntakeResponse {
  const envelope = object(value, "mobile intake response");
  exactKeys(envelope, [
    "schema_version",
    "mutation_performed",
    "parser",
    "outcome",
  ]);
  equal(envelope.schema_version, MOBILE_INTAKE_SCHEMA, "mobile intake schema");
  equal(envelope.mutation_performed, false, "mobile intake mutation flag");
  const parser = object(envelope.parser, "mobile intake parser");
  exactKeys(parser, [
    "source",
    "ai_attempted",
    "fallback_used",
    "failure",
  ]);
  oneOf(parser.source, ["deterministic", "ollama", "deterministic_router"]);
  boolean(parser.ai_attempted, "parser ai_attempted");
  boolean(parser.fallback_used, "parser fallback_used");
  oneOf(parser.failure, [
    "none",
    "ai_disabled",
    "ai_timeout",
    "ai_unavailable",
    "malformed_ai",
    "ungrounded_ai",
    "parser_error",
  ]);

  const outcome = object(envelope.outcome, "mobile intake outcome");
  const route = oneOf(outcome.route, [
    "review_draft",
    "perceived_recovery",
    "caution",
    "missed_workout",
    "reflection",
    "explanation",
    "clarification",
    "refusal",
  ]);
  validateOutcome(route, outcome);
  assertNoForbiddenMobileIntakeResponseKeys(envelope);
  return envelope as MobileIntakeResponse;
}

export function classifyMobileIntakeHttpFailure(
  status: number,
): MobileIntakeRequestFailure {
  if (status === 401 || status === 403) return "auth_required";
  if (status >= 500) return "backend_unavailable";
  return "invalid_response";
}

export function classifyMobileIntakeClientFailure(
  cause: unknown,
): "offline" | "timeout" | "unknown" {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return "timeout";
  }
  if (cause instanceof TypeError) return "offline";
  return "unknown";
}

export function buildMobileIntakeAuditProperties({
  action,
  response,
  failure,
  deterministicValidation = "not_run",
  latencyMs,
}: {
  action: MobileIntakeAuditProperties["action"];
  response?: MobileIntakeResponse;
  failure?: MobileIntakeRequestFailure;
  deterministicValidation?: MobileIntakeAuditProperties["deterministic_validation"];
  latencyMs: number;
}): MobileIntakeAuditProperties {
  if (!response) {
    const failureState = failure ?? "unknown";
    return {
      platform: "ios",
      action: "failed",
      outcome: failureState === "timeout" ? "timeout" : "failed",
      route: "none",
      draft_kind: "none",
      failure_state: failureState,
      parser_source: "none",
      mutation_state: "not_requested",
      deterministic_validation: deterministicValidation,
      latency_ms: latencyMs,
    };
  }
  const kinds =
    response.outcome.route === "review_draft"
      ? response.outcome.draft_kinds
      : [];
  const failureState = intakeAuditFailure(response);
  return {
    platform: "ios",
    action,
    outcome:
      action === "confirmed" && deterministicValidation === "failed"
        ? "invalid"
        : "success",
    route: response.outcome.route,
    draft_kind:
      kinds.length === 0
        ? "none"
        : kinds.length === 1
          ? kinds[0]
          : "multiple",
    failure_state: failureState,
    parser_source: response.parser.source,
    mutation_state:
      action === "confirmed"
        ? deterministicValidation === "passed"
          ? "applied"
          : "rejected"
        : response.outcome.route === "review_draft"
          ? "review_only"
          : "not_requested",
    deterministic_validation: deterministicValidation,
    latency_ms: latencyMs,
  };
}

export function assertNoForbiddenMobileIntakeResponseKeys(value: unknown): void {
  walk(value, (key) => {
    if (
      /^(uid|email|full_?name|token|secret|raw_note|generated_text|generated_copy)$/i.test(
        key,
      ) ||
      /^(sleep_hours|hrv|resting_hr|biometric_value|pain_severity|medical_data)$/i.test(
        key,
      )
    ) {
      throw new Error(`Forbidden mobile intake response key: ${key}`);
    }
  });
}

function validateOutcome(
  route: MobileIntakeRoute,
  outcome: Record<string, unknown>,
): void {
  if (route === "review_draft") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "draft_kinds",
      "review_required",
      "confirmation_required",
      "deterministic_validation_required",
      "draft",
    ]);
    equal(outcome.mutable, true, "review draft mutable");
    equal(outcome.review_required, true, "review required");
    equal(outcome.confirmation_required, true, "confirmation required");
    equal(
      outcome.deterministic_validation_required,
      true,
      "deterministic validation required",
    );
    arrayOfEnum(outcome.draft_kinds, [
      "schedule",
      "availability",
      "travel",
      "workout_swap",
      "goal",
      "preferred_day",
    ]);
    validateDraft(outcome.draft);
    return;
  }

  equal(outcome.mutable, false, `${route} mutable`);
  if (route === "perceived_recovery") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "destination",
      "fields_to_capture",
      "inferred_values",
      "persistence_available",
    ]);
    equal(outcome.destination, "perceived_recovery_capture", "destination");
    equal(outcome.inferred_values, false, "recovery inference");
    equal(outcome.persistence_available, false, "recovery persistence");
    arrayOfEnum(outcome.fields_to_capture, [
      "perceived_recovery",
      "fatigue",
      "soreness",
      "sleep_correction",
    ]);
  } else if (route === "caution") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "destination",
      "actions",
      "diagnosis_provided",
      "pain_severity_inferred",
      "clearance_provided",
    ]);
    equal(outcome.destination, "conservative_caution", "destination");
    equal(outcome.diagnosis_provided, false, "diagnosis");
    equal(outcome.pain_severity_inferred, false, "pain inference");
    equal(outcome.clearance_provided, false, "training clearance");
    arrayOfEnum(outcome.actions, [
      "stop_or_reduce",
      "capture_discomfort_flag",
      "seek_qualified_care",
    ]);
  } else if (route === "missed_workout") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "destination",
      "choices",
      "completion_inferred",
      "persistence_available",
    ]);
    equal(outcome.destination, "missed_workout_choices", "destination");
    equal(outcome.completion_inferred, false, "completion inference");
    equal(outcome.persistence_available, false, "missed workout persistence");
    arrayOfEnum(outcome.choices, ["mark_skipped", "reschedule", "rebalance"]);
  } else if (route === "reflection") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "destination",
      "fields_to_capture",
      "completion_inferred",
      "effort_inferred",
      "persistence_available",
    ]);
    equal(outcome.destination, "post_workout_capture", "destination");
    equal(outcome.completion_inferred, false, "completion inference");
    equal(outcome.effort_inferred, false, "effort inference");
    equal(outcome.persistence_available, false, "reflection persistence");
    arrayOfEnum(outcome.fields_to_capture, ["completion", "perceived_effort"]);
  } else if (route === "explanation") {
    exactKeys(outcome, [
      "route",
      "mutable",
      "destination",
      "template",
      "facts",
      "generated_prose",
    ]);
    equal(outcome.destination, "deterministic_explanation", "destination");
    equal(outcome.template, "today_decision_trace", "template");
    equal(outcome.generated_prose, false, "generated prose");
    const facts = object(outcome.facts, "explanation facts");
    exactKeys(facts, [
      "selected_action",
      "readiness_state",
      "calendar_state",
      "confidence_bucket",
      "has_staleness_warning",
    ]);
    oneOf(facts.selected_action, ["proceed", "modify", "rest", "unknown"]);
    oneOf(facts.readiness_state, ["ready", "caution", "unknown", "stale"]);
    oneOf(facts.calendar_state, ["clear", "conflict", "stale", "missing"]);
    oneOf(facts.confidence_bucket, ["low", "moderate", "high", "unknown"]);
    boolean(facts.has_staleness_warning, "staleness warning");
  } else if (route === "clarification") {
    exactKeys(outcome, ["route", "mutable", "reason", "choices"]);
    oneOf(outcome.reason, ["ambiguous", "incomplete_draft"]);
    arrayOfEnum(outcome.choices, [
      "schedule",
      "recovery",
      "pain_or_injury",
      "missed_workout",
      "post_workout",
      "explanation",
    ]);
  } else {
    exactKeys(outcome, [
      "route",
      "mutable",
      "reason",
      "safe_next_action",
    ]);
    oneOf(outcome.reason, ["unsupported", "unsafe"]);
    oneOf(outcome.safe_next_action, [
      "use_supported_intake",
      "seek_qualified_care",
    ]);
  }
}

function intakeAuditFailure(
  response: MobileIntakeResponse,
): MobileIntakeAuditProperties["failure_state"] {
  if (response.parser.failure === "ai_timeout") return "timeout";
  if (
    response.parser.failure === "ai_unavailable" ||
    response.parser.failure === "ai_disabled" ||
    response.parser.failure === "parser_error"
  ) {
    return "ai_unavailable";
  }
  if (
    response.parser.failure === "malformed_ai" ||
    response.parser.failure === "ungrounded_ai"
  ) {
    return "malformed_ai";
  }
  if (response.outcome.route === "clarification") return "ambiguous";
  if (response.outcome.route === "refusal") return response.outcome.reason;
  return "none";
}

function validateDraft(value: unknown): void {
  const draft = object(value, "mobile intake draft");
  exactKeys(draft, [
    "status",
    "summary",
    "goal_changes",
    "schedule_changes",
    "availability_changes",
    "preference_changes",
    "workout_swap_changes",
    "grounding",
    "warnings",
  ]);
  equal(draft.status, "ready", "reviewable draft status");
  string(draft.summary, "draft summary");
  for (const key of [
    "goal_changes",
    "schedule_changes",
    "availability_changes",
    "preference_changes",
    "workout_swap_changes",
    "grounding",
    "warnings",
  ]) {
    if (!Array.isArray(draft[key])) throw new Error(`${key} must be an array`);
  }
  const changeCount =
    (draft.goal_changes as unknown[]).length +
    (draft.schedule_changes as unknown[]).length +
    (draft.availability_changes as unknown[]).length +
    (draft.preference_changes as unknown[]).length +
    (draft.workout_swap_changes as unknown[]).length;
  if (changeCount < 1) throw new Error("Reviewable draft has no changes");
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const ids = new Set<string>();
  const addId = (raw: unknown) => {
    const id = stringValue(raw, "change id");
    if (ids.has(id)) throw new Error("Draft change IDs must be unique");
    ids.add(id);
  };
  for (const raw of draft.goal_changes as unknown[]) {
    const change = object(raw, "goal change");
    exactKeys(change, ["id", "field", "value"]);
    addId(change.id);
    const field = oneOf(change.field, [
      "race_distance",
      "target_date",
      "weekly_mileage",
    ]);
    if (
      field === "race_distance" &&
      !["5k", "10k", "half", "marathon"].includes(String(change.value))
    ) {
      throw new Error("Unsupported race distance");
    }
    if (
      field === "target_date" &&
      (typeof change.value !== "string" || !isISODate(change.value))
    ) {
      throw new Error("Invalid target date");
    }
    if (
      field === "weekly_mileage" &&
      (typeof change.value !== "number" ||
        !Number.isFinite(change.value) ||
        change.value < 1 ||
        change.value > 150)
    ) {
      throw new Error("Invalid weekly mileage");
    }
  }
  for (const raw of draft.schedule_changes as unknown[]) {
    const change = object(raw, "schedule change");
    exactKeys(change, ["id", "field", "value"]);
    addId(change.id);
    equal(change.field, "preferred_training_days", "schedule field");
    arrayOfEnum(change.value, days);
  }
  for (const raw of draft.availability_changes as unknown[]) {
    const change = object(raw, "availability change");
    exactKeys(change, ["id", "day", "available_minutes", "easy_only"]);
    addId(change.id);
    oneOf(change.day, days);
    if (
      change.available_minutes !== null &&
      (typeof change.available_minutes !== "number" ||
        !Number.isInteger(change.available_minutes) ||
        change.available_minutes < 0 ||
        change.available_minutes > 240)
    ) {
      throw new Error("Invalid availability minutes");
    }
    boolean(change.easy_only, "availability easy_only");
    if (change.available_minutes === null && change.easy_only !== true) {
      throw new Error("Availability needs minutes or an easy-only flag");
    }
  }
  for (const raw of draft.preference_changes as unknown[]) {
    const change = object(raw, "preference change");
    exactKeys(change, ["id", "field", "value"]);
    addId(change.id);
    equal(change.field, "experience_level", "preference field");
    oneOf(change.value, ["beginner", "intermediate", "advanced"]);
  }
  for (const raw of draft.workout_swap_changes as unknown[]) {
    const change = object(raw, "workout swap");
    exactKeys(change, ["id", "from_day", "to_day"]);
    addId(change.id);
    const from = oneOf(change.from_day, days);
    const to = oneOf(change.to_day, days);
    if (from === to) throw new Error("Workout swap days must differ");
  }
  const grounded = new Set<string>();
  for (const raw of draft.grounding as unknown[]) {
    const item = object(raw, "grounding evidence");
    exactKeys(item, ["change_id", "evidence"]);
    const changeId = stringValue(item.change_id, "grounding change id");
    string(item.evidence, "grounding evidence");
    grounded.add(changeId);
  }
  if ([...ids].some((id) => !grounded.has(id))) {
    throw new Error("Every draft change needs grounding evidence");
  }
  if (
    (draft.warnings as unknown[]).some(
      (warning) => typeof warning !== "string",
    )
  ) {
    throw new Error("Draft warnings must be strings");
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  const expected = [...keys].sort().join(",");
  const actual = Object.keys(value).sort().join(",");
  if (actual !== expected) {
    throw new Error(`Unexpected keys: expected ${expected}; received ${actual}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} is invalid`);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Unsupported enum value: ${String(value)}`);
  }
  return value as T;
}

function boolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
}

function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function stringValue(value: unknown, label: string): string {
  string(value, label);
  return value;
}

function arrayOfEnum<T extends string>(
  value: unknown,
  values: readonly T[],
): asserts value is T[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || !values.includes(item as T))
  ) {
    throw new Error("Expected a non-empty bounded enum array");
  }
}

function walk(
  value: unknown,
  inspectKey: (key: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, inspectKey));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      inspectKey(key);
      walk(child, inspectKey);
    }
  }
}

function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isIntakeDay(value: string): value is IntakeDay {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(value);
}
