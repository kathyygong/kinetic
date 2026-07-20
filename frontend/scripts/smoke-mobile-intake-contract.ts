import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { IntakeDraft } from "../lib/api";
import {
  MOBILE_INTAKE_SCHEMA,
  assertNoForbiddenMobileIntakeResponseKeys,
  buildMobileIntakeAuditProperties,
  buildMobileIntakeRequest,
  classifyMobileIntakeClientFailure,
  classifyMobileIntakeHttpFailure,
  parseMobileIntakeResponse,
  type MobileIntakeDraftKind,
  type MobileIntakeResponse,
  type MobileIntakeRoute,
} from "../lib/mobileIntakeContract";
import { emptyProfile } from "../lib/profileStorage";
import type { Goal } from "../lib/types";

type Fixture = {
  contract_schema: string;
  context: MobileIntakeResponseFixtureContext;
  route_cases: Array<{
    id: string;
    text: string;
    expected_route: MobileIntakeRoute;
    expected_draft_kind?: MobileIntakeDraftKind;
    expected_reason?: "unsupported" | "unsafe";
    mutable: boolean;
  }>;
  failure_cases: Array<{
    id: string;
    kind: string;
    status?: number;
    expected_failure: string;
    safe_route?: MobileIntakeRoute;
  }>;
  privacy_forbidden_audit_keys: string[];
};

type MobileIntakeResponseFixtureContext = {
  today: string;
  current_goal: {
    race_distance: "5k" | "10k" | "half" | "marathon";
    target_date: string;
    weekly_mileage: number;
  };
  current_profile: {
    experience_level: "beginner" | "intermediate" | "advanced";
    preferred_training_days: Array<
      "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
    >;
  };
  decision: {
    selected_action: "proceed" | "modify" | "rest" | "unknown";
    readiness_state: "ready" | "caution" | "unknown" | "stale";
    calendar_state: "clear" | "conflict" | "stale" | "missing";
    confidence_bucket: "low" | "moderate" | "high" | "unknown";
    staleness_warning_count: number;
  };
};

function expect(condition: unknown, message: string): void {
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
      "mobile-intake-contract.json",
    ),
    "utf8",
  ),
) as Fixture;

expect(
  fixture.contract_schema === MOBILE_INTAKE_SCHEMA,
  "canonical mobile intake fixture schema drifted",
);

for (const testCase of fixture.route_cases) {
  const response = responseFor(testCase);
  const parsed = parseMobileIntakeResponse(response);
  expect(
    parsed.outcome.route === testCase.expected_route,
    `${testCase.id} route did not validate`,
  );
  expect(
    parsed.outcome.mutable === testCase.mutable,
    `${testCase.id} mutable boundary drifted`,
  );
  if (
    testCase.expected_draft_kind &&
    parsed.outcome.route === "review_draft"
  ) {
    expect(
      parsed.outcome.draft_kinds.includes(testCase.expected_draft_kind),
      `${testCase.id} draft kind did not validate`,
    );
    expect(
      parsed.outcome.review_required &&
        parsed.outcome.confirmation_required &&
        parsed.outcome.deterministic_validation_required,
      `${testCase.id} must require review, confirmation, and validation`,
    );
  }
  const audit = buildMobileIntakeAuditProperties({
    action: "routed",
    response: parsed,
    latencyMs: 512,
  });
  const auditJson = JSON.stringify(audit);
  expect(audit.route === testCase.expected_route, `${testCase.id} audit route drifted`);
  for (const forbidden of fixture.privacy_forbidden_audit_keys) {
    expect(
      !auditJson.includes(`"${forbidden}"`),
      `${testCase.id} audit leaked ${forbidden}`,
    );
  }
}

