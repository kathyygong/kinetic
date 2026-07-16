import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertMobileTodayCache,
  assertMobileTodaySnapshot,
  assertNoForbiddenMobileTodayKeys,
  buildMobileTodayRequest,
  classifyMobileTodayHttpFailure,
  createMobileTodayCache,
  createMobileTodaySnapshot,
  parseDecisionResponse,
  resolveMobileTodayCacheState,
  resolveMobileTodayLoad,
  type DecisionResponse,
  type MobileTodayBuildContext,
} from "../lib/mobileTodayContract";

const NOW = new Date("2026-07-16T12:00:00.000Z");

const BACKEND_RESPONSE = {
  decision: {
    state: "fatigued",
    recovery_score: 0.62,
    selected_action: {
      name: "modify",
      description: "Reduce duration while preserving an aerobic stimulus.",
      intensity_modifier: 0.85,
      duration_modifier: 0.7,
    },
    final_workout: "40 min tempo run (intensity x0.85, duration x0.70) capped at 30 min",
    confidence: 0.66,
    available_minutes: 30,
    key_factors: [
      "HRV is near the recent baseline",
      "Calendar availability limits the session to 30 minutes",
    ],
    alternatives: [
      {
        name: "proceed",
        description: "Run the planned workout.",
        intensity_modifier: 1,
        duration_modifier: 1,
      },
      {
        name: "rest",
        description: "Take a recovery day.",
        intensity_modifier: 0,
        duration_modifier: 0,
      },
    ],
    scores: {
      proceed: 0.51,
      modify: 0.74,
      rest: 0.42,
    },
    decision_trace: [
      "Calendar availability: caller-authoritative 30 min (server lookup skipped).",
      "Selected modify after deterministic scoring.",
    ],
    staleness_warnings: [],
  },
  ai_reasoning: null,
  reasoning_available: false,
};

