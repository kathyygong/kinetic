import type { IntakeDay, IntakeDraft } from "./api";
import type { LearnedPreference } from "./behaviorTypes";

export const BEHAVIOR_PATTERN_RESULT_VERSION =
  "behavior-pattern-result.v1" as const;

export type BehaviorPatternFamily =
  | "heavy_calendar_misses"
  | "specific_day_skips"
  | "long_run_day_preference"
  | "rest_override"
  | "adjustment_tolerance"
  | "stale_data_or_checkin_gap"
  | "pain_or_discomfort_recurrence";

export type BehaviorPreferenceType =
  | LearnedPreference["type"]
  | "none";

type PatternResultBase = {
  review_required: boolean;
  confirmation_required: boolean;
  mutation:
    | "none"
    | "confirmed_preference"
    | "preferred_training_days";
  action_label: string;
  will_change_if_confirmed: string;
  will_never_change: string;
};

export type ScoringPreferenceResult = PatternResultBase & {
  kind: "scoring_preference_review";
  review_required: true;
  confirmation_required: true;
  mutation: "confirmed_preference";
  preference_type: Exclude<BehaviorPreferenceType, "none" | "schedule_preference">;
  adjustment_direction:
    | "shorter_or_easier"
    | "recovery_alternative"
    | "reduce_intensity"
    | "increase_intensity";
};

export type PreferredDayResult = PatternResultBase & {
  kind: "preferred_day_review";
  review_required: true;
  confirmation_required: true;
  mutation: "preferred_training_days";
  strategy: "avoid_day" | "prefer_long_run_day";
  observed_day: IntakeDay;
};

export type CheckinPromptResult = PatternResultBase & {
  kind: "checkin_prompt";
  review_required: false;
  confirmation_required: false;
  mutation: "none";
  prompt_kind: "sync_readiness" | "complete_checkin";
};

export type CautionResult = PatternResultBase & {
  kind: "caution";
  review_required: false;
  confirmation_required: false;
  mutation: "none";
  caution_actions: [
    "stop_or_reduce",
    "capture_discomfort_flag",
    "seek_qualified_care",
  ];
};

export type BehaviorPatternResult =
  | ScoringPreferenceResult
  | PreferredDayResult
  | CheckinPromptResult
  | CautionResult;

export type BehaviorPattern = {
  id: string;
  family: BehaviorPatternFamily;
  title: string;
  description: string;
  confidence: "low" | "moderate" | "high";
  suggested_adjustment: string;
  preference_type: BehaviorPreferenceType;
  support_count: number;
  why_it_matters: string;
  result: BehaviorPatternResult;
};

export type BehaviorInsightsResponse = {
  contract_version: typeof BEHAVIOR_PATTERN_RESULT_VERSION;
  analysis: {
    source: "deterministic" | "ollama";
    fallback_used: boolean;
    failure:
      | "none"
      | "timeout"
      | "ai_unavailable"
      | "malformed_ai"
      | "invalid_ai"
      | "unsupported_ai"
      | "unknown";
  };
  patterns: BehaviorPattern[];
  warnings: string[];
};