const goal: Goal = {
  goal_type: "race",
  race_distance: fixture.context.current_goal.race_distance,
  target_date: fixture.context.current_goal.target_date,
  experience_level: fixture.context.current_profile.experience_level,
  current_prs: {},
  weekly_mileage: fixture.context.current_goal.weekly_mileage,
};
const boundedRequest = buildMobileIntakeRequest({
  text: " Tuesday I only have 30 minutes. ",
  today: fixture.context.today,
  goal,
  profile: {
    ...emptyProfile(),
    full_name: "Private Runner",
    email: "private@example.com",
    experience_level: fixture.context.current_profile.experience_level,
    preferred_training_days:
      fixture.context.current_profile.preferred_training_days,
  },
  decision: fixture.context.decision,
});
const requestJson = JSON.stringify(boundedRequest);
expect(
  boundedRequest.text === "Tuesday I only have 30 minutes.",
  "mobile request should trim its transient note",
);
for (const forbidden of [
  "full_name",
  "email",
  "uid",
  "token",
  "sleep_hours",
  "hrv",
  "resting_hr",
]) {
  expect(!requestJson.includes(forbidden), `request leaked ${forbidden}`);
}

for (const failure of fixture.failure_cases) {
  if (failure.kind !== "http" || failure.status === undefined) continue;
  expect(
    classifyMobileIntakeHttpFailure(failure.status) === failure.expected_failure,
    `${failure.id} HTTP mapping drifted`,
  );
}
expect(
  classifyMobileIntakeClientFailure(
    new DOMException("deadline", "AbortError"),
  ) === "timeout",
  "client timeout mapping drifted",
);
expect(
  classifyMobileIntakeClientFailure(new TypeError("offline")) === "offline",
  "offline mapping drifted",
);
const timeoutAudit = buildMobileIntakeAuditProperties({
  action: "failed",
  failure: "timeout",
  latencyMs: 30_000,
});
expect(
  timeoutAudit.outcome === "timeout" &&
    timeoutAudit.route === "none" &&
    timeoutAudit.mutation_state === "not_requested",
  "timeout audit mapping drifted",
);

expectThrows(
  () =>
    parseMobileIntakeResponse({
      ...responseFor(fixture.route_cases[0]),
      mutation_performed: true,
    }),
  "a routing response cannot report mutation",
);
expectThrows(
  () =>
    parseMobileIntakeResponse({
      ...responseFor(fixture.route_cases[0]),
      raw_note: "private note",
    }),
  "malformed response keys must be rejected",
);
expectThrows(
  () =>
    assertNoForbiddenMobileIntakeResponseKeys({
      schema_version: MOBILE_INTAKE_SCHEMA,
      outcome: { route: "clarification" },
      uid: "private",
    }),
  "identity keys must be rejected",
);

console.log(
  "OK - canonical mobile intake routes, failures, strict validation, and request privacy are deterministic",
);

