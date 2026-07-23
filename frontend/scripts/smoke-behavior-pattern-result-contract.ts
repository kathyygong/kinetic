import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BehaviorPattern } from "../lib/behaviorPatternResultContract";
import {
  buildConfirmedPatternPreference,
  buildPreferredDayPatternDraft,
  parseBehaviorInsightsResponse,
} from "../lib/behaviorPatternResultContract";
import {
  buildConfirmedIntakeState,
  validateIntakeDraft,
} from "../lib/intake";
import { emptyProfile } from "../lib/profileStorage";
import {
  applyPreferredDays,
  generateTrainingPlan,
} from "../lib/planGenerator";
import { planSignature, type SavedPlan } from "../lib/storage";
import type { Goal, UserProfile } from "../lib/types";

type Fixture = {
  contract_schema: string;
  response: unknown;
  failure_cases: Array<{
    id: string;
    expected_source: string;
    expected_failure: string;
    fallback_used: boolean;
  }>;
  privacy_forbidden_audit_keys: string[];
};

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "..",
      "ios",
      "KineticCompanion",
      "Tests",
      "Fixtures",
      "mobile-pattern-result-contract.json",
    ),
    "utf8",
  ),
) as Fixture;

expect(
  fixture.contract_schema === "behavior-pattern-result.v1",
  "fixture contract version drifted",
);

const response = parseBehaviorInsightsResponse(fixture.response);
const expectedRoutes = new Map<
  BehaviorPattern["family"],
  BehaviorPattern["result"]["kind"]
>([
  ["heavy_calendar_misses", "scoring_preference_review"],
  ["specific_day_skips", "preferred_day_review"],
  ["long_run_day_preference", "preferred_day_review"],
  ["rest_override", "scoring_preference_review"],
  ["adjustment_tolerance", "scoring_preference_review"],
  ["stale_data_or_checkin_gap", "checkin_prompt"],
  ["pain_or_discomfort_recurrence", "caution"],
]);
expect(
  response.patterns.length === expectedRoutes.size,
  "fixture must cover every bounded pattern family",
);
for (const pattern of response.patterns) {
  expect(
    expectedRoutes.get(pattern.family) === pattern.result.kind,
    `${pattern.family} result route drifted`,
  );
  expect(pattern.support_count >= 2, `${pattern.family} lacks bounded support`);
  expect(
    pattern.result.will_never_change.length > 0,
    `${pattern.family} lacks a never-change boundary`,
  );
  if (
    pattern.result.kind === "checkin_prompt" ||
    pattern.result.kind === "caution"
  ) {
    expect(pattern.result.mutation === "none", `${pattern.family} can mutate`);
    expect(
      pattern.result.confirmation_required === false,
      `${pattern.family} unexpectedly requires confirmation`,
    );
  }
}

const scoring = response.patterns.find(
  (pattern) => pattern.family === "heavy_calendar_misses",
);
expect(scoring, "missing scoring fixture");
const confirmedPreference = buildConfirmedPatternPreference(
  scoring,
  "2026-07-23T12:00:00.000Z",
);
expect(
  confirmedPreference.userConfirmed &&
    confirmedPreference.type === "busy_day_preference",
  "scoring confirmation did not produce a bounded preference",
);

const schedule = response.patterns.find(
  (pattern) => pattern.family === "specific_day_skips",
);
expect(schedule, "missing schedule fixture");
const review = buildPreferredDayPatternDraft(
  schedule,
  ["mon", "wed", "fri", "sat"],
  4,
);
const goal: Goal = {
  goal_type: "race",
  race_distance: "10k",
  target_date: "2026-11-15",
  experience_level: "intermediate",
  current_prs: {},
  weekly_mileage: 25,
};
const profile: UserProfile = {
  ...emptyProfile(),
  experience_level: "intermediate",
  weekly_mileage: 25,
  preferred_training_days: ["tue", "thu", "sat", "sun"],
};
const savedPlan: SavedPlan = {
  planStart: "2026-07-20T00:00:00.000Z",
  goalSig: planSignature(goal, profile),
  weeks: applyPreferredDays(
    generateTrainingPlan(goal),
    profile.preferred_training_days,
  ),
  reasoning: [],
  easyOnlyDays: [],
  savedAt: "2026-07-20T00:00:00.000Z",
};
const before = JSON.stringify({ goal, profile, savedPlan });
const validation = validateIntakeDraft(
  review.draft,
  review.sourceText,
  "2026-07-23",
  goal,
  savedPlan,
);
expect(validation.valid, validation.errors.join(" "));
expect(
  JSON.stringify({ goal, profile, savedPlan }) === before,
  "review-time validation mutated existing state",
);
const confirmedState = buildConfirmedIntakeState({
  draft: review.draft,
  sourceText: review.sourceText,
  today: "2026-07-23",
  currentGoal: goal,
  currentProfile: profile,
  currentPlan: savedPlan,
});
expect(
  confirmedState.profile.preferred_training_days.join(",") ===
    "mon,wed,fri,sat",
  "confirmed schedule review did not update preferred-day inputs",
);
expect(
  confirmedState.savedPlan?.weeks.every(
    (week) =>
      new Set(week.workouts.map((workout) => workout.day)).size ===
      week.workouts.length,
  ),
  "deterministic regeneration produced duplicate workout days",
);
expect(
  JSON.stringify({ goal, profile, savedPlan }) === before,
  "confirmed-state construction mutated existing state",
);

expectThrows(
  () =>
    buildPreferredDayPatternDraft(
      schedule,
      ["tue", "wed", "fri", "sat"],
      4,
    ),
  "avoid-day review accepted the observed skipped day",
);
expectThrows(
  () => buildConfirmedPatternPreference(schedule),
  "schedule pattern entered the scoring-preference path",
);

for (const mutate of [
  (value: Record<string, unknown>) => {
    value.contract_version = "behavior-pattern-result.v2";
  },
  (value: Record<string, unknown>) => {
    const patterns = value.patterns as Array<Record<string, unknown>>;
    (patterns[0].result as Record<string, unknown>).mutation = "saved_plan";
  },
  (value: Record<string, unknown>) => {
    const patterns = value.patterns as Array<Record<string, unknown>>;
    (patterns[5].result as Record<string, unknown>).mutation =
      "confirmed_preference";
  },
  (value: Record<string, unknown>) => {
    const patterns = value.patterns as Array<Record<string, unknown>>;
    patterns[6].support_count = 1;
  },
]) {
  const malformed = structuredClone(fixture.response) as Record<string, unknown>;
  mutate(malformed);
  expectThrows(
    () => parseBehaviorInsightsResponse(malformed),
    "malformed behavior result response was accepted",
  );
}

expect(
  fixture.failure_cases.map((item) => item.id).join(",") ===
    "timeout,ai_unavailable,malformed_ai,invalid_ai,unsupported_ai",
  "fixture failure taxonomy drifted",
);
expect(
  fixture.privacy_forbidden_audit_keys.every(
    (key) =>
      ![
        "platform",
        "action",
        "outcome",
        "pattern_family",
        "result_kind",
        "mutation_state",
        "deterministic_validation",
        "source",
      ].includes(key),
  ),
  "privacy fixture allows a forbidden telemetry key",
);

console.log(
  "OK - behavior-pattern-result.v1 covers every bounded route, review-only validation, deterministic confirmation, malformed response rejection, and privacy keys",
);

function expectThrows(run: () => unknown, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  expect(threw, message);
}