type Fixture = ReturnType<typeof buildFixture>;

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function expectJsonEqual(actual: unknown, expected: unknown, label: string) {
  expect(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} did not match the canonical fixture`,
  );
}

function buildContext(): MobileTodayBuildContext {
  return {
    profile: {
      full_name: "Fixture Runner",
      email: "fixture@example.com",
      experience_level: "intermediate",
      weekly_mileage: 25,
      preferred_training_days: ["mon", "wed", "thu", "sun"],
      personal_bests: { "5k": 1500 },
      connected_services: {
        google_calendar: {
          connected: true,
          last_synced_at: "2026-07-16T10:00:00.000Z",
        },
        apple_health: {
          connected: true,
          last_synced_at: "2026-07-16T10:00:00.000Z",
        },
        garmin: { connected: false },
        oura: { connected: false },
      },
      onboarding_completed: true,
    },
    goal: {
      goal_type: "race",
      race_distance: "10k",
      target_date: "2026-09-20",
      experience_level: "intermediate",
      current_prs: { "5k": 1500 },
      weekly_mileage: 25,
    },
    savedPlan: {
      planStart: "2026-07-13",
      goalSig: "mobile-today-fixture",
      weeks: [
        {
          weekNumber: 1,
          phase: "build",
          workouts: [
            {
              day: "Mon",
              type: "easy",
              distance: 4,
              pace: 8.5,
              duration: 34,
            },
            {
              day: "Wed",
              type: "intervals",
              distance: 5,
              pace: 7.4,
              duration: 37,
            },
            {
              day: "Thu",
              type: "tempo",
              distance: 5,
              pace: 7.7,
              duration: 40,
            },
          ],
        },
      ],
      reasoning: [],
      easyOnlyDays: [],
      savedAt: "2026-07-13T09:00:00.000Z",
    },
    readinessLog: {
      entries: {
        "2026-07-15": {
          date: "2026-07-15",
          sleep_hours: 7.2,
          hrv: 50,
          resting_hr: 51,
          source: "healthkit",
          updated_at: "2026-07-15T10:00:00.000Z",
        },
        "2026-07-16": {
          date: "2026-07-16",
          sleep_hours: 7.5,
          hrv: 54,
          resting_hr: 49,
          fatigue_level: 2,
          soreness_level: 1,
          source: "mixed",
          updated_at: "2026-07-16T10:00:00.000Z",
        },
      },
    },
    healthSync: {
      provider: "apple_health",
      schema: "health-sync.v1",
      permission_state: "granted",
      metric_permissions: {
        sleep: "granted",
        hrv: "granted",
        resting_hr: "granted",
      },
      last_attempted_sync_at: "2026-07-16T10:00:00.000Z",
      last_successful_sync_at: "2026-07-16T10:00:00.000Z",
      latest_readiness_date: "2026-07-16",
      background_delivery: "enabled",
      daily_status: {
        "2026-07-16": {
          status: "synced",
          confidence: "high",
          coverage: {
            sleep: "complete",
            hrv: "complete",
            resting_hr: "complete",
          },
          conflict: "none",
        },
      },
      last_error_code: null,
    },
    calendar: {
      ageHours: 2,
      availableMinutesToday: 30,
      unhealthy: false,
    },
    learnedPreferences: [
      {
        id: "pref-busy",
        type: "busy_day_preference",
        description: "Fixture free text must not cross the mobile contract.",
        confidence: "high",
        userConfirmed: true,
        createdAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: "pref-unconfirmed",
        type: "intensity_tolerance",
        description: "Tentative preference",
        confidence: "moderate",
        userConfirmed: false,
        createdAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    workoutLog: [
      {
        weekNumber: 1,
        day: "Mon",
        status: "completed",
        scheduledDate: "2026-07-13",
        loggedAt: "2026-07-13T13:00:00.000Z",
        acceptedAdjustment: false,
      },
      {
        weekNumber: 1,
        day: "Wed",
        status: "completed",
        scheduledDate: "2026-07-15",
        loggedAt: "2026-07-15T13:00:00.000Z",
        acceptedAdjustment: false,
      },
      {
        weekNumber: 1,
        day: "Thu",
        status: "skipped",
        scheduledDate: "2026-07-09",
        loggedAt: "2026-07-09T13:00:00.000Z",
        acceptedAdjustment: true,
      },
    ],
    now: NOW,
    localDay: "2026-07-16",
  };
}

function buildFixture() {
  const build = buildMobileTodayRequest(buildContext());
  if (!build.ok) throw new Error(`fixture context failed: ${build.failure.code}`);
  const response = parseDecisionResponse(BACKEND_RESPONSE);
  const snapshot = createMobileTodaySnapshot(build.contract, response, NOW);
  const cache = createMobileTodayCache(snapshot, NOW);
  return {
    request_contract: build.contract,
    backend_response: BACKEND_RESPONSE,
    expected_snapshot: snapshot,
    cache_envelope: cache,
  };
}

function loadFixture(): Fixture {
  const path = resolve(
    process.cwd(),
    "../ios/KineticCompanion/Tests/Fixtures/mobile-today-contract.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

function expectBuildFailure(
  context: MobileTodayBuildContext,
  code: string,
) {
  const result = buildMobileTodayRequest(context);
  expect(!result.ok && result.failure.code === code, `expected ${code}`);
}

function main() {
  if (process.argv.includes("--print-fixture")) {
    console.log(JSON.stringify(buildFixture(), null, 2));
    return;
  }

  const canonical = loadFixture();
  const generated = buildFixture();
  expectJsonEqual(generated, canonical, "mobile Today fixture");
  assertNoForbiddenMobileTodayKeys(canonical.request_contract);
  assertMobileTodaySnapshot(canonical.expected_snapshot);
  assertMobileTodayCache(canonical.cache_envelope);

  const context = buildContext();
  expectBuildFailure({ ...context, goal: null }, "missing_goal");
  expectBuildFailure({ ...context, savedPlan: null }, "missing_plan");
  expectBuildFailure({ ...context, readinessLog: null }, "missing_readiness");

  const noCalendar = buildMobileTodayRequest({ ...context, calendar: null });
  expect(noCalendar.ok, "missing calendar must still produce a safe request");
  if (noCalendar.ok) {
    expect(
      noCalendar.contract.metadata.calendar_state === "missing" &&
        noCalendar.contract.metadata.availability_source ===
          "planned_workout_fallback",
      "missing calendar must use the explicit planned-workout fallback",
    );
    expect(
      noCalendar.contract.request.data_freshness.calendar_age_hours === null &&
        noCalendar.contract.request.constraints.calendar_authoritative === true,
      "missing calendar must remain visible and must not trigger a server default",
    );
  }

  const zeroWindow = buildMobileTodayRequest({
    ...context,
    calendar: { ageHours: 1, availableMinutesToday: 0 },
  });
  expect(
    zeroWindow.ok &&
      zeroWindow.contract.request.constraints.available_minutes === 0 &&
      zeroWindow.contract.metadata.calendar_state === "conflict",
    "a real zero-minute window must survive the contract",
  );

  const invalidAction = structuredClone(BACKEND_RESPONSE);
  invalidAction.decision.selected_action.name = "sprint";
  let rejected = false;
  try {
    parseDecisionResponse(invalidAction);
  } catch {
    rejected = true;
  }
  expect(rejected, "unsupported deterministic actions must be rejected");

  const malformedAi = structuredClone(BACKEND_RESPONSE) as Record<
    string,
    unknown
  >;
  malformedAi.ai_reasoning = { summary: "missing required fields" };
  const parsedMalformedAi: DecisionResponse = parseDecisionResponse(malformedAi);
  expect(
    parsedMalformedAi.ai_reasoning === null &&
      parsedMalformedAi.reasoning_available === false,
    "malformed AI copy must be dropped without invalidating the decision",
  );

  const unsafe = structuredClone(canonical.request_contract) as Record<
    string,
    unknown
  >;
  unsafe.email = "should-not-cross@example.com";
  rejected = false;
  try {
    assertNoForbiddenMobileTodayKeys(unsafe);
  } catch {
    rejected = true;
  }
  expect(rejected, "identity fields must fail mobile Today privacy validation");

  const verbosePreference = structuredClone(
    canonical.request_contract,
  ) as typeof canonical.request_contract & {
    request: {
      learned_preferences: Array<Record<string, unknown>>;
    };
  };
  verbosePreference.request.learned_preferences[0].description =
    "free text must stay out";
  rejected = false;
  try {
    assertNoForbiddenMobileTodayKeys(verbosePreference);
  } catch {
    rejected = true;
  }
  expect(
    rejected,
    "free-text preference descriptions must fail mobile Today privacy validation",
  );

  expect(
    resolveMobileTodayCacheState(
      canonical.cache_envelope,
      "2026-07-16T14:00:00.000Z",
    ) === "fresh",
    "same-day cache should initially be fresh",
  );
  expect(
    resolveMobileTodayCacheState(
      canonical.cache_envelope,
      "2026-07-16T20:00:00.000Z",
    ) === "stale",
    "same-day cache should visibly become stale",
  );
  expect(
    resolveMobileTodayCacheState(
      canonical.cache_envelope,
      "2026-07-17T12:00:00.000Z",
    ) === "expired",
    "a prior-day Today decision must never be reused",
  );

  expect(
    resolveMobileTodayLoad({
      live: canonical.expected_snapshot,
      cache: canonical.cache_envelope,
      now: NOW,
    }).source === "live",
    "live deterministic output must win",
  );
  const cachedLoad = resolveMobileTodayLoad({
    cache: canonical.cache_envelope,
    failure: "offline",
    now: "2026-07-16T20:00:00.000Z",
  });
  expect(
    cachedLoad.source === "cache" &&
      cachedLoad.cache_state === "stale" &&
      cachedLoad.failure === "offline",
    "offline failure must degrade to a labeled same-day cache",
  );
  expect(
    resolveMobileTodayLoad({
      cache: canonical.cache_envelope,
      failure: "backend_unavailable",
      now: "2026-07-17T12:00:00.000Z",
    }).source === "fallback",
    "expired cache must degrade to the safe fallback state",
  );

  expect(
    classifyMobileTodayHttpFailure(401) === "auth_required" &&
      classifyMobileTodayHttpFailure(504) === "timeout" &&
      classifyMobileTodayHttpFailure(503) === "backend_unavailable" &&
      classifyMobileTodayHttpFailure(422) === "invalid_response",
    "HTTP failures must map to stable mobile states",
  );

  console.log(
    "OK - mobile Today request, response, cache, failure, and privacy contracts validated",
  );
}

main();