const FAMILIES = new Set<BehaviorPatternFamily>([
  "heavy_calendar_misses",
  "specific_day_skips",
  "long_run_day_preference",
  "rest_override",
  "adjustment_tolerance",
  "stale_data_or_checkin_gap",
  "pain_or_discomfort_recurrence",
]);
const PREFERENCE_TYPES = new Set<BehaviorPreferenceType>([
  "busy_day_preference",
  "rest_day_preference",
  "intensity_tolerance",
  "schedule_preference",
  "none",
]);
const DAYS = new Set<IntakeDay>([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);
const FAILURES = new Set<BehaviorInsightsResponse["analysis"]["failure"]>([
  "none",
  "timeout",
  "ai_unavailable",
  "malformed_ai",
  "invalid_ai",
  "unsupported_ai",
  "unknown",
]);

export function parseBehaviorInsightsResponse(
  value: unknown,
): BehaviorInsightsResponse {
  if (!isRecord(value)) invalid("response must be an object");
  if (value.contract_version !== BEHAVIOR_PATTERN_RESULT_VERSION) {
    invalid("contract version is unsupported");
  }
  if (!isRecord(value.analysis)) invalid("analysis metadata is required");
  const source = value.analysis.source;
  const failure = value.analysis.failure;
  if (source !== "deterministic" && source !== "ollama") {
    invalid("analysis source is invalid");
  }
  if (
    typeof value.analysis.fallback_used !== "boolean" ||
    typeof failure !== "string" ||
    !FAILURES.has(failure as BehaviorInsightsResponse["analysis"]["failure"])
  ) {
    invalid("analysis fallback metadata is invalid");
  }
  if (
    value.analysis.fallback_used === false &&
    failure !== "none"
  ) {
    invalid("analysis failure requires fallback");
  }
  if (!Array.isArray(value.patterns) || value.patterns.length > 20) {
    invalid("patterns must be a bounded array");
  }
  if (
    !Array.isArray(value.warnings) ||
    value.warnings.length > 20 ||
    value.warnings.some((item) => typeof item !== "string")
  ) {
    invalid("warnings must be a bounded string array");
  }
  const patterns = value.patterns.map(parsePattern);
  if (new Set(patterns.map((pattern) => pattern.id)).size !== patterns.length) {
    invalid("pattern ids must be unique");
  }
  return {
    contract_version: BEHAVIOR_PATTERN_RESULT_VERSION,
    analysis: {
      source,
      fallback_used: value.analysis.fallback_used,
      failure: failure as BehaviorInsightsResponse["analysis"]["failure"],
    },
    patterns,
    warnings: value.warnings.map((item) => String(item).slice(0, 500)),
  };
}

export function buildConfirmedPatternPreference(
  pattern: BehaviorPattern,
  createdAt = new Date().toISOString(),
): LearnedPreference {
  if (pattern.result.kind !== "scoring_preference_review") {
    throw new Error("Only scoring preference results can be confirmed here.");
  }
  return {
    id: pattern.id,
    type: pattern.result.preference_type,
    description: pattern.description,
    confidence: pattern.confidence,
    userConfirmed: true,
    createdAt,
  };
}

export function buildPreferredDayPatternDraft(
  pattern: BehaviorPattern,
  selectedDays: IntakeDay[],
  minimumTrainingDays = 1,
): { draft: IntakeDraft; sourceText: string } {
  if (pattern.result.kind !== "preferred_day_review") {
    throw new Error("This pattern does not support preferred-day review.");
  }
  const days = [...new Set(selectedDays)];
  if (
    days.length === 0 ||
    days.length > 7 ||
    days.some((day) => !DAYS.has(day))
  ) {
    throw new Error("Choose one to seven supported training days.");
  }
  if (
    !Number.isInteger(minimumTrainingDays) ||
    minimumTrainingDays < 1 ||
    minimumTrainingDays > 7 ||
    days.length < minimumTrainingDays
  ) {
    throw new Error(
      `Choose at least ${minimumTrainingDays} training days so deterministic plan spacing can be preserved.`,
    );
  }
  if (
    pattern.result.strategy === "avoid_day" &&
    days.includes(pattern.result.observed_day)
  ) {
    throw new Error(
      `Remove ${pattern.result.observed_day.toUpperCase()} or dismiss this pattern.`,
    );
  }
  if (
    pattern.result.strategy === "prefer_long_run_day" &&
    !days.includes(pattern.result.observed_day)
  ) {
    throw new Error(
      `Include ${pattern.result.observed_day.toUpperCase()} or dismiss this pattern.`,
    );
  }
  const changeId = `${pattern.id}_preferred_days`;
  const sourceText = pattern.id;
  return {
    sourceText,
    draft: {
      status: "ready",
      summary: "Review preferred training days from a confirmed behavior pattern.",
      goal_changes: [],
      schedule_changes: [
        {
          id: changeId,
          field: "preferred_training_days",
          value: days,
        },
      ],
      availability_changes: [],
      preference_changes: [],
      workout_swap_changes: [],
      grounding: [{ change_id: changeId, evidence: pattern.id }],
      warnings: [
        "Deterministic plan validation runs again before these days are saved.",
      ],
    },
  };
}

function parsePattern(value: unknown): BehaviorPattern {
  if (!isRecord(value)) invalid("pattern must be an object");
  if (
    typeof value.id !== "string" ||
    !/^pattern_[a-z0-9_]+$/.test(value.id) ||
    value.id.length > 160
  ) {
    invalid("pattern id is invalid");
  }
  if (
    typeof value.family !== "string" ||
    !FAMILIES.has(value.family as BehaviorPatternFamily)
  ) {
    invalid("pattern family is invalid");
  }
  const title = requiredText(value, "title", "pattern");
  const description = requiredText(value, "description", "pattern");
  const suggestedAdjustment = requiredText(
    value,
    "suggested_adjustment",
    "pattern",
  );
  const whyItMatters = requiredText(value, "why_it_matters", "pattern");
  if (!["low", "moderate", "high"].includes(String(value.confidence))) {
    invalid("pattern confidence is invalid");
  }
  if (
    typeof value.preference_type !== "string" ||
    !PREFERENCE_TYPES.has(value.preference_type as BehaviorPreferenceType)
  ) {
    invalid("pattern preference type is invalid");
  }
  if (
    typeof value.support_count !== "number" ||
    !Number.isInteger(value.support_count) ||
    value.support_count < 2 ||
    value.support_count > 1_000
  ) {
    invalid("pattern support count is invalid");
  }
  const family = value.family as BehaviorPatternFamily;
  const result = parseResult(value.result, family);
  const preferenceType = value.preference_type as BehaviorPreferenceType;
  if (
    result.kind === "scoring_preference_review" &&
    preferenceType !== result.preference_type
  ) {
    invalid("scoring preference type drifted");
  }
  if (
    result.kind !== "scoring_preference_review" &&
    result.kind !== "preferred_day_review" &&
    preferenceType !== "none"
  ) {
    invalid("non-preference result cannot carry a preference type");
  }
  return {
    id: value.id,
    family,
    title,
    description,
    confidence: value.confidence as BehaviorPattern["confidence"],
    suggested_adjustment: suggestedAdjustment,
    preference_type: preferenceType,
    support_count: value.support_count,
    why_it_matters: whyItMatters,
    result,
  };
}

function parseResult(
  value: unknown,
  family: BehaviorPatternFamily,
): BehaviorPatternResult {
  if (!isRecord(value)) invalid("pattern result must be an object");
  const actionLabel = requiredText(value, "action_label", "result");
  const willChange = requiredText(
    value,
    "will_change_if_confirmed",
    "result",
  );
  const willNeverChange = requiredText(value, "will_never_change", "result");
  const common = {
    action_label: actionLabel,
    will_change_if_confirmed: willChange,
    will_never_change: willNeverChange,
  };
  if (value.kind === "scoring_preference_review") {
    if (
      !["heavy_calendar_misses", "rest_override", "adjustment_tolerance"].includes(
        family,
      ) ||
      value.review_required !== true ||
      value.confirmation_required !== true ||
      value.mutation !== "confirmed_preference" ||
      !["busy_day_preference", "rest_day_preference", "intensity_tolerance"].includes(
        String(value.preference_type),
      ) ||
      ![
        "shorter_or_easier",
        "recovery_alternative",
        "reduce_intensity",
        "increase_intensity",
      ].includes(String(value.adjustment_direction))
    ) {
      invalid("scoring preference result is invalid");
    }
    return {
      ...common,
      kind: "scoring_preference_review",
      review_required: true,
      confirmation_required: true,
      mutation: "confirmed_preference",
      preference_type: value.preference_type as ScoringPreferenceResult["preference_type"],
      adjustment_direction:
        value.adjustment_direction as ScoringPreferenceResult["adjustment_direction"],
    };
  }
  if (value.kind === "preferred_day_review") {
    if (
      !["specific_day_skips", "long_run_day_preference"].includes(family) ||
      value.review_required !== true ||
      value.confirmation_required !== true ||
      value.mutation !== "preferred_training_days" ||
      !["avoid_day", "prefer_long_run_day"].includes(String(value.strategy)) ||
      typeof value.observed_day !== "string" ||
      !DAYS.has(value.observed_day as IntakeDay)
    ) {
      invalid("preferred-day result is invalid");
    }
    return {
      ...common,
      kind: "preferred_day_review",
      review_required: true,
      confirmation_required: true,
      mutation: "preferred_training_days",
      strategy: value.strategy as PreferredDayResult["strategy"],
      observed_day: value.observed_day as IntakeDay,
    };
  }
  if (value.kind === "checkin_prompt") {
    if (
      family !== "stale_data_or_checkin_gap" ||
      value.review_required !== false ||
      value.confirmation_required !== false ||
      value.mutation !== "none" ||
      !["sync_readiness", "complete_checkin"].includes(String(value.prompt_kind))
    ) {
      invalid("check-in prompt result is invalid");
    }
    return {
      ...common,
      kind: "checkin_prompt",
      review_required: false,
      confirmation_required: false,
      mutation: "none",
      prompt_kind: value.prompt_kind as CheckinPromptResult["prompt_kind"],
    };
  }
  if (value.kind === "caution") {
    const actions = value.caution_actions;
    if (
      family !== "pain_or_discomfort_recurrence" ||
      value.review_required !== false ||
      value.confirmation_required !== false ||
      value.mutation !== "none" ||
      !Array.isArray(actions) ||
      actions.join(",") !==
        "stop_or_reduce,capture_discomfort_flag,seek_qualified_care"
    ) {
      invalid("caution result is invalid");
    }
    return {
      ...common,
      kind: "caution",
      review_required: false,
      confirmation_required: false,
      mutation: "none",
      caution_actions: [
        "stop_or_reduce",
        "capture_discomfort_flag",
        "seek_qualified_care",
      ],
    };
  }
  return invalid("pattern result kind is invalid");
}

function invalid(message: string): never {
  throw new Error(`Invalid ${BEHAVIOR_PATTERN_RESULT_VERSION}: ${message}.`);
}

function requiredText(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const text = value[key];
  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > 500
  ) {
    invalid(`${label} ${key} is invalid`);
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