function responseFor(
  testCase: Fixture["route_cases"][number],
): MobileIntakeResponse {
  const parser: MobileIntakeResponse["parser"] = {
    source:
      testCase.expected_route === "review_draft"
        ? "deterministic"
        : "deterministic_router",
    ai_attempted: false,
    fallback_used: testCase.expected_route === "review_draft",
    failure: "none",
  };
  const base = {
    schema_version: MOBILE_INTAKE_SCHEMA,
    mutation_performed: false as const,
    parser,
  };
  if (testCase.expected_route === "review_draft") {
    return {
      ...base,
      outcome: {
        route: "review_draft",
        mutable: true,
        draft_kinds: [testCase.expected_draft_kind ?? "availability"],
        review_required: true,
        confirmation_required: true,
        deterministic_validation_required: true,
        draft: draftFor(testCase.expected_draft_kind ?? "availability"),
      },
    };
  }
  if (testCase.expected_route === "perceived_recovery") {
    return {
      ...base,
      outcome: {
        route: "perceived_recovery",
        mutable: false,
        destination: "perceived_recovery_capture",
        fields_to_capture: [
          "perceived_recovery",
          "fatigue",
          "soreness",
          "sleep_correction",
        ],
        inferred_values: false,
        persistence_available: false,
      },
    };
  }
  if (testCase.expected_route === "caution") {
    return {
      ...base,
      outcome: {
        route: "caution",
        mutable: false,
        destination: "conservative_caution",
        actions: [
          "stop_or_reduce",
          "capture_discomfort_flag",
          "seek_qualified_care",
        ],
        diagnosis_provided: false,
        pain_severity_inferred: false,
        clearance_provided: false,
      },
    };
  }
  if (testCase.expected_route === "missed_workout") {
    return {
      ...base,
      outcome: {
        route: "missed_workout",
        mutable: false,
        destination: "missed_workout_choices",
        choices: ["mark_skipped", "reschedule", "rebalance"],
        completion_inferred: false,
        persistence_available: false,
      },
    };
  }
  if (testCase.expected_route === "reflection") {
    return {
      ...base,
      outcome: {
        route: "reflection",
        mutable: false,
        destination: "post_workout_capture",
        fields_to_capture: ["completion", "perceived_effort"],
        completion_inferred: false,
        effort_inferred: false,
        persistence_available: false,
      },
    };
  }
  if (testCase.expected_route === "explanation") {
    return {
      ...base,
      outcome: {
        route: "explanation",
        mutable: false,
        destination: "deterministic_explanation",
        template: "today_decision_trace",
        facts: {
          selected_action: fixture.context.decision.selected_action,
          readiness_state: fixture.context.decision.readiness_state,
          calendar_state: fixture.context.decision.calendar_state,
          confidence_bucket: fixture.context.decision.confidence_bucket,
          has_staleness_warning:
            fixture.context.decision.staleness_warning_count > 0,
        },
        generated_prose: false,
      },
    };
  }
  if (testCase.expected_route === "clarification") {
    return {
      ...base,
      outcome: {
        route: "clarification",
        mutable: false,
        reason: "ambiguous",
        choices: [
          "schedule",
          "recovery",
          "pain_or_injury",
          "missed_workout",
          "post_workout",
          "explanation",
        ],
      },
    };
  }
  return {
    ...base,
    outcome: {
      route: "refusal",
      mutable: false,
      reason: testCase.expected_reason ?? "unsupported",
      safe_next_action:
        testCase.expected_reason === "unsafe"
          ? "seek_qualified_care"
          : "use_supported_intake",
    },
  };
}

function draftFor(kind: MobileIntakeDraftKind): IntakeDraft {
  const base: IntakeDraft = {
    status: "ready",
    summary: "One proposed change for review.",
    goal_changes: [],
    schedule_changes: [],
    availability_changes: [],
    preference_changes: [],
    workout_swap_changes: [],
    grounding: [],
    warnings: [],
  };
  if (kind === "goal") {
    base.goal_changes.push({
      id: "goal-mileage",
      field: "weekly_mileage",
      value: 30,
    });
  } else if (kind === "preferred_day") {
    base.schedule_changes.push({
      id: "schedule-days",
      field: "preferred_training_days",
      value: ["mon", "sat"],
    });
  } else if (kind === "workout_swap") {
    base.workout_swap_changes.push({
      id: "workout-swap-tue-thu",
      from_day: "tue",
      to_day: "thu",
    });
  } else {
    base.availability_changes.push({
      id: "availability-tue",
      day: "tue",
      available_minutes: kind === "schedule" ? 0 : 30,
      easy_only: kind === "travel",
    });
  }
  base.grounding = allChanges(base).map((change) => ({
    change_id: change.id,
    evidence: "bounded evidence",
  }));
  return base;
}

function allChanges(draft: IntakeDraft): Array<{ id: string }> {
  return [
    ...draft.goal_changes,
    ...draft.schedule_changes,
    ...draft.availability_changes,
    ...draft.preference_changes,
    ...draft.workout_swap_changes,
  ];
}

function expectThrows(fn: () => void, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  expect(threw, message);
}
